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
  @type("number") rotationY = 0;
  @type("string") moveState: MoveState = "idle";
  @type("number") score = 0;
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
}
