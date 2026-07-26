// 아니메 톤 셰이딩.
//
// CellMaterial 을 쓰지 않는 이유: NdotL 을 계단으로 끊는 것이 전부다.
// 아니메 룩을 만드는 세 가지가 빠져 있다.
//   1. 명암 경계의 위치와 날카로움을 정할 수 없다
//   2. 그림자를 검게 곱한다. 아니메 그림자는 어두운 게 아니라 "색이 다르다"
//   3. 림 라이트(역광 테두리)가 없다
//
// ShaderMaterial 로 처음부터 짜지 않는 이유: 캐릭터는 스킨드 메시라
// 뼈 행렬을 셰이더로 넘기는 배관을 직접 만들어야 한다. CustomMaterial 은
// StandardMaterial 을 상속하므로 그 배관(스키닝·조명·알파)을 그대로 쓰고
// 최종 색만 우리 계산으로 바꾼다.
//
// 보안 메모: 아래 GLSL 은 이 파일 안의 상수 문자열이 전부다.
// 닉네임·세션 ID 같은 런타임 값은 셰이더 소스에 절대 넣지 않는다
// (머티리얼 이름에만 쓰이고, 이름은 셰이더로 흘러가지 않는다).
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { CustomMaterial } from "@babylonjs/materials/custom/customMaterial";
import { getPaperTexture } from "./paperTexture";

/** Material.MATERIAL_OPAQUE / MATERIAL_ALPHATEST. 상수 둘 때문에 core 를 더 끌어오지 않는다. */
const MATERIAL_OPAQUE = 0;
export const MATERIAL_ALPHATEST = 1;

/**
 * 전역 룩 조절판. 여기 값만 바꾸면 캐릭터·나무·바닥이 함께 움직인다.
 *
 * Color3/Vector3 "인스턴스"를 셰이더 유니폼에 그대로 물려 두었으므로,
 * 값을 바꾸면(예: TOON.shade.set(...)) 다음 프레임부터 전부 반영된다.
 */
export const TOON = {
  /**
   * 그림자 색. 알베도에 곱한다. 검정 대신 한색이라 그늘이 어두워지는 대신
   * "색이 달라진다". 하늘·안개와 같은 청록 계열로 맞춰 화면 전체를 한 색으로 묶는다.
   */
  shade: new Color3(0.58, 0.73, 0.75),
  /**
   * x: 명암 경계 위치, y: 경계 부드러움(0에 가까울수록 칼같이), z: 밝은 면 밝기
   *
   * 경계 위치는 조명 세기에 딸려 있다(createWorld 의 sky/sun). 해가 거의
   * 머리 위라 세워진 면은 빛을 적게 받는다. 0.45 로 두면 몸통 대부분이
   * 그늘로 넘어가 캐릭터가 통째로 어두워진다.
   */
  ramp: new Vector3(0.32, 0.04, 1),
  /** 역광 테두리 색 */
  rimColor: new Color3(1, 0.95, 0.85),
  /**
   * 림 라이트 기본값 — x: 두께(클수록 얇게), y: 세기, z: 그늘진 쪽에 남길 비율
   *
   * 세기를 낮게 둔다. 테두리 하이라이트는 "3D 게임"의 신호라, 손으로 칠한
   * 배경화에서는 거의 쓰지 않는다. 실루엣을 살짝 띄우는 정도만 남긴다.
   */
  rim: new Vector3(2, 0.22, 0.25),
  /**
   * 종이결 — x: 화면 몇 픽셀마다 무늬가 반복되는가, y: 그늘에서의 세기,
   * z: 밝은 면에서의 세기, w: 명암 경계를 흐트러뜨리는 정도
   *
   * 그늘을 더 세게 준다. 손으로 칠한 그림은 밝은 면보다 그늘에 붓자국이
   * 많이 남는다. 양쪽을 똑같이 주면 화면 전체가 그냥 지저분해 보인다.
   *
   * w 는 조금만 준다. 키우면 경계가 아니라 화면이 지글거린다.
   */
  grain: new Vector4(300, 0.34, 0.12, 0.05)
};

/** 잉크 선 색. 순검정 대신 청록을 섞어 하늘·그늘과 같은 계열로 둔다. */
export const OUTLINE_COLOR = new Color3(0.06, 0.09, 0.11);
/** 기준 거리(CONFIG.CAM_DISTANCE)에서의 선 굵기. PlayerAvatar 가 거리에 맞춰 조절한다. */
export const OUTLINE_WIDTH = 0.045;

/**
 * 최종 색을 우리 계산으로 갈아끼운다.
 *
 * 이 지점(CUSTOM_FRAGMENT_BEFORE_FOG)에서 쓸 수 있는 값:
 *   baseColor    디퓨즈 텍스처 색, diffuseColor 머티리얼 색
 *   diffuseBase  조명이 누적된 결과, normalW / viewDirectionW  월드 법선·시선
 *
 * 빛을 직접 계산하지 않고 diffuseBase 를 단계로 끊는 이유:
 * 광원 개수·색·세기가 바뀌어도 셰이더를 고칠 필요가 없다.
 *
 * 주석을 GLSL 안에 두지 않는 이유: 셰이더 소스의 문자 집합은 ASCII 로 한정돼
 * 있다. 주석 안의 한글을 그대로 넘기면 컴파일을 거부하는 드라이버가 있다.
 *
 * max(uToonRamp.y, ...) 는 경계 폭을 0 으로 두지 않기 위한 것이다.
 * smoothstep 은 두 경계값이 같으면 결과가 정의되지 않는다.
 *
 * 종이결(uToonPaper)은 두 군데에 쓴다.
 *
 * 1. 명암을 끊기 "전"에 밝기 값을 흔든다(uToonGrain.w).
 *    계산된 경계는 형상을 따라 매끄럽게 떨어져 기계로 그은 선처럼 보인다.
 *    손으로 칠한 그늘은 경계가 울퉁불퉁하다. 끊기 전에 값을 조금 흔들면 같은
 *    인상이 난다. 모델 텍스처를 바꾸지 않고 "칠한 느낌"에 가장 가까이 가는 방법이다.
 * 2. 색을 정한 "뒤"에 곱해 표면에 결을 남긴다(uToonGrain.y·z).
 */
const TOON_SHADING = /* glsl */ `
  vec3 toonAlbedo = baseColor.rgb * diffuseColor;
  float toonLevel = dot(diffuseBase, vec3(0.299, 0.587, 0.114));

  vec2 toonGrainUv = gl_FragCoord.xy / max(uToonGrain.x, 1.0);
  float toonGrain = texture2D(uToonPaper, toonGrainUv).r;
  toonLevel += (toonGrain - 0.5) * uToonGrain.w;

  float toonLit = smoothstep(uToonRamp.x, uToonRamp.x + max(uToonRamp.y, 0.001), toonLevel);
  vec3 toonColor = mix(toonAlbedo * uToonShade, toonAlbedo * uToonRamp.z, toonLit);

  float toonFresnel = 1.0 - clamp(dot(normalW, viewDirectionW), 0.0, 1.0);
  float toonRim = pow(toonFresnel, max(uToonRim.x, 0.001)) * uToonRim.y;
  toonColor += uToonRimColor * (toonRim * mix(uToonRim.z, 1.0, toonLit));

  float toonGrainAmount = mix(uToonGrain.z, uToonGrain.y, 1.0 - toonLit);
  toonColor *= 1.0 + (toonGrain - 0.5) * toonGrainAmount;

  color.rgb = toonColor;
`;

/** 주입 코드가 쓰는 vec3 유니폼. 순서는 아래 값 배열과 맞춘다. */
const TOON_UNIFORMS = [
  "uToonShade",
  "uToonRamp",
  "uToonRimColor",
  "uToonRim"
] as const;

/**
 * 메시에 외곽선을 켠다. renderOutline 을 직접 만지지 말고 이걸 쓴다.
 *
 * 뒤에 붙은 옵저버가 핵심이다. 외곽선은 메시를 한 번 더 그리는 별도 패스인데,
 * 그 과정에서 텍스처 유닛에 물린 것이 바뀐다. 그런데 Babylon 은 직전에 그린
 * 메시와 머티리얼·이펙트가 같으면 "다시 묶을 필요 없다"고 보고 본 패스의
 * 텍스처 바인딩을 통째로 건너뛴다(Material._mustRebind).
 *
 * 우리는 같은 캐릭터의 파트들이 머티리얼 한 벌을 공유하므로 이 조건에 정확히
 * 걸린다. 그러면 본 패스가 외곽선 패스가 남긴 엉뚱한 텍스처를 알베도로 읽어
 * 캐릭터가 무지개로 깨진다. 외곽선을 끄면 색이 정상으로 돌아오는 것으로 확인했다.
 *
 * 그릴 때마다 캐시를 무효화해 항상 다시 묶게 한다. 외곽선이 켜진 메시에만
 * 붙으므로 비용은 수십 개 수준이다.
 */
export function enableToonOutline(
  mesh: AbstractMesh,
  scene: Scene,
  width: number,
  color: Color3
): void {
  mesh.renderOutline = true;
  mesh.outlineWidth = width;
  mesh.outlineColor = color;
  if (mesh instanceof Mesh) {
    mesh.onBeforeDrawObservable.add(() => scene.resetCachedMaterial());
  }
}

export interface ToonOptions {
  /** 디퓨즈 텍스처. 없으면 color 만으로 칠한다. */
  readonly texture?: BaseTexture | undefined;
  /** 텍스처가 없을 때(또는 텍스처에 곱할) 기본색. */
  readonly color?: Color3 | undefined;
  /** 알파로 모양을 오려내는 파트(나뭇잎)인가. */
  readonly cutout?: boolean;
  /** 양면 렌더링. 잎처럼 판으로 된 파트에 필요하다. */
  readonly twoSided?: boolean;
  /** 림 라이트 세기 배율. 바닥처럼 넓고 평평한 면은 0으로 끈다. */
  readonly rim?: number;
}

function cacheKey(options: ToonOptions): string {
  return [
    options.texture?.uid ?? "-",
    options.color?.toHexString() ?? "-",
    options.cutout ? "cut" : "solid",
    options.twoSided ? "two" : "one",
    options.rim ?? 1
  ].join("|");
}

/**
 * 툰 머티리얼 하나를 만든다.
 *
 * 보통은 getToonMaterial 로 공유해서 쓴다. 이 함수는 매번 새로 만든다.
 */
export function createToonMaterial(
  scene: Scene,
  name: string,
  options: ToonOptions = {}
): CustomMaterial {
  // 셰이더 이름은 CustomMaterial 이 붙여 주는 것(머티리얼마다 다른 "custom_N")을
  // 그대로 둔다. 이름을 고정해 프로그램 수를 줄이고 싶어지지만, 그러면 안 된다.
  //
  // Effect 캐시 키는 "셰이더 이름 + defines" 가 전부다(thinEngine.createEffect).
  // 유니폼 값은 키에 들어가지 않으므로, 이름을 공유하면 조건만 같으면 서로 다른
  // 머티리얼이 Effect 객체 하나에 뭉친다. 우리 유니폼은 머티리얼 UBO 가 아니라
  // effect.setVector3 로 직접 넣는 값이고, Effect 는 "직전과 같은 값이면 건너뛰는"
  // 캐시를 하나만 갖는다. 그 캐시를 여러 머티리얼이 공유하면 서로의 값을 덮어쓰고,
  // 건너뛰기가 어긋나는 순간 남의 값이 그대로 남는다.
  // 바위가 새까맣고 캐릭터가 무지개로 깨진 원인이었다.
  //
  // 게다가 Builder 는 같은 이름이 이미 등록돼 있으면 소스를 다시 만들지 않고
  // 먼저 등록된 것을 쓴다(customMaterial.js). 공유는 득보다 실이 크다.
  //
  // 프로그램이 늘어나는 비용은 getToonMaterial 캐시가 이미 막는다.
  // 머티리얼은 조건별로 한 벌씩만 생겨서 씬 전체에 열 개 남짓이다.
  const material = new CustomMaterial(name, scene);

  // 림만 파트별로 조절한다. 나머지는 TOON 인스턴스를 그대로 공유하므로
  // TOON 값을 바꾸면 이미 만들어진 머티리얼에도 같이 반영된다.
  const values = [
    TOON.shade,
    TOON.ramp,
    TOON.rimColor,
    new Vector3(TOON.rim.x, TOON.rim.y * (options.rim ?? 1), TOON.rim.z)
  ];
  TOON_UNIFORMS.forEach((uniform, index) => {
    material.AddUniform(uniform, "vec3", values[index]);
  });
  material.AddUniform("uToonGrain", "vec4", TOON.grain);
  // 종이결은 텍스처라 종류가 다르다. AddUniform 이 "sampler" 가 들어간 선언을
  // 유니폼이 아니라 샘플러 목록으로 보내 준다(customMaterial.js 의 ReviewUniform).
  material.AddUniform("uToonPaper", "sampler2D", getPaperTexture(scene));
  material.Fragment_Before_Fog(TOON_SHADING);

  if (options.texture) {
    material.diffuseTexture = options.texture;
  }
  if (options.color) {
    material.diffuseColor = options.color;
  }

  // 스펙큘러 하이라이트는 아니메 룩에서 쓰지 않는다.
  // (최종 색을 덮어쓰므로 화면에는 어차피 안 나오지만, 꺼 두면 셰이더가 가벼워진다.)
  material.specularColor = Color3.Black();

  if (options.cutout && options.texture) {
    options.texture.hasAlpha = true;
    material.transparencyMode = MATERIAL_ALPHATEST;
    // transparencyMode 를 지정하면 Babylon 은 알파 테스트를 프래그먼트 끝으로
    // 미룬다(ALPHATEST_AFTERALLALPHACOMPUTATIONS). 그 자리에서 검사하는 값은
    // 텍스처 알파가 아니라 누적된 alpha 라서, 이 옵션을 켜지 않으면 잎이
    // 하나도 잘려 나가지 않는다. 투명 영역의 RGB 가 검정이라 나무가 검은
    // 판때기로 보인다.
    material.useAlphaFromDiffuseTexture = true;
  } else {
    // 로더가 켜 둔 알파를 물려받아 엉뚱하게 픽셀이 잘리지 않도록 못박는다.
    material.transparencyMode = MATERIAL_OPAQUE;
  }
  material.backFaceCulling = !options.twoSided;
  // 양면으로 그리는 파트는 뒷면의 법선이 빛을 등진 채로 들어와 통째로 어두워진다.
  // 나뭇잎이 검게 보이는 원인이다. 뒷면일 때 법선을 뒤집어 준다.
  material.twoSidedLighting = options.twoSided === true;

  return material;
}

/**
 * 같은 조건이면 머티리얼을 공유한다.
 *
 * 플레이어마다 새로 만들면 8명 접속 시 셰이더 프로그램과 머티리얼이 그만큼
 * 늘어난다. 텍스처·색·알파 조건이 같으면 한 벌로 충분하다.
 * 캐시는 씬에 매달아 두므로 씬이 사라지면 함께 사라진다.
 */
const CACHES = new WeakMap<Scene, Map<string, CustomMaterial>>();

export function getToonMaterial(
  scene: Scene,
  name: string,
  options: ToonOptions = {}
): CustomMaterial {
  let cache = CACHES.get(scene);
  if (!cache) {
    cache = new Map();
    CACHES.set(scene, cache);
  }

  const key = cacheKey(options);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const material = createToonMaterial(scene, name, options);
  cache.set(key, material);
  return material;
}
