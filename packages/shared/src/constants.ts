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
  REMOTE_INTERPOLATION: 0.16,
  NAMEPLATE_HIDE_DISTANCE: 34
} as const;

export const ROOM_NAME = "starfall";

