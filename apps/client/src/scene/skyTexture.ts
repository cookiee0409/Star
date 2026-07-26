// 하늘 텍스처를 코드로 그린다. 세로 그라디언트 + 칠한 듯한 구름.
//
// GradientMaterial 을 쓰지 않는 이유: 그 셰이더는 최종색에 baseColor 를 한 번 더
// 곱한다(finalDiffuse = clamp(...) * baseColor.rgb). 색이 사실상 제곱되어 지정한
// 값보다 훨씬 어둡게 나오고, 무엇보다 구름 같은 무늬를 넣을 방법이 없다.
//
// 구체 UV 방향은 sphereBuilder 를 따른다. 구체는 위쪽 극(v=0)에서 아래쪽 극(v=1)
// 순서로 만들어지므로, invertY 를 끄면 데이터의 첫 줄이 하늘 꼭대기가 된다.
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { fbm, makeLattice, seededRandom, smoothstep, type Octave } from "./noise";

const WIDTH = 1024;
const HEIGHT = 512;

/** 하늘 꼭대기 · 지평선 색. 안개와 배경색이 지평선 값을 함께 쓴다. */
export const SKY_ZENITH = new Color3(0.33, 0.71, 0.73);
export const SKY_HORIZON = new Color3(0.72, 0.90, 0.88);

/** 구름. 완전한 흰색은 인쇄물처럼 떠 보여서 살짝 따뜻하게 뺀다. */
const CLOUD_LIGHT = new Color3(0.99, 0.99, 0.97);
const CLOUD_SHADE = new Color3(0.74, 0.85, 0.87);

const TEXTURES = new WeakMap<Scene, RawTexture>();

export function getSkyTexture(scene: Scene): RawTexture {
  const cached = TEXTURES.get(scene);
  if (cached) {
    return cached;
  }

  const random = seededRandom(20260727);
  // 덩어리 모양을 정하는 큰 노이즈와, 안쪽 명암을 정하는 작은 노이즈.
  //
  // 주파수를 낮게 잡으면 안 된다. 텍스처 가로 한 바퀴가 360도인데 화면에는
  // 한 번에 80도쯤만 들어오므로, 주파수 3이면 화면 안에서 노이즈가 거의 변하지
  // 않아 구름이 아니라 옅은 색조로만 보인다. 화면 안에 덩어리가 서너 개는
  // 들어와야 구름으로 읽힌다.
  const shape: Octave[] = [
    { grid: makeLattice(13, random), freq: 13, weight: 0.55 },
    { grid: makeLattice(27, random), freq: 27, weight: 0.3 },
    { grid: makeLattice(56, random), freq: 56, weight: 0.15 }
  ];
  const detail: Octave[] = [
    { grid: makeLattice(31, random), freq: 31, weight: 0.6 },
    { grid: makeLattice(73, random), freq: 73, weight: 0.4 }
  ];
  // 샘플 좌표 자체를 흔드는 노이즈(도메인 워핑).
  // 이게 없으면 문턱값으로 잘라낸 덩어리가 매끈한 타원이 되어 "번진 얼룩"처럼
  // 보인다. 좌표를 굽혀 주면 가장자리가 뭉게뭉게 말려 손으로 그린 윤곽이 된다.
  const warp: Octave[] = [
    { grid: makeLattice(9, random), freq: 9, weight: 0.65 },
    { grid: makeLattice(21, random), freq: 21, weight: 0.35 }
  ];

  const data = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    // 첫 줄이 꼭대기이므로 뒤집어 고도로 쓴다. 1 = 머리 위, 0 = 발밑.
    const elevation = 1 - y / (HEIGHT - 1);
    // 지평선(0.5) 위쪽만 하늘로 쓴다. 아래는 어차피 지형에 가린다.
    const above = Math.max(0, (elevation - 0.5) * 2);

    // 하늘색: 지평선에서 옅고 위로 갈수록 진해진다.
    // 지수를 1보다 한참 작게 잡아야 조금만 올려다봐도 청록이 올라온다.
    // 1에 가까우면 화면에 들어오는 낮은 고도가 전부 옅은 색이라 밋밋하다.
    const t = Math.pow(above, 0.45);
    const baseR = SKY_HORIZON.r + (SKY_ZENITH.r - SKY_HORIZON.r) * t;
    const baseG = SKY_HORIZON.g + (SKY_ZENITH.g - SKY_HORIZON.g) * t;
    const baseB = SKY_HORIZON.b + (SKY_ZENITH.b - SKY_HORIZON.b) * t;

    // 지평선에 딱 붙은 곳만 비우고 꼭대기까지 구름을 깐다. 올려다봤을 때
    // 머리 위가 텅 비어 있으면 하늘이 단조로워 보인다.
    const band = smoothstep(0, 0.12, above) * (1 - 0.35 * smoothstep(0.6, 1, above));

    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / WIDTH;
      // 가로로는 한 바퀴 돌아 이어져야 한다. 세로는 눌러서 구름을 옆으로 늘인다.
      const v = above * 0.55;
      // 좌표를 굽힌 뒤에 덩어리를 읽는다. u 는 감기므로 더해도 이음매가 없다.
      const warpU = (fbm(warp, u, v) - 0.5) * 0.14;
      const warpV = (fbm(warp, u + 0.37, v + 0.19) - 0.5) * 0.1;
      const mass = fbm(shape, u + warpU, v + warpV);
      // 문턱 폭을 좁게 잡아야 윤곽이 선다. 넓으면 안개처럼 흐릿해진다.
      const cover = smoothstep(0.46, 0.57, mass) * band;

      let r = baseR;
      let g = baseG;
      let b = baseB;
      if (cover > 0) {
        const inner = fbm(detail, u + warpU, above * 0.8);
        // 두꺼운 심지는 밝고 가장자리는 그늘진다. 이 둘이 같이 있어야
        // 평평한 오려낸 종이가 아니라 부피가 있는 덩어리로 보인다.
        const core = smoothstep(0.5, 0.74, mass);
        const lit = 0.3 + 0.7 * (core * 0.55 + smoothstep(0.4, 0.7, inner) * 0.45);
        const cr = CLOUD_SHADE.r + (CLOUD_LIGHT.r - CLOUD_SHADE.r) * lit;
        const cg = CLOUD_SHADE.g + (CLOUD_LIGHT.g - CLOUD_SHADE.g) * lit;
        const cb = CLOUD_SHADE.b + (CLOUD_LIGHT.b - CLOUD_SHADE.b) * lit;
        r += (cr - r) * cover;
        g += (cg - g) * cover;
        b += (cb - b) * cover;
      }

      const offset = (y * WIDTH + x) * 4;
      data[offset] = Math.round(Math.min(1, r) * 255);
      data[offset + 1] = Math.round(Math.min(1, g) * 255);
      data[offset + 2] = Math.round(Math.min(1, b) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = RawTexture.CreateRGBATexture(
    data,
    WIDTH,
    HEIGHT,
    scene,
    true,
    // 데이터 첫 줄을 그대로 v=0(구체 꼭대기)에 맞춘다.
    false,
    Texture.BILINEAR_SAMPLINGMODE
  );
  texture.name = "sky-gradient";
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  TEXTURES.set(scene, texture);
  return texture;
}
