// 캐릭터 모델(glTF/GLB) 로딩과 애니메이션.
//
// 모델이 없으면 undefined 를 돌려주고 PlayerAvatar 가 캡슐로 되돌아간다.
// 게임이 멈추지 않는 것이 우선이다.
//
// 에셋 교체 방법은 apps/client/public/assets/character/README.md 참고.
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";
import type { MoveState } from "@starfall/shared";
import "@babylonjs/core/Rendering/outlineRenderer";
import { CellMaterial } from "@babylonjs/materials/cell/cellMaterial";
import "@babylonjs/loaders/glTF/2.0";

const CHARACTER_URL = "/assets/character/player.gltf";
const OUTLINE_COLOR = new Color3(0.05, 0.04, 0.09);
const OUTLINE_WIDTH = 0.02;

/** 이동 상태별로 찾을 애니메이션 이름 후보. 앞에 있을수록 우선. */
const CLIP_NAMES: Record<MoveState, readonly string[]> = {
  idle: ["idle", "idle_a", "breathing", "stand"],
  walk: ["walk", "walking", "walk_forward", "jog"],
  run: ["run", "running", "sprint", "run_forward"]
};

interface SourceMaterial {
  albedoColor?: Color3;
  diffuseColor?: Color3;
  albedoTexture?: BaseTexture;
  diffuseTexture?: BaseTexture;
  transparencyMode?: number | null;
}

const MATERIAL_ALPHATEST = 1;

/** 불러온 파트를 셀셰이딩으로 바꾼다. 자연물과 같은 규칙을 쓴다. */
function applyCelStyle(mesh: AbstractMesh, scene: Scene, tint?: Color3): void {
  const source = mesh.material as SourceMaterial | null;
  const texture = source?.albedoTexture ?? source?.diffuseTexture;
  const isCutout = source?.transparencyMode === MATERIAL_ALPHATEST;

  const cell = new CellMaterial(`cell-${mesh.name}`, scene);
  cell.computeHighLevel = true;
  if (texture) {
    texture.hasAlpha = true;
    cell.diffuseTexture = texture;
  }

  // 색칠 규칙: 텍스처가 있는 모델은 원래 색을 그대로 둔다.
  // 여기에 플레이어 색을 곱하면 옷과 피부까지 물들어 모델이 망가진다.
  // 텍스처가 없는 단색 모델일 때만 플레이어 구분색을 입힌다.
  const base = source?.albedoColor ?? source?.diffuseColor;
  if (!texture && tint) {
    cell.diffuseColor = tint;
  } else if (base) {
    cell.diffuseColor = base;
  }
  cell.backFaceCulling = !isCutout;

  mesh.material = cell;
  mesh.isPickable = false;
  // 정점 색상은 알파 테스트를 막고 음영을 어둡게 만든다. 자연물과 같은 이유로 끈다.
  mesh.hasVertexAlpha = false;
  mesh.useVertexColors = false;

  // 외곽선은 메시를 부풀려 뒷면만 그리는 방식이라 양면 렌더링과 함께 쓸 수 없다.
  if (!isCutout) {
    mesh.renderOutline = true;
    mesh.outlineWidth = OUTLINE_WIDTH;
    mesh.outlineColor = OUTLINE_COLOR;
  }
}

/**
 * 캐릭터를 AssetContainer 로 불러온다.
 *
 * 일반 로딩 대신 컨테이너를 쓰는 이유: 플레이어마다 골격과 애니메이션이
 * 따로 있어야 각자 다른 동작을 재생할 수 있다. instantiateModelsToScene 이
 * 그 복제를 처리해 준다.
 */
export async function loadCharacterContainer(
  scene: Scene
): Promise<AssetContainer | undefined> {
  try {
    return await LoadAssetContainerAsync(CHARACTER_URL, scene);
  } catch (error) {
    console.warn(
      "[assets] 캐릭터 모델을 불러오지 못해 기본 캡슐을 사용합니다.",
      error
    );
    return undefined;
  }
}

export interface CharacterInstance {
  readonly root: Node;
  /** 이동 상태에 맞는 애니메이션으로 전환한다. */
  setMoveState(state: MoveState): void;
  dispose(): void;
}

function findClip(
  groups: AnimationGroup[],
  state: MoveState
): AnimationGroup | undefined {
  const candidates = CLIP_NAMES[state];
  for (const candidate of candidates) {
    const match = groups.find((group) =>
      group.name.toLowerCase().includes(candidate)
    );
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * 컨테이너에서 캐릭터 한 벌을 찍어낸다.
 * 애니메이션이 없는 모델이면 setMoveState 가 아무 일도 하지 않는다.
 */
export function createCharacterInstance(
  container: AssetContainer,
  scene: Scene,
  name: string,
  tint?: Color3
): CharacterInstance | undefined {
  const entries = container.instantiateModelsToScene(
    (source) => `${name}-${source}`,
    false,
    { doNotInstantiate: true }
  );
  const root = entries.rootNodes[0];
  if (!root) {
    return undefined;
  }

  root.getChildMeshes().forEach((mesh) => applyCelStyle(mesh, scene, tint));

  const groups = entries.animationGroups;
  groups.forEach((group) => group.stop());

  const clips: Record<MoveState, AnimationGroup | undefined> = {
    idle: findClip(groups, "idle"),
    walk: findClip(groups, "walk"),
    run: findClip(groups, "run")
  };

  let current: MoveState | undefined;

  const setMoveState = (state: MoveState): void => {
    if (state === current) {
      return;
    }
    const next = clips[state] ?? clips.idle;
    if (!next) {
      return;
    }
      const previous = current ? clips[current] : undefined;
    if (previous && previous !== next) {
      previous.stop();
    }
    current = state;
    if (!next.isPlaying) {
      next.start(true);
    }
  };

  setMoveState("idle");

  return {
    root,
    setMoveState,
    dispose: () => {
      groups.forEach((group) => group.dispose());
      root.dispose(false, true);
    }
  };
}
