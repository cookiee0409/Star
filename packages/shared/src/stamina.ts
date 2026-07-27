// 달리기 자원.
//
// 달리기가 공짜면 낙하 지점까지 Shift 를 누르고 있으면 끝이라 판단할 게 없다.
// 소모와 회복 속도를 다르게 두면 "지금 달릴까, 마지막 스퍼트를 남길까"가 생긴다.
//
// 최종 판정은 서버가 한다. 그러지 않으면 스태미나를 무시하고 달리는
// 클라이언트를 막을 수 없다.
//
// 다만 클라이언트도 똑같이 예측해야 한다. 클라이언트가 계속 달리는데 서버가
// 걷기로 낮추면, 서버는 이동 거리를 초과로 보고 거절하고 캐릭터가 뒤로 튕긴다.
// 그래서 이 함수는 shared 에 있고 양쪽이 같은 것을 쓴다.
import { CONFIG } from "./constants";
import type { MoveState } from "./types";

/**
 * 흐른 시간만큼 스태미나를 갱신하고, 요청한 이동 상태가 허용되는지 답한다.
 *
 * 바닥난 뒤 곧바로 다시 달릴 수 있으면 한 칸씩 끊어 달리는 딸꾹질이 생긴다.
 * STAMINA_MIN_TO_RUN 만큼 차야 다시 달릴 수 있게 해서 그걸 막는다.
 */
export function updateStamina(
  current: number,
  requested: MoveState,
  elapsedSeconds: number,
  wasRunning: boolean
): { stamina: number; allowed: MoveState } {
  const elapsed = Math.min(Math.max(elapsedSeconds, 0), 0.5);

  // 이어서 달리는 중이면 남아 있기만 하면 되고, 새로 달리기 시작하는
  // 것이라면 최소치를 넘겨야 한다.
  const threshold = wasRunning ? 0 : CONFIG.STAMINA_MIN_TO_RUN;
  const canRun = requested === "run" && current > threshold;

  if (canRun) {
    return {
      stamina: Math.max(0, current - CONFIG.STAMINA_DRAIN * elapsed),
      allowed: "run"
    };
  }

  return {
    stamina: Math.min(
      CONFIG.STAMINA_MAX,
      current + CONFIG.STAMINA_RECOVER * elapsed
    ),
    // 달리려 했지만 스태미나가 없으면 걷기로 낮춘다.
    allowed: requested === "run" ? "walk" : requested
  };
}
