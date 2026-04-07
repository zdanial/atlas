import { z } from 'zod';

// ---------------------------------------------------------------------------
// Node types and layers
// ---------------------------------------------------------------------------

export const NODE_TYPES = [
	'goal',
	'problem',
	'hypothesis',
	'idea',
	'constraint',
	'decision',
	'question',
	'risk',
	'insight',
	'reference',
	'bet',
	'note',
	'intent',
	'epic',
	'phase',
	'ticket'
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_LAYERS = [0, 1, 2, 3, 4, 5] as const;
export type NodeLayer = (typeof NODE_LAYERS)[number];

export const NODE_STATUSES = ['active', 'archived', 'draft', 'done'] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const RELATION_TYPES = [
	'supports',
	'contradicts',
	'blocks',
	'implements',
	'duplicates',
	'refines'
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

// ---------------------------------------------------------------------------
// Payload schemas per node type
// ---------------------------------------------------------------------------

export const canvasNotePayload = z.object({
	tags: z.array(z.string()),
	color: z.string().optional()
});
export type CanvasNotePayload = z.infer<typeof canvasNotePayload>;

export const intentPayload = z.object({
	targetOutcome: z.string(),
	deadline: z.string().optional(), // ISO date string
	timeHorizon: z.string().optional()
});
export type IntentPayload = z.infer<typeof intentPayload>;

export const epicPayload = z.object({
	prd: z.record(z.string(), z.unknown()), // RichText JSON
	techPlan: z.record(z.string(), z.unknown()),
	openQuestions: z.array(z.string()),
	wireframes: z.array(z.string()).optional()
});
export type EpicPayload = z.infer<typeof epicPayload>;

const fileChange = z.object({
	path: z.string(),
	action: z.string()
});

export const phasePayload = z.object({
	objective: z.string(),
	fileChanges: z.array(fileChange),
	archNotes: z.string(),
	verifyCriteria: z.array(z.string()),
	complexity: z.enum(['low', 'med', 'high']),
	contextBundle: z.array(z.string()) // UUIDs
});
export type PhasePayload = z.infer<typeof phasePayload>;

const repoFilePath = z.object({
	repoId: z.string(),
	path: z.string()
});

export const ticketPayload = z.object({
	intent: z.string(),
	filePaths: z.array(repoFilePath),
	acceptanceCriteria: z.array(z.string()),
	promptPayload: z.string(),
	recommendedAgent: z.string().optional(),
	repoId: z.string().optional()
});
export type TicketPayload = z.infer<typeof ticketPayload>;

/** Map from node type to its payload schema (only types with structured payloads). */
export const payloadSchemas: Partial<Record<NodeType, z.ZodType>> = {
	note: canvasNotePayload,
	intent: intentPayload,
	epic: epicPayload,
	phase: phasePayload,
	ticket: ticketPayload
};

// ---------------------------------------------------------------------------
// Node schemas
// ---------------------------------------------------------------------------

export const createNodeSchema = z.object({
	type: z.enum(NODE_TYPES),
	layer: z.number().int().min(0).max(5),
	projectId: z.string().uuid(),
	parentId: z.string().uuid().nullable().optional(),
	title: z.string().min(1),
	body: z.record(z.string(), z.unknown()).nullable().optional(),
	payload: z.record(z.string(), z.unknown()).nullable().optional(),
	status: z.enum(NODE_STATUSES).optional(),
	positionX: z.number().nullable().optional(),
	positionY: z.number().nullable().optional()
});
export type CreateNodeInput = z.infer<typeof createNodeSchema>;

export const updateNodeSchema = z.object({
	type: z.enum(NODE_TYPES).optional(),
	title: z.string().min(1).optional(),
	body: z.record(z.string(), z.unknown()).nullable().optional(),
	payload: z.record(z.string(), z.unknown()).nullable().optional(),
	status: z.enum(NODE_STATUSES).optional(),
	positionX: z.number().nullable().optional(),
	positionY: z.number().nullable().optional(),
	parentId: z.string().uuid().nullable().optional()
});
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;

export const createEdgeSchema = z.object({
	sourceId: z.string().uuid(),
	targetId: z.string().uuid(),
	relationType: z.enum(RELATION_TYPES),
	weight: z.number().optional(),
	source: z.enum(['human', 'ai']).optional()
});
export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a node's payload against the schema for its type.
 * Returns the parsed payload or throws a ZodError.
 */
export function validatePayload(type: NodeType, payload: unknown): unknown {
	const schema = payloadSchemas[type];
	if (!schema) return payload; // No schema for this type — passthrough
	return schema.parse(payload);
}

/**
 * Safe version that returns a result object instead of throwing.
 */
export function safeValidatePayload(type: NodeType, payload: unknown) {
	const schema = payloadSchemas[type];
	if (!schema) return { success: true as const, data: payload };
	return schema.safeParse(payload);
}
