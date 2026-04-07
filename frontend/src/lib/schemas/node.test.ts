import { describe, it, expect } from 'vitest';
import {
  createNodeSchema,
  updateNodeSchema,
  createEdgeSchema,
  canvasNotePayload,
  intentPayload,
  epicPayload,
  phasePayload,
  ticketPayload,
  validatePayload,
  safeValidatePayload,
  type NodeType,
} from './node';

// ---------------------------------------------------------------------------
// Payload schema tests
// ---------------------------------------------------------------------------

describe('canvasNotePayload', () => {
  it('accepts valid payload', () => {
    const result = canvasNotePayload.safeParse({ tags: ['ux', 'idea'], color: '#ff0000' });
    expect(result.success).toBe(true);
  });

  it('accepts without optional color', () => {
    const result = canvasNotePayload.safeParse({ tags: [] });
    expect(result.success).toBe(true);
  });

  it('rejects missing tags', () => {
    const result = canvasNotePayload.safeParse({ color: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string tags', () => {
    const result = canvasNotePayload.safeParse({ tags: [1, 2] });
    expect(result.success).toBe(false);
  });
});

describe('intentPayload', () => {
  it('accepts valid payload', () => {
    const result = intentPayload.safeParse({
      targetOutcome: 'Ship v1',
      deadline: '2026-06-01',
      timeHorizon: '3 months',
    });
    expect(result.success).toBe(true);
  });

  it('requires targetOutcome', () => {
    const result = intentPayload.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('epicPayload', () => {
  it('accepts valid payload', () => {
    const result = epicPayload.safeParse({
      prd: { type: 'doc', content: [] },
      techPlan: { type: 'doc', content: [] },
      openQuestions: ['How to handle auth?'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing prd', () => {
    const result = epicPayload.safeParse({
      techPlan: {},
      openQuestions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('phasePayload', () => {
  it('accepts valid payload', () => {
    const result = phasePayload.safeParse({
      objective: 'Implement auth',
      fileChanges: [{ path: 'src/auth.ts', action: 'create' }],
      archNotes: 'Use JWT tokens',
      verifyCriteria: ['All tests pass'],
      complexity: 'med',
      contextBundle: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid complexity', () => {
    const result = phasePayload.safeParse({
      objective: 'x',
      fileChanges: [],
      archNotes: '',
      verifyCriteria: [],
      complexity: 'extreme',
      contextBundle: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ticketPayload', () => {
  it('accepts valid payload', () => {
    const result = ticketPayload.safeParse({
      intent: 'Add login page',
      filePaths: [{ repoId: '550e8400-e29b-41d4-a716-446655440000', path: 'src/login.svelte' }],
      acceptanceCriteria: ['User can log in'],
      promptPayload: 'Create a login page with email/password fields',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing intent', () => {
    const result = ticketPayload.safeParse({
      filePaths: [],
      acceptanceCriteria: [],
      promptPayload: '',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createNodeSchema tests
// ---------------------------------------------------------------------------

describe('createNodeSchema', () => {
  const valid = {
    type: 'idea' as const,
    layer: 5,
    projectId: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Test idea',
  };

  it('accepts valid input', () => {
    const result = createNodeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid node type', () => {
    const result = createNodeSchema.safeParse({ ...valid, type: 'foobar' });
    expect(result.success).toBe(false);
  });

  it('rejects layer out of range', () => {
    const result = createNodeSchema.safeParse({ ...valid, layer: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid projectId', () => {
    const result = createNodeSchema.safeParse({ ...valid, projectId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects empty title', () => {
    const result = createNodeSchema.safeParse({ ...valid, title: '' });
    expect(result.success).toBe(false);
  });

  it('accepts all optional fields', () => {
    const result = createNodeSchema.safeParse({
      ...valid,
      parentId: '550e8400-e29b-41d4-a716-446655440000',
      body: { type: 'doc' },
      payload: { tags: [] },
      status: 'draft',
      positionX: 100.5,
      positionY: 200.0,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateNodeSchema tests
// ---------------------------------------------------------------------------

describe('updateNodeSchema', () => {
  it('accepts partial updates', () => {
    expect(updateNodeSchema.safeParse({ title: 'New' }).success).toBe(true);
    expect(updateNodeSchema.safeParse({ status: 'archived' }).success).toBe(true);
    expect(updateNodeSchema.safeParse({ positionX: 50 }).success).toBe(true);
  });

  it('accepts empty object (no-op patch)', () => {
    expect(updateNodeSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(updateNodeSchema.safeParse({ status: 'invalid' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createEdgeSchema tests
// ---------------------------------------------------------------------------

describe('createEdgeSchema', () => {
  const valid = {
    sourceId: '550e8400-e29b-41d4-a716-446655440000',
    targetId: '660e8400-e29b-41d4-a716-446655440000',
    relationType: 'supports' as const,
  };

  it('accepts valid edge', () => {
    expect(createEdgeSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid relation type', () => {
    expect(createEdgeSchema.safeParse({ ...valid, relationType: 'loves' }).success).toBe(false);
  });

  it('rejects non-uuid sourceId', () => {
    expect(createEdgeSchema.safeParse({ ...valid, sourceId: 'abc' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePayload / safeValidatePayload tests
// ---------------------------------------------------------------------------

describe('validatePayload', () => {
  it('validates note payload', () => {
    expect(() => validatePayload('note', { tags: ['a'] })).not.toThrow();
  });

  it('throws for invalid note payload', () => {
    expect(() => validatePayload('note', { tags: 123 })).toThrow();
  });

  it('passes through unknown types', () => {
    const data = { arbitrary: true };
    expect(validatePayload('goal' as NodeType, data)).toBe(data);
  });
});

describe('safeValidatePayload', () => {
  it('returns success for valid payload', () => {
    const result = safeValidatePayload('intent', { targetOutcome: 'Ship it' });
    expect(result.success).toBe(true);
  });

  it('returns failure for invalid payload', () => {
    const result = safeValidatePayload('intent', {});
    expect(result.success).toBe(false);
  });

  it('returns success for types without schemas', () => {
    const result = safeValidatePayload('goal', { anything: true });
    expect(result.success).toBe(true);
  });
});
