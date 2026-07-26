// 캐릭터 모델(glTF/GLB) 로딩과 애니메이션.
//
// 모델이 없으면 undefined 를 돌려주고 PlayerAvatar 가 캡슐로 되돌아간다.
// 게임이 멈추지 않는 것이 우선이다.
//
// 에셋 교체 방법은 apps/client/public/assets/character/README.md 참고.
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";
import type { MoveState } from "@starfall/shared";
import "@babylonjs/core/Rendering/outlineRenderer";
import "@babylonjs/loaders/glTF/2.0";
import { MATERIAL_ALPHATEST, getToonMaterial } from "../scene/toonMaterial";

/**
 * 플레이어에게 배정할 캐릭터들.
 *
 * 여러 벌을 두는 이유: 이 모델들은 색 아틀라스 한 장을 그대로 쓴다.
 * 예전 단색 모델처럼 플레이어 색을 곱하면 옷과 피부까지 물들어 망가지므로
 * (applyToonStyle 참고), 색 대신 캐릭터 자체로 서로를 구분한다.
 */
const CHARACTER_FILES = ["knight", "barbarian", "mage", "ranger", "rogue"];
const CHARACTER_DIR = "/assets/character/";

export const OUTLINE_COLOR = new Color3(0.05, 0.04, 0.09);
/** 기준 거리(CONFIG.CAM_DISTANCE)에서의 선 굵기. PlayerAvatar 가 거리에 맞춰 조절한다. */
export const OUTLINE_WIDTH = 0.03;

/**
 * 머리 확대 배율. 1이면 모델 원래 비율 그대로다.
 *
 * 이 캐릭터들은 이미 머리가 큰 편이라 기본은 꺼 둔다. 더 아기자기하게
 * 만들고 싶으면 1.1~1.2 정도까지 올려 보면 된다. 투구·모자도 같은 뼈에
 * 물려 있어 함께 커진다.
 */
const HEAD_BONE = "head";
const HEAD_SCALE = 1;

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

/** 불러온 파트를 툰 셰이딩으로 바꾼다. 자연물과 같은 규칙을 쓴다. */
function applyToonStyle(mesh: AbstractMesh, scene: Scene, tint?: Color3): void {
  const source = mesh.material as SourceMaterial | null;
  const texture = source?.albedoTexture ?? source?.diffuseTexture;
  const isCutout = source?.transparencyMode === MATERIAL_ALPHATEST;

  // 색칠 규칙: 텍스처가 있는 모델은 원래 색을 그대로 둔다.
  // 여기에 플레이어 색을 곱하면 옷과 피부까지 물들어 모델이 망가진다.
  // 텍스처가 없는 단색 모델일 때만 플레이어 구분색을 입힌다.
  const base = source?.albedoColor ?? source?.diffuseColor;
  const color = !texture && tint ? tint : base;

  // 머티리얼은 조건이 같으면 공유한다. 플레이어가 늘어도 늘지 않는다.
  // 공유하므로 아바타를 지울 때 머티리얼까지 지우면 안 된다(dispose 참고).
  mesh.material = getToonMaterial(scene, `toon-${mesh.name}`, {
    texture,
    color,
    cutout: isCutout,
    twoSided: isCutout
  });
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

/** 불러온 캐릭터 한 벌. 비어 있으면 아바타가 캡슐로 되돌아간다. */
export type CharacterPack = readonly AssetContainer[];

/**
 * 캐릭터들을 AssetContainer 로 불러온다.
 *
 * 일반 로딩 대신 컨테이너를 쓰는 이유: 플레이어마다 골격과 애니메이션이
 * 따로 있어야 각자 다른 동작을 재생할 수 있다. instantiateModelsToScene 이
 * 그 복제를 처리해 준다.
 *
 * 한 종류라도 실패하면 그것만 빼고 나머지로 계속한다. 다섯 개가 다 없어야
 * 캡슐로 떨어진다.
 */
export async function loadCharacterPack(scene: Scene): Promise<CharacterPack> {
  const loaded = await Promise.all(
    CHARACTER_FILES.map(async (name) => {
      try {
        return await LoadAssetContainerAsync(
          `${CHARACTER_DIR}${name}.gltf`,
          scene
        );
      } catch (error) {
        console.warn(`[assets] ${name} 을(를) 불러오지 못했습니다.`, error);
        return undefined;
      }
    })
  );

  const pack = loaded.filter(
    (container): container is AssetContainer => container !== undefined
  );
  if (pack.length === 0) {
    console.warn("[assets] 캐릭터 모델이 하나도 없어 기본 캡슐을 사용합니다.");
  }
  return pack;
}

/**
 * 세션 ID 로 캐릭터를 고른다.
 *
 * 서버가 정해 주지 않아도 모두가 같은 답을 내야 한다. 그래야 내 화면의
 * 저 사람과 저 사람 화면의 자신이 같은 캐릭터로 보인다.
 */
export function pickCharacter(
  pack: CharacterPack,
  sessionId: string
): AssetContainer | undefined {
  if (pack.length === 0) {
    return undefined;
  }
  let hash = 0;
  for (let index = 0; index < sessionId.length; index += 1) {
    hash = (Math.imul(hash, 31) + sessionId.charCodeAt(index)) | 0;
  }
  return pack[(hash >>> 0) % pack.length];
}

export interface CharacterInstance {
  readonly root: Node;
  /** 이동 상태에 맞는 애니메이션으로 전환한다. */
  setMoveState(state: MoveState): void;
  dispose(): void;
}

/**
 * 머리 뼈를 키워 아니메 비율에 가깝게 만든다.
 *
 * 뼈가 아니라 뼈에 연결된 TransformNode 를 키우는 이유:
 * glTF 로더는 노드마다 TransformNode 를 만들고 뼈를 거기에 물려 둔다
 * (Bone.linkTransformNode). 애니메이션도 그 노드를 움직이므로,
 * 최종 자세를 정하는 것은 뼈가 아니라 이 노드다.
 *
 * 애니메이션 클립에 이 노드의 scale 채널이 있으면 매 프레임 1로 덮어쓴다.
 * 그래서 build-character.py 가 scale 채널을 아예 빼고 만든다.
 */
function scaleHead(skeletons: Skeleton[], scale: number): void {
  if (scale === 1) {
    return;
  }
  for (const skeleton of skeletons) {
    const bone = skeleton.bones.find(
      (candidate) =>
        candidate.name === HEAD_BONE || candidate.name.endsWith(`-${HEAD_BONE}`)
    );
    const node: TransformNode | null | undefined = bone?.getTransformNode();
    if (node) {
      node.scaling.scaleInPlace(scale);
      return;
    }
  }
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

  root.getChildMeshes().forEach((mesh) => applyToonStyle(mesh, scene, tint));
  scaleHead(entries.skeletons, HEAD_SCALE);

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
      // 머티리얼과 텍스처는 같이 지우지 않는다. 플레이어끼리 공유하는
      // 캐시(getToonMaterial)라서, 한 명이 나갈 때 지우면 남은 사람들이
      // 지워진 머티리얼을 쥐게 된다. 캐시는 씬과 함께 사라진다.
      root.dispose(false, false);
    }
  };
}
