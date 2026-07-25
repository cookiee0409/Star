// 자연 오브젝트(glTF) 로딩.
//
// 에셋이 없으면 조용히 실패하고 createWorld 가 원시 도형으로 되돌아간다.
// 게임이 멈추지 않는 것이 우선이다.
//
// 에셋 교체 방법은 apps/client/public/assets/nature/README.md 참고.
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Rendering/outlineRenderer";
import { CellMaterial } from "@babylonjs/materials/cell/cellMaterial";
// glTF 로더 등록 (부수효과).
import "@babylonjs/loaders/glTF/2.0";

const ASSET_DIR = "/assets/nature/";
const OUTLINE_COLOR = new Color3(0.05, 0.04, 0.09);

/**
 * 알파 컷아웃을 지원하는 CellMaterial.
 *
 * 나뭇잎은 텍스처의 알파로 모양을 오려내는데(glTF alphaMode: MASK),
 * 기본 CellMaterial 은 needAlphaTesting() 이 false 로 고정되어 있어
 * 잎이 잘리지 않고 사각형 판으로 보인다.
 * 셰이더 자체는 ALPHATEST 를 지원하므로 이 두 메서드만 열어 주면 된다.
 */
class CutoutCellMaterial extends CellMaterial {
  override needAlphaTesting(): boolean {
    return true;
  }

  override getAlphaTestTexture(): BaseTexture | null {
    return this.diffuseTexture;
  }
}

export interface NatureAsset {
  /** ASSET_DIR 기준 파일명 */
  readonly file: string;
  /** 외곽선 두께(월드 단위). 모델이 클수록 굵게 */
  readonly outlineWidth: number;
}

export const NATURE_ASSETS = {
  tree: { file: "tree.gltf", outlineWidth: 0.05 },
  treeAlt: { file: "tree_alt.gltf", outlineWidth: 0.05 },
  pine: { file: "pine.gltf", outlineWidth: 0.05 },
  rock: { file: "rock.gltf", outlineWidth: 0.035 },
  bush: { file: "bush.gltf", outlineWidth: 0.03 },
  fern: { file: "fern.gltf", outlineWidth: 0.02 },
  grass: { file: "grass.gltf", outlineWidth: 0.02 }
} as const satisfies Record<string, NatureAsset>;

export type NatureAssetName = keyof typeof NATURE_ASSETS;
export type NatureTemplates = Partial<Record<NatureAssetName, Mesh>>;

interface SourceMaterial {
  albedoColor?: Color3;
  diffuseColor?: Color3;
  albedoTexture?: BaseTexture;
  diffuseTexture?: BaseTexture;
  transparencyMode?: number | null;
}

/** Material.MATERIAL_ALPHATEST. 상수 하나 때문에 core 를 더 끌어오지 않는다. */
const MATERIAL_ALPHATEST = 1;

/**
 * 불러온 파트 하나를 셀셰이딩으로 바꾼다.
 *
 * 파트마다 따로 처리하는 이유: 나무는 껍질과 잎이 서로 다른 머티리얼과
 * 텍스처를 쓴다. 하나로 합치면 둘 중 하나의 색만 남는다.
 */
function applyCelStyle(mesh: Mesh, scene: Scene, outlineWidth: number): void {
  // 법선이 없으면 조명 계산이 되지 않아 납작하게 보인다.
  if (!mesh.isVerticesDataPresent("normal")) {
    mesh.createNormals(true);
  }

  const source = mesh.material as SourceMaterial | null;
  const texture = source?.albedoTexture ?? source?.diffuseTexture;
  const color = source?.albedoColor ?? source?.diffuseColor;
  // 나뭇잎처럼 알파로 모양을 오려내는 파트인가?
  const isFoliage = source?.transparencyMode === MATERIAL_ALPHATEST;

  const cell = new CutoutCellMaterial(`cell-${mesh.name}`, scene);
  cell.computeHighLevel = true; // 2단계 대신 3단계 음영
  if (texture) {
    texture.hasAlpha = true; // 잎을 오려내기 위해 알파를 살린다
    cell.diffuseTexture = texture;
  }
  if (color) {
    cell.diffuseColor = color;
  }
  // 잎은 판 형태라 뒷면도 보여야 자연스럽다. 줄기·바위는 닫힌 입체라 그대로 둔다.
  cell.backFaceCulling = !isFoliage;

  mesh.material = cell;
  mesh.isPickable = false;

  // 이 모델들은 정점 색상(COLOR_0)을 갖고 있는데, 그대로 두면 두 가지가 어긋난다.
  //  1) Babylon 은 hasVertexAlpha 가 켜져 있으면 알파 테스트를 꺼 버린다.
  //     그러면 잎의 투명한 부분이 잘리지 않고 검게 남는다.
  //  2) 정점 색상에 구워진 음영이 셀 음영과 곱해져 전체가 어두워진다.
  // 셀셰이딩은 자체적으로 명암을 만들므로 정점 색상은 쓰지 않는다.
  mesh.hasVertexAlpha = false;
  mesh.useVertexColors = false;

  // 외곽선은 메시를 부풀려 "뒷면만" 그리는 방식이라 양면 렌더링과 함께 쓸 수 없다.
  // 잎에 걸면 부풀린 검은 껍데기가 앞을 덮어 나무가 통째로 까맣게 보인다.
  // 그래서 닫힌 입체(줄기·바위)에만 건다.
  if (!isFoliage) {
    mesh.renderOutline = true;
    mesh.outlineWidth = outlineWidth;
    mesh.outlineColor = OUTLINE_COLOR;
  }
}

/**
 * 모델 하나를 템플릿으로 불러온다.
 *
 * 파트를 합치지 않고 빈 루트 아래에 모아 둔다. 배치할 때는 루트를 clone 하면
 * 자식까지 함께 복제된다.
 * 파일이 없으면 undefined 를 돌려준다.
 */
export async function loadNatureTemplate(
  scene: Scene,
  asset: NatureAsset
): Promise<Mesh | undefined> {
  try {
    const result = await ImportMeshAsync(ASSET_DIR + asset.file, scene);
    const parts = result.meshes.filter(
      (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
    );
    if (parts.length === 0) {
      return undefined;
    }

    const root = new Mesh(`template-${asset.file}`, scene);
    parts.forEach((part) => {
      applyCelStyle(part, scene, asset.outlineWidth);
      part.parent = root;
    });

    root.setEnabled(false); // 템플릿 자체는 화면에 두지 않는다
    return root;
  } catch (error) {
    console.warn(
      `[assets] ${asset.file} 을(를) 불러오지 못해 기본 도형을 사용합니다.`,
      error
    );
    return undefined;
  }
}

/** 사용 가능한 자연 에셋을 모두 불러온다. 실패한 항목은 빠진 채로 반환된다. */
export async function loadNatureTemplates(scene: Scene): Promise<NatureTemplates> {
  const names = Object.keys(NATURE_ASSETS) as NatureAssetName[];
  const loaded = await Promise.all(
    names.map((name) => loadNatureTemplate(scene, NATURE_ASSETS[name]))
  );

  const templates: NatureTemplates = {};
  names.forEach((name, index) => {
    const mesh = loaded[index];
    if (mesh) {
      templates[name] = mesh;
    }
  });
  return templates;
}

/** 모델의 실제 높이를 재서 목표 높이에 맞는 배율을 구한다. */
export function fitScale(template: Mesh, targetHeight: number): number {
  const { min, max } = template.getHierarchyBoundingVectors(true);
  const height = max.y - min.y;
  return height > 0.001 ? targetHeight / height : 1;
}

/**
 * 템플릿을 지정한 위치에 배치한다.
 *
 * createInstance 를 쓰지 않는 이유: 하드웨어 인스턴스에는 외곽선이 그려지지
 * 않는다. 외곽선은 이 스타일의 핵심이라 clone 을 쓴다. 정점 데이터는 원본과
 * 공유되고 드로우콜만 늘어난다.
 */
export function placeInstance(
  template: Mesh,
  name: string,
  position: Vector3,
  rotationY: number,
  scale: number,
  outlineWidth = 0.04
): void {
  const copy = template.clone(name);
  copy.position.copyFrom(position);
  copy.rotation.y = rotationY;
  copy.scaling.setAll(scale);
  copy.setEnabled(true);

  // clone 은 외곽선 설정을 가져오지 않으므로 자식마다 다시 켠다.
  // 잎(양면 렌더링) 파트는 원본에서도 꺼져 있으므로 건드리지 않는다.
  const restoreOutline = (mesh: AbstractMesh, template: AbstractMesh): void => {
    mesh.isPickable = false;
    if (!template.renderOutline) {
      return;
    }
    mesh.renderOutline = true;
    mesh.outlineWidth = outlineWidth;
    mesh.outlineColor = OUTLINE_COLOR;
  };

  restoreOutline(copy, template);
  const sourceParts = template.getChildMeshes();
  copy.getChildMeshes().forEach((part, index) => {
    const original = sourceParts[index];
    if (original) {
      restoreOutline(part, original);
    }
  });
}
