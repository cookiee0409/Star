export type MoveState = "idle" | "walk" | "run" | "jump";

export interface Point2D {
  x: number;
  z: number;
}

export interface MovePayload extends Point2D {
  /** 지면 위 높이(m). 점프 중에만 0 보다 크다. */
  y: number;
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

/**
 * 관측을 마쳤다는 신고.
 *
 * 좌표를 보내지 않는다. 서버가 이미 플레이어 위치를 알고 있으므로 그것으로
 * 판정한다. 클라이언트가 보낸 좌표를 믿으면 어디서든 관측했다고 우길 수 있다.
 */
export interface ObservePayload {
  /** 몇 번 관측 지점이라고 주장하는가. 서버가 거리로 검증한다. */
  spotIndex: number;
}

/** 관측한 사람에게만 가는 조기 예보. */
export interface MeteorForecastPayload {
  targetX: number;
  targetZ: number;
  /** 정규 경고까지 남은 시간(ms). */
  leadMs: number;
}

/** 유성우 시작. */
export interface ShowerStartedPayload {
  count: number;
}

/** 클라이언트가 보내는 채팅. */
export interface ChatPayload {
  text: string;
}

/** 서버가 방 전체에 돌려주는 채팅. 보낸 사람은 서버가 정한다. */
export interface ChatMessagePayload {
  /**
   * 말풍선을 누구 머리 위에 띄울지 정하는 데 쓴다.
   * 닉네임은 중복될 수 있어 대상을 특정하지 못한다.
   */
  sessionId: string;
  nickname: string;
  text: string;
  /** 서버 기준 시각(ms). 클라이언트 시계는 믿지 않는다. */
  at: number;
}

