import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiAdapter } from './api';
import type { StorageAdapter } from './adapter';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

function mockFetch(responses: Map<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const method = init?.method ?? 'GET';
    const key = `${method} ${urlStr}`;

    // Try exact match first, then prefix match
    let response = responses.get(key);
    if (!response) {
      for (const [pattern, resp] of responses) {
        if (key.startsWith(pattern) || urlStr.includes(pattern.split(' ')[1])) {
          response = resp;
          break;
        }
      }
    }

    if (!response) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: `No mock for ${key}` }),
        headers: new Headers(),
      } as unknown as Response;
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 204 ? 'No Content' : 'OK',
      json: async () => response!.body,
      headers: new Headers(),
    } as unknown as Response;
  });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:3001';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const NODE_ID = '660e8400-e29b-41d4-a716-446655440000';
const NODE_ID_2 = '770e8400-e29b-41d4-a716-446655440000';
const EDGE_ID = '880e8400-e29b-41d4-a716-446655440000';

const rawNode = {
  id: NODE_ID,
  type: 'idea',
  layer: 5,
  project_id: PROJECT_ID,
  parent_id: null,
  title: 'Test Idea',
  body: null,
  payload: null,
  status: 'active',
  position_x: null,
  position_y: null,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const rawEdge = {
  id: EDGE_ID,
  source_id: NODE_ID,
  target_id: NODE_ID_2,
  relation_type: 'supports',
  weight: 1.0,
  source: 'human',
  created_at: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiAdapter', () => {
  let adapter: StorageAdapter;
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    const responses = new Map<string, { status: number; body: unknown }>();

    // GET single node
    responses.set(`GET ${BASE_URL}/api/nodes/${NODE_ID}`, {
      status: 200,
      body: { node: rawNode },
    });

    // GET nonexistent node
    responses.set(`GET ${BASE_URL}/api/nodes/00000000-0000-0000-0000-000000000000`, {
      status: 404,
      body: { error: 'Node 00000000-0000-0000-0000-000000000000 not found' },
    });

    // LIST nodes
    responses.set(`GET ${BASE_URL}/api/nodes?project_id=${PROJECT_ID}`, {
      status: 200,
      body: { nodes: [rawNode] },
    });

    // LIST all nodes (no filter)
    responses.set(`GET ${BASE_URL}/api/nodes`, {
      status: 200,
      body: { nodes: [rawNode] },
    });

    // CREATE node
    responses.set(`POST ${BASE_URL}/api/nodes`, {
      status: 201,
      body: { node: rawNode },
    });

    // UPDATE node
    responses.set(`PATCH ${BASE_URL}/api/nodes/${NODE_ID}`, {
      status: 200,
      body: { node: { ...rawNode, title: 'Updated Title' } },
    });

    // DELETE node
    responses.set(`DELETE ${BASE_URL}/api/nodes/${NODE_ID}`, {
      status: 204,
      body: null,
    });

    // GET edges
    responses.set(`GET ${BASE_URL}/api/nodes/${NODE_ID}/edges`, {
      status: 200,
      body: { edges: [rawEdge] },
    });

    // CREATE edge
    responses.set(`POST ${BASE_URL}/api/nodes/${NODE_ID}/edges`, {
      status: 201,
      body: { edge: rawEdge },
    });

    // DELETE edge
    responses.set(`DELETE ${BASE_URL}/api/edges/${EDGE_ID}`, {
      status: 204,
      body: null,
    });

    // GET versions
    responses.set(`GET ${BASE_URL}/api/nodes/${NODE_ID}/versions`, {
      status: 200,
      body: { versions: [] },
    });

    // SEARCH nodes
    responses.set(`GET ${BASE_URL}/api/nodes/search`, {
      status: 200,
      body: { nodes: [rawNode] },
    });

    // POST agent run
    responses.set(`POST ${BASE_URL}/api/agent-runs`, {
      status: 201,
      body: {
        agent_run: {
          id: 'run-1',
          agent: 'connector',
          layer: null,
          input: null,
          output: null,
          model: 'gpt-4',
          tokens: 100,
          cost: 0.01,
          created_at: '2026-01-01T00:00:00Z',
        },
      },
    });

    fetchMock = mockFetch(responses);
    vi.stubGlobal('fetch', fetchMock);
    adapter = new ApiAdapter(BASE_URL);
  });

  it('implements StorageAdapter interface', () => {
    expect(adapter.getNode).toBeDefined();
    expect(adapter.listNodes).toBeDefined();
    expect(adapter.createNode).toBeDefined();
    expect(adapter.updateNode).toBeDefined();
    expect(adapter.deleteNode).toBeDefined();
    expect(adapter.getEdges).toBeDefined();
    expect(adapter.createEdge).toBeDefined();
    expect(adapter.deleteEdge).toBeDefined();
    expect(adapter.getVersions).toBeDefined();
    expect(adapter.logAgentRun).toBeDefined();
    expect(adapter.searchNodes).toBeDefined();
    expect(adapter.getPendingChanges).toBeDefined();
    expect(adapter.markSynced).toBeDefined();
  });

  it('getNode returns a node with camelCase fields', async () => {
    const node = await adapter.getNode(NODE_ID);
    expect(node).not.toBeNull();
    expect(node!.id).toBe(NODE_ID);
    expect(node!.projectId).toBe(PROJECT_ID);
    expect(node!.createdAt).toBeInstanceOf(Date);
    expect(node!.updatedAt).toBeInstanceOf(Date);
  });

  it('getNode returns null for 404', async () => {
    const node = await adapter.getNode('00000000-0000-0000-0000-000000000000');
    expect(node).toBeNull();
  });

  it('listNodes sends correct query params', async () => {
    const nodes = await adapter.listNodes({ projectId: PROJECT_ID });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].title).toBe('Test Idea');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`project_id=${PROJECT_ID}`),
      expect.anything(),
    );
  });

  it('createNode sends snake_case body', async () => {
    const node = await adapter.createNode({
      type: 'idea',
      layer: 5,
      projectId: PROJECT_ID,
      title: 'Test Idea',
    });
    expect(node.id).toBe(NODE_ID);

    // Verify the fetch call used snake_case
    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.project_id).toBe(PROJECT_ID);
    expect(body.projectId).toBeUndefined();
  });

  it('updateNode sends PATCH with snake_case', async () => {
    const node = await adapter.updateNode(NODE_ID, { title: 'Updated Title' });
    expect(node.title).toBe('Updated Title');

    const call = fetchMock.mock.calls[0];
    expect(call[1]?.method).toBe('PATCH');
  });

  it('deleteNode sends DELETE', async () => {
    await adapter.deleteNode(NODE_ID);
    const call = fetchMock.mock.calls[0];
    expect(call[1]?.method).toBe('DELETE');
  });

  it('getEdges returns edges with camelCase fields', async () => {
    const edges = await adapter.getEdges(NODE_ID);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceId).toBe(NODE_ID);
    expect(edges[0].targetId).toBe(NODE_ID_2);
    expect(edges[0].relationType).toBe('supports');
  });

  it('createEdge sends POST to sourceId node edges', async () => {
    const edge = await adapter.createEdge({
      sourceId: NODE_ID,
      targetId: NODE_ID_2,
      relationType: 'supports',
    });
    expect(edge.id).toBe(EDGE_ID);

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toContain(`/api/nodes/${NODE_ID}/edges`);
    const body = JSON.parse(call[1]?.body as string);
    expect(body.source_id).toBe(NODE_ID);
    expect(body.relation_type).toBe('supports');
  });

  it('deleteEdge sends DELETE to /api/edges/:id', async () => {
    await adapter.deleteEdge(EDGE_ID);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toContain(`/api/edges/${EDGE_ID}`);
  });

  it('getVersions returns versions', async () => {
    const versions = await adapter.getVersions(NODE_ID);
    expect(versions).toEqual([]);
  });

  it('logAgentRun creates agent run', async () => {
    const run = await adapter.logAgentRun({ agent: 'connector', model: 'gpt-4' });
    expect(run.agent).toBe('connector');
    expect(run.model).toBe('gpt-4');
    expect(run.createdAt).toBeInstanceOf(Date);
  });

  it('searchNodes sends query param', async () => {
    const nodes = await adapter.searchNodes('test');
    expect(nodes).toHaveLength(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toContain('/api/nodes/search?q=test');
  });

  it('getPendingChanges returns empty (server mode)', async () => {
    const changes = await adapter.getPendingChanges();
    expect(changes).toEqual([]);
  });

  it('markSynced is a no-op', async () => {
    await adapter.markSynced(['id1', 'id2']);
    // No fetch call expected
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
