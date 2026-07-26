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

