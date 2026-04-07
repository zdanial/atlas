export interface Node {
  id: string;
  type: string;
  layer: number;
  projectId: string;
  parentId: string | null;
  title: string;
  body: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  status: string;
  positionX: number | null;
  positionY: number | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNode {
  type: string;
  layer: number;
  projectId: string;
  parentId?: string | null;
  title: string;
  body?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  status?: string;
  positionX?: number | null;
  positionY?: number | null;
}

export interface NodeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  weight: number;
  source: string;
  createdAt: Date;
}

export interface CreateEdge {
  sourceId: string;
  targetId: string;
  relationType: string;
  weight?: number;
  source?: string;
}

export interface NodeVersion {
  id: string;
  nodeId: string;
  version: number;
  body: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  diffSummary: string | null;
  author: string | null;
  createdAt: Date;
}

export interface AgentRun {
  id: string;
  agent: string;
  layer: number | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  model: string | null;
  tokens: number | null;
  cost: number | null;
  createdAt: Date;
}

export interface CreateAgentRun {
  agent: string;
  layer?: number | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  model?: string | null;
  tokens?: number | null;
  cost?: number | null;
}

export interface NodeFilter {
  projectId?: string;
  type?: string;
  layer?: number;
  status?: string;
  parentId?: string | null;
}

export interface Change {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface StorageAdapter {
  // Node CRUD
  getNode(id: string): Promise<Node | null>;
  listNodes(filter: NodeFilter): Promise<Node[]>;
  createNode(node: CreateNode): Promise<Node>;
  updateNode(id: string, patch: Partial<Node>): Promise<Node>;
  deleteNode(id: string): Promise<void>;

  // Edges
  getEdges(nodeId: string): Promise<NodeEdge[]>;
  createEdge(edge: CreateEdge): Promise<NodeEdge>;
  deleteEdge(id: string): Promise<void>;

  // Versions
  getVersions(nodeId: string): Promise<NodeVersion[]>;

  // Agent runs
  logAgentRun(run: CreateAgentRun): Promise<AgentRun>;

  // Search
  searchNodes(query: string, filter?: NodeFilter): Promise<Node[]>;

  // Sync (for local modes)
  getPendingChanges(): Promise<Change[]>;
  markSynced(changeIds: string[]): Promise<void>;
}
