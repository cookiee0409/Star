export const CONFIG = {
  MAP_SIZE: 100,
  WALK_SPEED: 3.5,
  RUN_SPEED: 6,
  ROTATION_LERP: 0.15,
  // 카메라를 당기고 화각을 좁힌다. 멀고 넓게 잡으면 인물이 작아지고 원근이
  // 벌어져 "지도를 내려다보는" 그림이 된다. 가까이서 좁은 화각으로 보면 원근이
  // 눌려 배경이 크게 들어오는데, 아니메 배경화의 공간감이 대체로 이쪽이다.
  CAM_DISTANCE: 11,
  CAM_MIN_ZOOM: 6,
  CAM_MAX_ZOOM: 18,
  CAM_PITCH_DEG: 45,
  // 우클릭 드래그로 시선을 위아래로 젖힐 수 있는 범위(도).
  // 위쪽 85도면 FOV 절반까지 더해 화면 맨 위가 머리 꼭대기에 닿는다.
  CAM_LOOK_UP_MAX_DEG: 85,
  CAM_LOOK_DOWN_MAX_DEG: 62,
  // 카메라가 캐릭터보다 높이 뜨는 최소 각도.
  // 시선을 위로 들어도 카메라는 이 아래로 내려가지 않아 땅에 박히지 않는다.
  CAM_ORBIT_MIN_DEG: 6,
  CAM_FOV_DEG: 36,
  MOVE_SEND_HZ: 12,
  METEOR_INTERVAL_MIN: 45,
  METEOR_INTERVAL_MAX: 90,
  METEOR_WARNING_LEAD: 3,
  METEOR_FALL_DURATION: 1.75,
  FRAGMENTS_MIN: 4,
  FRAGMENTS_MAX: 6,
  SCATTER_RADIUS_MIN: 3,
  SCATTER_RADIUS_MAX: 8,
  COLLECT_RADIUS: 2,
  FRAGMENT_LIFETIME: 60,
  MAX_PLAYERS: 8,
  PLAYER_RADIUS: 0.55,
  COLLECT_REQUEST_COOLDOWN_MS: 150,
  // 채팅
  CHAT_MAX_LENGTH: 100,
  /** 화면에 남겨 두는 최근 줄 수. */
  CHAT_HISTORY: 10,
  /** 같은 사람이 다음 줄을 보낼 수 있을 때까지의 간격. 도배를 막는다. */
  CHAT_COOLDOWN_MS: 700,

  // 스태미나 — 달리기에 대가를 붙여 "언제 달릴까"를 결정으로 만든다.
  /** 가득 찬 상태에서 달릴 수 있는 시간(초). 맵 대각선의 절반쯤 간다. */
  STAMINA_MAX: 4.5,
  /** 달리는 동안 초당 소모량. 1이면 STAMINA_MAX 초만큼 달린다. */
  STAMINA_DRAIN: 1,
  /** 달리지 않는 동안 초당 회복량. 소모보다 느려야 아끼는 선택이 생긴다. */
  STAMINA_RECOVER: 0.55,
  /** 바닥난 뒤 다시 달리려면 최소 이만큼은 차 있어야 한다. 딸꾹질 방지. */
  STAMINA_MIN_TO_RUN: 1.2,

  // 관측 — 별똥별을 기다리는 빈 시간을 채운다.
  /** 관측 지점에 이만큼 안으로 들어가야 한다(m). */
  OBSERVE_RADIUS: 3.5,
  /** 하늘을 이 각도 이상 올려다봐야 관측으로 친다(도, 수평이 0). */
  OBSERVE_MIN_PITCH_DEG: 24,
  /** 관측을 마치는 데 걸리는 시간(초). */
  OBSERVE_SECONDS: 3,
  /** 예보가 정규 경고보다 얼마나 먼저 오는가(초). 이게 관측의 보상이다. */
  OBSERVE_FORECAST_LEAD: 8,

  // 방 공동 목표 — 누가 줍든 함께 쌓이고, 채우면 유성우가 온다.
  /** 게이지를 채우는 데 필요한 조각 수. */
  SKY_GAUGE_GOAL: 24,
  /** 유성우로 떨어지는 별똥별 수. */
  SHOWER_METEORS: 3,
  /** 유성우 안에서 별똥별 사이의 간격(초). */
  SHOWER_INTERVAL: 6,
  REMOTE_INTERPOLATION: 0.16,
  NAMEPLATE_HIDE_DISTANCE: 34
} as const;

export const ROOM_NAME = "starfall";

