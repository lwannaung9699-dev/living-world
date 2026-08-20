import { Vector2 } from "../perception/perception";

/**
 * CommunicationSignalKind — abstract signal types (Team 06 §18). Team 06
 * only produces these events; interpretation/evolution into language or
 * culture belongs to future teams.
 */
export type CommunicationSignalKind = "call" | "signal" | "warning" | "display" | "request" | "threat" | "socialSignal";

export interface CommunicationEvent {
  readonly eventId: string;
  readonly sourceCreatureId: string;
  readonly kind: CommunicationSignalKind;
  readonly position: Vector2;
  readonly tick: number;
  readonly loudness: number; // 0-1, determines how far PerceptionSystem.hearing can pick it up
  readonly targetCreatureId?: string; // present for directed signals (e.g. "request" to a specific mate)
  readonly payload?: Readonly<Record<string, unknown>>; // opaque data for future interpretation layers
}

export interface CreateCommunicationEventInput {
  eventId: string;
  sourceCreatureId: string;
  kind: CommunicationSignalKind;
  position: Vector2;
  tick: number;
  loudness?: number;
  targetCreatureId?: string;
  payload?: Readonly<Record<string, unknown>>;
}

export function createCommunicationEvent(input: CreateCommunicationEventInput): CommunicationEvent {
  return {
    eventId: input.eventId,
    sourceCreatureId: input.sourceCreatureId,
    kind: input.kind,
    position: input.position,
    tick: input.tick,
    loudness: input.loudness ?? 0.5,
    targetCreatureId: input.targetCreatureId,
    payload: input.payload,
  };
}
