const { spawn } = require('child_process');
const Fastify = require('fastify');

const PORT = parseInt(process.env.PORT || '3002', 10);
const ALLOWED_MODELS = ['haiku', 'sonnet', 'opus'];
const DEFAULT_MODEL = 'sonnet';
const MAX_CONCURRENT = 3;
const TIMEOUT_MS = 600_000; // 10 minutes (cartographer + tool use)

let active = 0;

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

// ---------------------------------------------------------------------------
// One-shot prompt: returns full output as JSON when claude exits.
// (Kept for backwards compatibility with non-streaming callers.)
// ---------------------------------------------------------------------------
app.post('/prompt', async (request, reply) => {
  const { systemPrompt, userPrompt, model } = request.body || {};

  if (!userPrompt && !systemPrompt) {
    return reply.status(400).send({ error: 'systemPrompt or userPrompt required' });
  }

  const selectedModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;

  if (active >= MAX_CONCURRENT) {
    return reply.status(503).send({ error: 'Too many concurrent requests' });
  }

  active++;
  try {
    const output = await runClaudeBuffered({ systemPrompt, userPrompt, model: selectedModel });
    return { output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err: message }, 'Claude Code failed');
    return reply.status(500).send({ error: message });
  } finally {
    active--;
  }
});

// ---------------------------------------------------------------------------
// Streaming prompt: pipes claude `--output-format stream-json` line-by-line
// to the caller as chunked NDJSON. Caller reads each line as it arrives.
// ---------------------------------------------------------------------------
app.post('/prompt-stream', async (request, reply) => {
  const {
    systemPrompt,
    userPrompt,
    model,
    cwd,
    allowedTools,    // string array, e.g. ["Read","Grep","Glob"]
    maxTurns         // integer
  } = request.body || {};

  if (!userPrompt && !systemPrompt) {
    return reply.status(400).send({ error: 'systemPrompt or userPrompt required' });
  }

  const selectedModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;

  if (active >= MAX_CONCURRENT) {
    return reply.status(503).send({ error: 'Too many concurrent requests' });
  }

  active++;

  // Take over the raw response so fastify doesn't auto-close it when this
  // handler returns. We end the response manually in proc 'close'/'error'.
  reply.hijack();

  reply.raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked'
  });

  // Send an immediate keepalive line so the HTTP client doesn't treat the
  // 200 with empty body as EOF before claude produces its first chunk.
  reply.raw.write(JSON.stringify({ type: 'cc_started' }) + '\n');

  const args = [
    '--print',
    '--model', selectedModel,
    '--output-format', 'stream-json',
    '--verbose'
  ];

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }
  if (Array.isArray(allowedTools) && allowedTools.length > 0) {
    args.push('--allowedTools', allowedTools.join(','));
  }
  if (Number.isInteger(maxTurns) && maxTurns > 0) {
    args.push('--max-turns', String(maxTurns));
  }

  args.push(userPrompt);

  const spawnCwd = cwd && typeof cwd === 'string' ? cwd : process.cwd();
  request.log.info(
    {
      cwd: spawnCwd,
      argsLen: args.length,
      argsPreview: args.slice(0, 6),
      hasOauth: !!process.env.CLAUDE_CODE_OAUTH_TOKEN,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY
    },
    'spawning claude'
  );

  const proc = spawn('claude', args, {
    env: { ...process.env, HOME: '/host' },
    cwd: spawnCwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  request.log.info({ pid: proc.pid }, 'claude spawned');

  let stderrBuf = '';
  let stdoutBytes = 0;
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString('utf-8');
    request.log.warn({ stderr: chunk.toString('utf-8').slice(0, 300) }, 'claude stderr');
  });

  // Buffer stdout into lines so each chunked write is a complete JSON line
  let stdoutBuf = '';
  proc.stdout.on('data', (chunk) => {
    stdoutBytes += chunk.length;
    stdoutBuf += chunk.toString('utf-8');
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line.length > 0) {
        reply.raw.write(line + '\n');
      }
    }
  });

  const timer = setTimeout(() => {
    proc.kill('SIGTERM');
  }, TIMEOUT_MS);

  proc.on('close', (code, signal) => {
    clearTimeout(timer);
    active--;
    request.log.info(
      { code, signal, stdoutBytes, stderrLen: stderrBuf.length },
      'claude closed'
    );
    // Flush any trailing partial line
    const tail = stdoutBuf.trim();
    if (tail.length > 0) reply.raw.write(tail + '\n');
    // Append a synthetic terminator event so caller knows we're done
    reply.raw.write(
      JSON.stringify({
        type: 'cc_exit',
        exit_code: code ?? -1,
        signal: signal ?? null,
        stderr: stderrBuf.slice(-2000)
      }) + '\n'
    );
    reply.raw.end();
  });

  proc.on('error', (err) => {
    clearTimeout(timer);
    active--;
    reply.raw.write(
      JSON.stringify({ type: 'cc_error', error: err.message }) + '\n'
    );
    reply.raw.end();
  });

  // Cleanup on real client disconnect (the response socket being torn down).
  // NOTE: request.raw.on('close') fires on every successful request once the
  // request body half-closes (reqwest does FIN after POST body). That is NOT
  // a disconnect. Use reply.raw.on('close') with !writableEnded to detect
  // a true premature close from the caller.
  reply.raw.on('close', () => {
    if (reply.raw.writableEnded) return;
    if (!proc.killed) {
      request.log.warn({ pid: proc.pid }, 'response closed early, killing claude');
      proc.kill('SIGTERM');
    }
  });
});

function runClaudeBuffered({ systemPrompt, userPrompt, model }) {
  return new Promise((resolve, reject) => {
    const args = ['--print', '--model', model, '--output-format', 'text'];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    args.push(userPrompt);

    const proc = spawn('claude', args, {
      env: { ...process.env, HOME: '/host' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
    });

    const chunks = [];
    const errChunks = [];

    proc.stdout.on('data', (data) => chunks.push(data));
    proc.stderr.on('data', (data) => errChunks.push(data));

    proc.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf-8');
      if (code === 0) {
        resolve(stdout);
      } else {
        const stderr = Buffer.concat(errChunks).toString('utf-8');
        reject(new Error(`claude exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Claude Code timed out'));
    }, TIMEOUT_MS);
  });
}

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`Claude Code wrapper listening on :${PORT}`);
});
