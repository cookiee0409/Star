import {
  CONFIG,
  SPAWN_POINTS,
  type Point2D
} from "@starfall/shared";

export type RandomSource = () => number;

export function chooseMeteorTarget(
  random: RandomSource = Math.random
): Point2D {
  const index = Math.floor(random() * SPAWN_POINTS.length);
  return SPAWN_POINTS[index] ?? SPAWN_POINTS[0]!;
}

export function randomMeteorDelayMs(
  scale: number,
  random: RandomSource = Math.random
): number {
  const seconds =
    CONFIG.METEOR_INTERVAL_MIN +
    random() * (CONFIG.METEOR_INTERVAL_MAX - CONFIG.METEOR_INTERVAL_MIN);
  return Math.max(250, Math.round(seconds * 1000 * scale));
}

export function randomFragmentCount(
  random: RandomSource = Math.random
): number {
  return (
    CONFIG.FRAGMENTS_MIN +
    Math.floor(random() * (CONFIG.FRAGMENTS_MAX - CONFIG.FRAGMENTS_MIN + 1))
  );
}

