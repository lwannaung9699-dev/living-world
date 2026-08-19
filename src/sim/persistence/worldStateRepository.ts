import { WorldState } from "../core/state/worldState";
import { serializeWorldState, deserializeWorldState } from "../core/serialization/worldStateSerializer";

/**
 * WorldStateRepository — the persistence boundary between the Simulation
 * Core and any storage backend.
 *
 * The Simulation Core (src/sim/core/**) NEVER imports PostgreSQL, Drizzle,
 * or any other concrete storage technology. Orchestration code (future
 * Next.js API routes, a future Godot-facing server, or a CLI tool) is
 * responsible for constructing a concrete WorldStateRepository
 * implementation and driving the load -> tick -> save loop:
 *
 *   const state = await repo.load(worldId)
 *   const next = tick(state, context)
 *   await repo.save(worldId, next)
 *
 * Team 02+ persistence wiring should implement this exact interface against
 * Postgres/Drizzle in a separate `src/adapters/postgres` module — the
 * Foundation only ships the interface plus an in-memory reference
 * implementation, proving the Core can run and be tested with zero database
 * dependency.
 */
export interface WorldStateRepository {
  save(worldId: string, state: WorldState): Promise<void>;
  load(worldId: string): Promise<WorldState | null>;
  list(): Promise<string[]>;
  delete(worldId: string): Promise<void>;
}

/**
 * In-memory reference implementation of WorldStateRepository.
 *
 * Used by Foundation tests and any headless/offline run. Every save() is
 * round-tripped through the canonical serializer/deserializer, so
 * serialization bugs are caught immediately without requiring PostgreSQL or
 * any other real storage backend.
 */
export class InMemoryWorldStateRepository implements WorldStateRepository {
  private readonly store = new Map<string, string>();

  async save(worldId: string, state: WorldState): Promise<void> {
    this.store.set(worldId, serializeWorldState(state));
  }

  async load(worldId: string): Promise<WorldState | null> {
    const raw = this.store.get(worldId);
    return raw ? deserializeWorldState(raw) : null;
  }

  async list(): Promise<string[]> {
    return [...this.store.keys()].sort();
  }

  async delete(worldId: string): Promise<void> {
    this.store.delete(worldId);
  }
}
