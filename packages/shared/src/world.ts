import { CONFIG } from "./constants";
import type { Point2D } from "./types";

export interface BoxObstacle extends Point2D {
  kind: "box";
  width: number;
  depth: number;
  height: number;
  rotationY: number;
}

export interface CylinderObstacle extends Point2D {
  kind: "cylinder";
  radius: number;
  height: number;
}

export type WorldObstacle = BoxObstacle | CylinderObstacle;

/**
 * 지나갈 수 없는 것들.
 *
 * **반드시 눈에 보이는 것과 크기가 맞아야 한다.** 예전에는 나무 한 그루 자리에
 * 8×4m 짜리 상자를 두었는데, 화면에는 줄기 굵기 0.6m 짜리 나무만 서 있어서
 * 그 주위가 통째로 보이지 않는 벽이 되었다.
 *
 * 그래서 전부 원기둥이다. 플레이어는 지면에서 걸으므로 판정은 나뭇가지가 아니라
 * **줄기 굵기**에 맞춘다. 바위는 실제로 바닥을 차지하므로 그만큼 넓게 잡는다.
 *
 * height 는 충돌에 쓰이지 않는다(점프로 넘을 수 있는 것은 없다). 화면에 놓을
 * 모델의 크기를 정하는 값이다.
 */
export const WORLD_OBSTACLES: readonly WorldObstacle[] = [
  // 큰 나무. 줄기만 막는다.
  { kind: "cylinder", x: -19, z: -12, radius: 0.75, height: 6 },
  { kind: "cylinder", x: 18, z: 16, radius: 0.8, height: 7 },
  { kind: "cylinder", x: 27, z: -21, radius: 0.7, height: 5.5 },
  // 바위. 바닥을 실제로 차지하므로 넓다.
  { kind: "cylinder", x: -29, z: 22, radius: 2.4, height: 4.2 },
  { kind: "cylinder", x: 4, z: -27, radius: 2, height: 3.6 },
  { kind: "cylinder", x: 0, z: 13, radius: 1.7, height: 3 }
] as const;

export const SPAWN_POINTS: readonly Point2D[] = [
  { x: -34, z: -30 },
  { x: -18, z: -31 },
  { x: 2, z: -37 },
  { x: 21, z: -34 },
  { x: 36, z: -17 },
  { x: 33, z: 5 },
  { x: 33, z: 31 },
  { x: 12, z: 34 },
  { x: -8, z: 32 },
  { x: -30, z: 34 },
  { x: -37, z: 10 },
  { x: -36, z: -10 },
  { x: 10, z: 8 }
] as const;

/**
 * 관측 지점.
 *
 * 맵 가장자리의 트인 곳에 둔다. 가운데는 별똥별이 자주 떨어지는 곳이라
 * "안전하게 하늘만 보는 자리"와 겹치지 않게 하려는 것이고, 가장자리로 가는
 * 동안은 조각 경쟁에서 멀어지므로 관측 자체가 선택이 된다.
 *
 * 장애물(WORLD_OBSTACLES)과 겹치지 않는 좌표여야 한다. 겹치면 다가갈 수 없다.
 */
export const OBSERVE_POINTS: readonly Point2D[] = [
  { x: -38, z: -38 },
  { x: 38, z: -38 },
  { x: -38, z: 38 },
  { x: 38, z: 38 }
] as const;

/**
 * 별자리 도감.
 *
 * 누적 수집 개수가 문턱을 넘을 때마다 하나씩 채워진다. 순위가 아니라 개인
 * 진척이라, 브라우저 ID 가 위조 가능하다는 약점이 문제가 되지 않는다.
 * 뒤로 갈수록 간격을 벌려 오래 남을 목표를 만든다.
 */
export interface Constellation {
  readonly name: string;
  /** 이 별자리가 완성되는 누적 수집 개수. */
  readonly required: number;
}

export const CONSTELLATIONS: readonly Constellation[] = [
  { name: "첫 별", required: 1 },
  { name: "작은 국자", required: 8 },
  { name: "은하수", required: 20 },
  { name: "북두칠성", required: 40 },
  { name: "오리온", required: 75 },
  { name: "백조", required: 125 },
  { name: "겨울의 대삼각형", required: 200 }
] as const;

/** 누적 수집 개수로 도감 진척을 계산한다. */
export function constellationProgress(total: number): {
  completed: number;
  current: Constellation | undefined;
  previousRequired: number;
} {
  const completed = CONSTELLATIONS.filter(
    (entry) => total >= entry.required
  ).length;
  return {
    completed,
    current: CONSTELLATIONS[completed],
    previousRequired: CONSTELLATIONS[completed - 1]?.required ?? 0
  };
}

export const PLAYER_START_POINTS: readonly Point2D[] = [
  { x: -4, z: -4 },
  { x: 4, z: -4 },
  { x: -4, z: 4 },
  { x: 4, z: 4 },
  { x: -8, z: 0 },
  { x: 8, z: 0 },
  { x: 0, z: -8 },
  { x: 0, z: 8 }
] as const;

export function isInsideMap(point: Point2D, padding = 0): boolean {
  const halfSize = CONFIG.MAP_SIZE / 2 - padding;
  return Math.abs(point.x) <= halfSize && Math.abs(point.z) <= halfSize;
}

function rotateIntoObstacleSpace(
  point: Point2D,
  obstacle: BoxObstacle
): Point2D {
  const dx = point.x - obstacle.x;
  const dz = point.z - obstacle.z;
  const cos = Math.cos(-obstacle.rotationY);
  const sin = Math.sin(-obstacle.rotationY);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos
  };
}

export function collidesWithObstacle(
  point: Point2D,
  radius: number = CONFIG.PLAYER_RADIUS
): boolean {
  return WORLD_OBSTACLES.some((obstacle) => {
    if (obstacle.kind === "cylinder") {
      return Math.hypot(point.x - obstacle.x, point.z - obstacle.z) <
        obstacle.radius + radius;
    }

    const local = rotateIntoObstacleSpace(point, obstacle);
    return Math.abs(local.x) < obstacle.width / 2 + radius &&
      Math.abs(local.z) < obstacle.depth / 2 + radius;
  });
}

export function isWalkable(
  point: Point2D,
  radius: number = CONFIG.PLAYER_RADIUS
): boolean {
  return isInsideMap(point, radius) && !collidesWithObstacle(point, radius);
}

export function resolveMovement(
  current: Point2D,
  delta: Point2D,
  radius: number = CONFIG.PLAYER_RADIUS
): Point2D {
  const fullMove = { x: current.x + delta.x, z: current.z + delta.z };
  if (isWalkable(fullMove, radius)) {
    return fullMove;
  }

  const xOnly = { x: current.x + delta.x, z: current.z };
  const resolvedX = isWalkable(xOnly, radius) ? xOnly.x : current.x;
  const zOnly = { x: resolvedX, z: current.z + delta.z };
  return {
    x: resolvedX,
    z: isWalkable(zOnly, radius) ? zOnly.z : current.z
  };
}
