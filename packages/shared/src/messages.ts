export const CLIENT_MESSAGES = {
  MOVE: "move",
  COLLECT: "collect",
  CHAT: "chat",
  OBSERVE: "observe"
} as const;

export const SERVER_MESSAGES = {
  METEOR_WARNING: "meteorWarning",
  METEOR_IMPACT: "meteorImpact",
  FRAGMENT_COLLECTED: "fragmentCollected",
  CHAT: "chat",
  /** 관측한 사람에게만 개별 전송하는 조기 예보. */
  METEOR_FORECAST: "meteorForecast",
  /** 방 공동 게이지가 가득 차 유성우가 시작됐다. */
  SHOWER_STARTED: "showerStarted"
} as const;

