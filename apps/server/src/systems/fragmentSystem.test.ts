import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG,
  FragmentState,
  GameState,
  PlayerState,
  isWalkable
} from "@starfall/shared";
import {
  createFragmentPositions,
  tryCollectFragment
} from "./fragmentSystem";

describe("fragment system", () => {
  let state: GameState;
  let player: PlayerState;

  beforeEach(() => {
    state = new GameState();
    player = new PlayerState();
    player.sessionId = "p1";
    player.nickname = "테스터";
    player.x = 0;
    player.z = 0;
    state.players.set(player.sessionId, player);

    const fragment = new FragmentState();
    fragment.id = "f1";
    fragment.x = 1;
    fragment.z = 0;
    state.fragments.set(fragment.id, fragment);
  });

  it("awards an existing nearby fragment only once", () => {
    const cooldowns = new Map<string, number>();
    const first = tryCollectFragment(state, "p1", "f1", 1_000, cooldowns);
    const second = tryCollectFragment(state, "p1", "f1", 2_000, cooldowns);

    expect(first).toMatchObject({ ok: true, score: 1 });
    expect(second).toEqual({ ok: false, reason: "missing-fragment" });
    expect(player.score).toBe(1);
    expect(state.fragments.has("f1")).toBe(false);
  });

  it("rejects collection outside the server radius", () => {
    const fragment = state.fragments.get("f1")!;
    fragment.x = CONFIG.COLLECT_RADIUS + 0.01;

    expect(
      tryCollectFragment(state, "p1", "f1", 1_000, new Map())
    ).toEqual({ ok: false, reason: "too-far" });
    expect(player.score).toBe(0);
  });

  it("creates separated, reachable fragments", () => {
    let seed = 11;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const positions = createFragmentPositions({ x: 10, z: 8 }, 6, random);

    expect(positions).toHaveLength(6);
    expect(positions.every((point) => isWalkable(point, 0.4))).toBe(true);
    positions.forEach((point, index) => {
      positions.slice(index + 1).forEach((other) => {
        expect(Math.hypot(point.x - other.x, point.z - other.z)).toBeGreaterThanOrEqual(1.4);
      });
    });
  });
});

