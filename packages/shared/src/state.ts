// 서버가 클라이언트에 동기화하는 Colyseus 상태 스키마.
//
// 클라이언트와 서버가 같은 정의를 써야 하므로 shared 패키지에 둔다.
// 서버는 이 클래스로 상태를 만들고, 클라이언트는 SDK 콜백 타입에 사용한다.
//
// 주의: 이 파일은 @type 데코레이터를 쓴다. tsx(esbuild)는 tsconfig 의 extends 를
// 따라가지 않아, 설정을 명시하지 않으면 다른 워크스페이스 패키지의 이 파일을
// 표준 ES 데코레이터로 잘못 컴파일해 서버가 기동 중 죽는다.
// 그래서 apps/server 의 dev/start 스크립트는 experimentalDecorators 가 직접
// 들어있는 tsconfig.base.json 을 --tsconfig 로 넘긴다.
import { MapSchema, Schema, type } from "@colyseus/schema";
import type { MoveState } from "./types";

export class PlayerState extends Schema {
  @type("string") sessionId = "";
  @type("string") nickname = "";
  @type("number") x = 0;
  @type("number") z = 0;
  /** 지면 위 높이(m). 점프 중에만 0 보다 크다. */
  @type("number") y = 0;
  @type("number") rotationY = 0;
  @type("string") moveState: MoveState = "idle";
  @type("number") score = 0;
  /**
   * 지난 판까지의 누적 수집 개수와 한 판 최고 기록.
   *
   * 일회성 메시지로 보내지 않고 상태에 싣는 이유: 서버는 입장 직후 저장소를
   * 읽어 채우는데, 그 시점이 클라이언트가 메시지 핸들러를 다는 시점보다
   * 빠를 수 있다. 상태는 언제 바뀌든 동기화되므로 이 경합이 없다.
   */
  @type("number") total = 0;
  @type("number") best = 0;
  /** 다음 별똥별 예보를 받아 둔 상태인가. 관측으로 얻는다. */
  @type("boolean") hasForecast = false;
}

export class FragmentState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") z = 0;
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: FragmentState }) fragments = new MapSchema<FragmentState>();
  @type("number") nextMeteorAt = 0;
  /** 방 전체가 함께 채우는 게이지. 누가 줍든 올라간다. */
  @type("number") skyGauge = 0;
  /** 유성우가 진행 중인가. HUD 가 이걸로 표시를 바꾼다. */
  @type("boolean") showerActive = false;
}
