// 해가 드리우는 그림자.
//
// 캐릭터만 그림자를 던진다. 나무까지 던지게 하면 넓은 잔디밭에 긴 그림자가
// 여러 개 그어져 "3D 게임" 쪽으로 되돌아간다. 참고한 아니메 배경화에서
// 그림자는 발밑을 눌러 주는 역할이지 화면을 가르는 요소가 아니다.
//
// 캐스터를 캐릭터로 한정하면 덤이 하나 더 있다. 방향광은 캐스터 목록에 맞춰
// 그림자맵의 절두체를 자동으로 좁히므로(autoUpdateExtends), 100m 맵 전체를
// 덮을 때보다 같은 해상도에서 훨씬 또렷해진다.
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
// 그림자맵을 렌더 루프에 끼워 넣는 부수효과 import.
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

const GENERATORS = new WeakMap<Scene, ShadowGenerator>();

/** 씬에 하나뿐인 그림자 생성기를 만든다. createWorld 가 부른다. */
export function createSunShadows(scene: Scene, light: DirectionalLight): void {
  const generator = new ShadowGenerator(1024, light);
  // 딱딱한 그림자는 톱니가 보인다. 뭉근하게 깔아 칠한 그림자처럼 만든다.
  //
  // 블러 방식(useBlurExponentialShadowMap) 대신 포아송 샘플링을 쓴다. 블러는
  // 별도 후처리 패스를 걸고 RGBD 인코딩까지 끌어들여, 그 셰이더들을 또 미리
  // 등록해 줘야 한다. 포아송은 그림자 셰이더 안에서 끝나 배관이 늘지 않는다.
  generator.usePoissonSampling = true;
  // 새까맣게 하지 않는다. 그늘색은 툰 머티리얼이 이미 한색으로 물들이고 있다.
  generator.darkness = 0.45;
  GENERATORS.set(scene, generator);
}

/** 이 메시가 그림자를 던지게 한다. 생성기가 없으면 조용히 넘어간다. */
export function addShadowCaster(scene: Scene, mesh: AbstractMesh): void {
  GENERATORS.get(scene)?.addShadowCaster(mesh, false);
}
