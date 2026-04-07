# Atlas — Time as a First-Class Citizen

Every view in Atlas is temporal. A timeline scrubber lets you move forward and backward in time, seeing the exact state of your canvas, roadmap, graph, or any node at any point in history. Time isn't an audit log you dig through — it's a dimension you navigate.

---

## Core Concept

```
┌─────────────────────────────────────────────────────────────────────┐
│  Canvas / Kanban / Graph / Roadmap / Any View                        │
│                                                                      │
│  [current state of the view, but frozen at scrubber position]        │
│                                                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  ◀ ────────────────────●──────────────── ▶   Apr 7 2026, 3:42pm     │
│    Jan 15    Feb 2    Mar 10   Apr 7                                 │
│              ▲         ▲        ▲                                    │
│          M1 started  Epic 3.2  Phase 2.1                             │
│                      compiled  shipped                               │
│                                                                      │
│  [▶ Play] [◀ Step] [Step ▶] [⟲ Now]          Speed: [1x ▾]         │
└──────────────────────────────────────────────────────────────────────┘
```

**What changes when you scrub:**
- **Canvas view:** Notes appear/disappear as they were created/deleted. Edges fade in as they were inferred. Note content shows its body at that point in time.
- **Kanban view:** Columns reflect the notes that existed at that moment, in the types they had then (a note may have been reclassified since).
- **Graph view:** The force-directed graph animates to show only nodes and edges that existed at the scrubber position.
- **Roadmap view:** Milestones and epics show their status at that time. You can see what the plan *looked like* three weeks ago vs now.
- **Lenses:** Origin/Impact lenses show the traceability chain as it existed at that point — a ticket that was later deleted still shows up at the time it existed.

**What doesn't change:** The scrubber is read-only. You can't edit the past. But you can copy a past state: "Restore this note to its March 10 version."

---

## Data Model: Event Sourcing

The existing `node_version` table already captures every edit. To make temporal navigation fast, we add an **event log** that records every mutation as a timestamped event.

```sql
-- Every state change in the system, ordered by time
CREATE TABLE event (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type    TEXT NOT NULL,
  -- Event types:
  --   node.created, node.updated, node.deleted
  --   edge.created, edge.deleted
  --   node.reclassified (type changed)
  --   node.moved (parent_id changed — e.g., note linked to intent)
  --   node.status_changed (active → paused, etc.)
  --   agent.classified (Connector assigned type)
  --   agent.inferred_edge (Connector created edge)
  --   compile.epic_from_cluster
  --   compile.phases_from_epic
  --   compile.tickets_from_phase
  --   pr.opened, pr.merged, pr.closed
  entity_type   TEXT NOT NULL,         -- 'node', 'edge', 'pr', 'agent_run'
  entity_id     UUID NOT NULL,
  before_state  JSONB,                 -- snapshot before change (null for creates)
  after_state   JSONB,                 -- snapshot after change (null for deletes)
  actor         TEXT,                  -- 'user', 'connector', 'synthesizer', etc.
  metadata      JSONB                  -- extra context (e.g., which agent run triggered this)
);

CREATE INDEX idx_event_project_time ON event(project_id, timestamp);
CREATE INDEX idx_event_entity ON event(entity_id, timestamp);
```

### Why Event Sourcing (not just node_version)

`node_version` captures body/payload changes per node. But temporal navigation needs to reconstruct the *entire graph state* at a point in time — which nodes existed, which edges connected them, what their types and statuses were. The event log gives us:

1. **Graph reconstruction:** Replay events up to timestamp T → full graph at time T
2. **Efficient scrubbing:** Pre-computed snapshots at intervals (hourly/daily) + replay from nearest snapshot
3. **Rich timeline:** Events have semantic types ("epic compiled from cluster") not just "field changed"
4. **Attribution:** Every event knows its actor (user vs which agent)

---

## Snapshots (Performance)

Replaying all events from the beginning is too slow for large projects. We use periodic snapshots:

```sql
CREATE TABLE snapshot (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES project(id),
  timestamp     TIMESTAMPTZ NOT NULL,
  -- Full graph state at this moment:
  nodes         JSONB NOT NULL,        -- array of all nodes
  edges         JSONB NOT NULL,        -- array of all edges
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_snapshot_project_time ON snapshot(project_id, timestamp);
```

**Snapshot strategy:**
- Auto-create a snapshot every hour (background job in Rust backend)
- Auto-create on significant events (milestone status change, epic compilation, PR merge)
- To reconstruct state at time T:
  1. Find nearest snapshot before T
  2. Replay events from snapshot.timestamp → T
  3. Apply each event's `before_state` / `after_state` to rebuild

**For browser-only mode (IndexedDB):** Same event log stored locally. Snapshots created less frequently (every 100 events or daily). Reconstruction happens client-side in a Web Worker to avoid blocking the UI.

---

## Rust Backend: Temporal Query API

```rust
// backend/src/routes/temporal.rs

/// Get full graph state at a specific point in time
/// GET /api/projects/:id/state?at=2026-03-10T15:00:00Z
pub async fn get_state_at(
    Path(project_id): Path<Uuid>,
    Query(params): Query<TemporalParams>,
    State(pool): State<DbPool>,
) -> Result<Json<GraphState>> {
    let at = params.at;
    // 1. Find nearest snapshot before `at`
    let snapshot = find_nearest_snapshot(&pool, project_id, at).await?;
    // 2. Replay events from snapshot to `at`
    let events = get_events_between(&pool, project_id, snapshot.timestamp, at).await?;
    // 3. Apply events to snapshot state
    let state = replay_events(snapshot, events);
    Ok(Json(state))
}

/// Get events in a time range (for the timeline marker display)
/// GET /api/projects/:id/events?from=...&to=...&types=node.created,compile.*
pub async fn list_events(
    Path(project_id): Path<Uuid>,
    Query(params): Query<EventFilter>,
    State(pool): State<DbPool>,
) -> Result<Json<Vec<Event>>> { ... }

/// Get the history of a single entity over time
/// GET /api/nodes/:id/history
pub async fn node_history(
    Path(node_id): Path<Uuid>,
    State(pool): State<DbPool>,
) -> Result<Json<Vec<Event>>> { ... }

/// Restore a node to a past version
/// POST /api/nodes/:id/restore?version=5
pub async fn restore_version(
    Path(node_id): Path<Uuid>,
    Query(params): Query<RestoreParams>,
    State(pool): State<DbPool>,
) -> Result<Json<Node>> { ... }
```

---

## Frontend: Timeline Scrubber Component

```svelte
<!-- frontend/src/lib/components/TimelineScrubber.svelte -->

<script lang="ts">
  import { getContext } from 'svelte';

  // Temporal state is provided via Svelte context so ALL views react to it
  let { currentTime, isLive, events } = getContext<TemporalContext>('temporal');

  let scrubbing = $state(false);
  let playSpeed = $state(1);
  let playing = $state(false);

  // Derived: significant events to show as markers on the timeline
  let markers = $derived(
    events.filter(e =>
      ['compile.epic_from_cluster', 'compile.phases_from_epic',
       'pr.merged', 'node.status_changed'].includes(e.event_type)
    )
  );

  function scrubTo(timestamp: Date) {
    currentTime = timestamp;
    isLive = false;
  }

  function goLive() {
    isLive = true;
    currentTime = new Date();
  }
</script>

<div class="timeline-scrubber">
  <input
    type="range"
    min={projectCreatedAt.getTime()}
    max={Date.now()}
    value={currentTime.getTime()}
    oninput={(e) => scrubTo(new Date(+e.target.value))}
  />

  <!-- Event markers on the track -->
  {#each markers as marker}
    <div
      class="marker"
      style:left="{positionForTime(marker.timestamp)}%"
      title={marker.event_type}
    />
  {/each}

  <div class="controls">
    <button onclick={stepBack}>◀</button>
    <button onclick={togglePlay}>{playing ? '⏸' : '▶'}</button>
    <button onclick={stepForward}>▶</button>
    <button onclick={goLive} class:active={isLive}>⟲ Now</button>
    <select bind:value={playSpeed}>
      <option value={0.5}>0.5x</option>
      <option value={1}>1x</option>
      <option value={5}>5x</option>
      <option value={60}>1min/s</option>
    </select>
    <span class="timestamp">{formatDate(currentTime)}</span>
  </div>
</div>
```

### Temporal Context (shared across all views)

```typescript
// frontend/src/lib/stores/temporal.ts

export interface TemporalContext {
  currentTime: Date;          // The point in time being viewed
  isLive: boolean;            // true = showing real-time state (default)
  graphState: GraphState;     // The reconstructed graph at currentTime
  events: Event[];            // All events in the project (for markers)
  scrubTo(time: Date): void;
  goLive(): void;
  stepBack(): void;           // Jump to previous significant event
  stepForward(): void;        // Jump to next significant event
}

// When isLive=true, graphState is the current real state (from normal StorageAdapter)
// When isLive=false, graphState is reconstructed from snapshot + event replay
```

### How Views Consume Temporal State

Every view component reads from `temporal.graphState` instead of the live store:

```svelte
<!-- Canvas, Kanban, Graph, Roadmap — all do this: -->
<script lang="ts">
  let { graphState } = getContext<TemporalContext>('temporal');

  // Instead of: let nodes = nodeStore.listNodes(filter)
  // Use:        let nodes = $derived(graphState.nodes.filter(...))
  let visibleNodes = $derived(
    graphState.nodes.filter(n => n.layer === 5 && n.status !== 'deleted')
  );
</script>
```

When `isLive`, `graphState` is just a reference to the real store — zero overhead. When scrubbing, it's a reconstructed snapshot.

---

## Playback Mode

"Play" animates through time, showing the project evolving:

- Notes appear on the canvas one by one as they were created
- Edges draw themselves in as the Connector inferred them
- Clusters form and compile into epics
- Phases and tickets materialize downstream
- PRs open and merge, status badges update

This is powerful for:
- **Demos:** Show stakeholders how a feature evolved from brain dump to shipped code
- **Retrospectives:** "What happened this sprint?" — play it at 60x speed
- **Onboarding:** New team members see the history of decisions unfold

Playback speed options: 0.5x, 1x (real-time), 5x, 1min/s, 1hr/s, 1day/s.

---

## Timeline Markers & Annotations

Significant events show as markers on the scrubber track:

| Marker Type | Visual | Event |
|---|---|---|
| Note created | Small dot | `node.created` (only shown at high zoom) |
| Epic compiled | Blue diamond | `compile.epic_from_cluster` |
| Phase generated | Green diamond | `compile.phases_from_epic` |
| Tickets generated | Amber diamond | `compile.tickets_from_phase` |
| PR merged | Purple circle | `pr.merged` |
| Status change | Colored dot | `node.status_changed` |
| Decision made | Star | `node.created` where type=Decision |
| Re-plan | Red triangle | `compile.replan` |

Users can add manual annotations: "This is when we pivoted to approach B." Annotations are stored as events with `event_type: 'annotation'`.

---

## Node-Level Time Travel

Beyond the global scrubber, individual nodes have a time dimension:

### Version History Panel
- Click any node → side panel shows version timeline
- Each version: timestamp, what changed (diff), who/what changed it
- "Restore to this version" button → creates a new version with the old content
- Visual diff between any two versions

### "When was this?" Affordance
- Hover any node → tooltip shows: "Created Mar 2, modified 8 times, last changed 2h ago"
- In scrubbed (non-live) mode: "This note was 3 days old at this point"

---

## Implementation Timeline

### M1 additions (Weeks 1-4):

**Stream A extension:**
- A1: Add `event` table to migrations. Every CRUD operation in the Rust backend writes an event.
- A1: Frontend `StorageAdapter` interface gets `recordEvent()` method (IndexedDB adapter writes events locally)

**Stream B extension:**
- B1: Every node create/update/delete also creates an event record
- B1: Edge create/delete creates an event record

**New Stream A.5: Temporal Foundation (Week 3-4, parallel with E)**
- A.5a: `TimelineScrubber.svelte` component — range slider, event markers, play/pause/step
- A.5b: `TemporalContext` store — shared across all views via Svelte context
- A.5c: `GraphState` reconstruction from events (client-side for Mode A, API call for Mode B/C)
- A.5d: Wire up Canvas, Kanban, Graph views to read from `temporal.graphState` instead of live store
- A.5e: Snapshot generation (Rust background task, or client-side for Mode A)

### M2 additions (Weeks 5-10):

- All compilation events (epic from cluster, phases from epic, tickets from phase) write to event log
- Re-plan events write a before/after snapshot of the affected intent/epic structure
- Roadmap view is temporal-aware: scrub to see what the plan looked like at any past point
- Playback mode MVP: sequential event replay at configurable speed

### M3 additions (Weeks 11-14):

- PR events (opened, merged, closed) write to event log
- Verification report events
- Export events (ticket exported, phase batch exported, Conductor config generated)
- "Project history" page: full timeline of all significant events, searchable/filterable
- Playback polish: smooth animations for node appear/disappear/edge draw

---

## Edge Cases

- **Deleted nodes:** Events record the full `before_state`, so deleted nodes can be shown when scrubbing to a time before deletion. They appear with a "deleted since" badge if you step forward past their deletion.
- **Reclassified nodes:** If a note changed from "Idea" to "Decision", scrubbing shows it as "Idea" at the earlier time.
- **Moved nodes:** If a note was linked to Intent A, then re-linked to Intent B, the roadmap view shows it under the correct intent for each time.
- **Large projects:** Snapshot every hour + index on (project_id, timestamp) keeps reconstruction under 100ms for most scrub positions. Background pre-computation for frequently accessed ranges.
- **Browser-only mode:** Events stored in IndexedDB. Reconstruction in a Web Worker. Snapshot every 100 events. Slightly slower for huge projects but acceptable — the scrubber degrades gracefully by showing "loading..." for positions far from any snapshot.
