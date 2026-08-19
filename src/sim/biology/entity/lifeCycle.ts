import { DeterministicRng } from "../../core/rng/deterministicRng";
import { LifeCycleConfig } from "../species/speciesConfig";
import { BioEntity, LifeStage } from "./bioEntity";

/**
 * Generic life-cycle model: embryo -> juvenile -> adult -> old -> death.
 * Thresholds are entirely species-config-driven; no universal lifespan is
 * hardcoded here.
 */
export function nextLifeStage(entity: BioEntity, config: LifeCycleConfig): LifeStage {
  if (entity.lifeStage === "dead") return "dead";
  if (entity.age >= config.maxAge) return "old";
  if (entity.age >= config.oldAge) return "old";
  if (entity.age >= config.maturityAge) return "adult";
  if (entity.age > 0) return "juvenile";
  return "embryo";
}

export interface DeathCheckResult {
  readonly shouldDie: boolean;
  readonly cause?: "old-age" | "starvation" | "poor-health";
}

/**
 * Determines whether an entity dies this tick. Combines deterministic hard
 * limits (max age, zero energy) with probabilistic mortality (old-age
 * baseline, scaled by health) drawn from the supplied DeterministicRng.
 */
export function checkDeath(entity: BioEntity, config: LifeCycleConfig, rng: DeterministicRng): DeathCheckResult {
  if (entity.energy <= 0) return { shouldDie: true, cause: "starvation" };
  if (entity.age >= config.maxAge) return { shouldDie: true, cause: "old-age" };
  if (entity.health <= 0) return { shouldDie: true, cause: "poor-health" };

  if (entity.lifeStage === "old") {
    const mortality = config.baselineOldAgeMortality * (1 - entity.health);
    if (rng.boolean(mortality)) return { shouldDie: true, cause: "old-age" };
  }
  return { shouldDie: false };
}
