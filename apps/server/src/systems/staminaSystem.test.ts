import { describe, expect, it } from "vitest";
import { CONFIG, updateStamina } from "@starfall/shared";

describe("updateStamina", () => {
  it("달리면 줄어든다", () => {
    const result = updateStamina(CONFIG.STAMINA_MAX, "run", 0.25, true);
    expect(result.allowed).toBe("run");
    expect(result.stamina).toBeCloseTo(
      CONFIG.STAMINA_MAX - CONFIG.STAMINA_DRAIN * 0.25
    );
  });

  it("달리지 않으면 회복된다", () => {
    const result = updateStamina(0, "walk", 0.25, false);
    expect(result.stamina).toBeCloseTo(CONFIG.STAMINA_RECOVER * 0.25);
  });

  it("회복은 최대치를 넘지 않는다", () => {
    const result = updateStamina(CONFIG.STAMINA_MAX, "idle", 10, false);
    expect(result.stamina).toBe(CONFIG.STAMINA_MAX);
  });

  it("바닥나면 달리기가 걷기로 낮춰진다", () => {
    const result = updateStamina(0, "run", 0.1, true);
    expect(result.allowed).toBe("walk");
    // 걷는 것으로 처리되므로 회복이 시작된다.
    expect(result.stamina).toBeGreaterThan(0);
  });

  it("바닥난 뒤 조금 찼다고 다시 달릴 수는 없다", () => {
    // 이걸 허용하면 한 칸씩 끊어 달리는 딸꾹질이 생긴다.
    const barely = CONFIG.STAMINA_MIN_TO_RUN - 0.1;
    expect(updateStamina(barely, "run", 0.1, false).allowed).toBe("walk");
    expect(
      updateStamina(CONFIG.STAMINA_MIN_TO_RUN + 0.1, "run", 0.1, false).allowed
    ).toBe("run");
  });

  it("이어 달리는 중이면 남아 있기만 하면 된다", () => {
    // 최소치 아래로 내려가도 달리던 사람은 이어서 달린다.
    const low = CONFIG.STAMINA_MIN_TO_RUN - 0.5;
    expect(updateStamina(low, "run", 0.1, true).allowed).toBe("run");
  });

  it("아주 긴 간격이 와도 한 번에 다 깎이지 않는다", () => {
    // 탭을 오래 멈췄다 돌아온 클라이언트가 스태미나를 통째로 날리면 안 된다.
    const result = updateStamina(CONFIG.STAMINA_MAX, "run", 60, true);
    expect(result.stamina).toBeGreaterThan(CONFIG.STAMINA_MAX - 1);
  });
});
