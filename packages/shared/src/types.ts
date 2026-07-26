export type MoveState = "idle" | "walk" | "run";

export interface Point2D {
  x: number;
  z: number;
}

export interface MovePayload extends Point2D {
  rotationY: number;
  moveState: MoveState;
}

export interface CollectPayload {
  fragmentId: string;
}

export interface MeteorWarningPayload {
  meteorId: string;
  targetX: number;
  targetZ: number;
  etaMs: number;
}

export interface MeteorImpactPayload {
  meteorId: string;
  x: number;
  z: number;
}

export interface FragmentCollectedPayload {
  fragmentId: string;
  byNickname: string;
}

export interface JoinOptions {
  nickname: string;
  /**
   * 브라우저가 들고 있는 신원.
   *
   * 계정이 없으므로 "다시 온 사람"을 알아보는 유일한 수단이다. 닉네임을 키로
   * 쓰면 남의 기록을 가져갈 수 있어서 쓰지 않는다. 물론 이 값도 브라우저가
   * 만드는 것이라 위조할 수 있다 — 순위 경쟁이 걸리면 계정이 필요해진다.
   */
  playerId?: string;
}

/** 클라이언트가 보내는 채팅. */
export interface ChatPayload {
  text: string;
}

/** 서버가 방 전체에 돌려주는 채팅. 보낸 사람은 서버가 정한다. */
export interface ChatMessagePayload {
  nickname: string;
  text: string;
  /** 서버 기준 시각(ms). 클라이언트 시계는 믿지 않는다. */
  at: number;
}

