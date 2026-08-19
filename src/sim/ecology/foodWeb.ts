import { InvalidStateError } from "../core/errors";
import { EcologicalInteraction, InteractionType, isConsumptiveInteraction } from "./interactions";

export type FoodWebNodeKind = "resource" | "population";

export interface FoodWebNode {
  readonly id: string;
  readonly kind: FoodWebNodeKind;
}

export interface FoodWebEdge {
  readonly from: string;
  readonly to: string;
  readonly interactionType: InteractionType;
  readonly strength: number;
}

/**
 * FoodWeb — a directed graph of who-eats-what (and other ecological
 * relationships). Deliberately NOT assumed to be a simple linear chain or
 * even acyclic: omnivory, scavenging, and detritus loops all create real
 * cycles in natural food webs, so cycles are permitted and must not crash
 * consumers of this graph.
 */
export interface FoodWeb {
  readonly nodes: readonly FoodWebNode[];
  readonly edges: readonly FoodWebEdge[];
}

export function createFoodWeb(nodes: readonly FoodWebNode[], edges: readonly FoodWebEdge[]): FoodWeb {
  const web: FoodWeb = { nodes, edges };
  validateFoodWeb(web);
  return web;
}

/** Builds a FoodWeb directly from a set of ecological interactions plus the node ids/kinds they reference. */
export function foodWebFromInteractions(
  nodes: readonly FoodWebNode[],
  interactions: readonly EcologicalInteraction[],
): FoodWeb {
  const edges: FoodWebEdge[] = interactions
    .filter((i) => isConsumptiveInteraction(i.type) || i.type === "mutualism" || i.type === "commensalism" || i.type === "parasitism")
    .map((i) => ({ from: i.sourceId, to: i.targetId, interactionType: i.type, strength: i.strength }));
  return createFoodWeb(nodes, edges);
}

export function validateFoodWeb(value: unknown): asserts value is FoodWeb {
  if (typeof value !== "object" || value === null) {
    throw new InvalidStateError("FoodWeb must be an object");
  }
  const web = value as Partial<FoodWeb>;
  if (!Array.isArray(web.nodes)) {
    throw new InvalidStateError("FoodWeb.nodes must be an array");
  }
  if (!Array.isArray(web.edges)) {
    throw new InvalidStateError("FoodWeb.edges must be an array");
  }
  const nodeIds = new Set(web.nodes.map((n) => n.id));
  if (nodeIds.size !== web.nodes.length) {
    throw new InvalidStateError("FoodWeb.nodes must have unique ids");
  }
  for (const edge of web.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new InvalidStateError(`FoodWeb edge references unknown node(s): ${edge.from} -> ${edge.to}`);
    }
  }
}

/** All node ids that consume (eat/parasitize/etc) the given node. */
export function getConsumersOf(web: FoodWeb, nodeId: string): string[] {
  return web.edges.filter((e) => e.to === nodeId).map((e) => e.from);
}

/** All node ids the given node consumes. */
export function getConsumedBy(web: FoodWeb, nodeId: string): string[] {
  return web.edges.filter((e) => e.from === nodeId).map((e) => e.to);
}

/**
 * Estimates a trophic level for every node (1 = primary producer / basal
 * resource, increasing with each consumption step above it). Cycles are
 * handled by capping the number of relaxation passes at |nodes| — this
 * yields a stable, deterministic approximation (longest-acyclic-path style)
 * rather than infinite recursion or non-termination on cyclic graphs.
 */
export function estimateTrophicLevels(web: FoodWeb): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const node of web.nodes) levels[node.id] = 1;

  const consumedByEdges = web.edges; // from (consumer) -> to (consumed)
  for (let pass = 0; pass < web.nodes.length; pass++) {
    let changed = false;
    for (const edge of consumedByEdges) {
      const candidate = levels[edge.to] + 1;
      if (candidate > levels[edge.from]) {
        levels[edge.from] = candidate;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return levels;
}

/**
 * Connectivity ratio (0..1): actual edges vs. maximum possible directed
 * edges among the nodes present. Used as an ecosystem-stability signal —
 * very low connectivity means the food web is fragile / thinly linked.
 */
export function foodWebConnectivity(web: FoodWeb): number {
  const n = web.nodes.length;
  if (n < 2) return 0;
  const maxEdges = n * (n - 1);
  return Math.min(1, web.edges.length / maxEdges);
}
