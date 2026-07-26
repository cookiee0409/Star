// 종이결 텍스처를 코드로 만든다.
//
// 파일로 받아 오지 않는 이유: 에셋이 하나 늘면 출처·라이선스·용량을 같이
// 관리해야 한다(다른 에셋들처럼 README 에 기록해야 한다). 이 텍스처는 규칙적인
// 잡음일 뿐이라 코드로 만드는 편이 싸고, 값을 바꿔 가며 바로 확인할 수도 있다.
//
// 타일링이 되어야 한다. 격자를 감아서(wrap) 보간하므로 이음매가 생기지 않는다.
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

const SIZE = 256;

/** 배치를 매번 같게 하려고 쓰는 고정 시드 난수. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** freq × freq 격자에 난수를 채운다. */
function makeLattice(freq: number, random: () => number): Float32Array {
  const grid = new Float32Array(freq * freq);
  for (let index = 0; index < grid.length; index += 1) {
    grid[index] = random();
  }
  return grid;
}

/**
 * 격자를 부드럽게 보간해 읽는다.
 *
 * 격자 번호를 freq 로 나눈 나머지로 감으므로 u, v 가 1을 넘어가도
 * 반대편으로 이어진다 — 그래서 타일링이 된다.
 */
function sampleLattice(
  grid: Float32Array,
  freq: number,
  u: number,
  v: number
): number {
  const x = u * freq;
  const y = v * freq;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  // smoothstep. 선형 보간만 쓰면 격자 모양이 그대로 보인다.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const col0 = ((x0 % freq) + freq) % freq;
  const col1 = (col0 + 1) % freq;
  const row0 = ((y0 % freq) + freq) % freq;
  const row1 = (row0 + 1) % freq;

  const a = grid[row0 * freq + col0]!;
  const b = grid[row0 * freq + col1]!;
  const c = grid[row1 * freq + col0]!;
  const d = grid[row1 * freq + col1]!;

  const top = a * (1 - sx) + b * sx;
  const bottom = c * (1 - sx) + d * sx;
  return top * (1 - sy) + bottom * sy;
}

const TEXTURES = new WeakMap<Scene, RawTexture>();

/**
 * 씬에 하나뿐인 종이결 텍스처.
 *
 * 굵은 얼룩 · 중간 결 · 미세한 입자를 겹쳐 종이처럼 만든다. 한 옥타브만
 * 쓰면 균일한 노이즈가 되어 "지저분한 화면"으로 보인다. 여러 크기를 섞어야
 * 종이로 읽힌다.
 */
export function getPaperTexture(scene: Scene): RawTexture {
  const cached = TEXTURES.get(scene);
  if (cached) {
    return cached;
  }

  const random = seededRandom(20260727);
  const octaves = [
    { grid: makeLattice(4, random), freq: 4, weight: 0.5 },
    { grid: makeLattice(16, random), freq: 16, weight: 0.3 },
    { grid: makeLattice(64, random), freq: 64, weight: 0.2 }
  ];

  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const u = x / SIZE;
      const v = y / SIZE;
      let value = 0;
      for (const octave of octaves) {
        value += sampleLattice(octave.grid, octave.freq, u, v) * octave.weight;
      }
      // 0.5 를 중심으로 좁게 모은다. 셰이더가 (값 - 0.5) 를 곱해 쓰므로
      // 여기서 폭이 넓으면 화면이 얼룩덜룩해진다.
      const level = Math.round((0.5 + (value - 0.5) * 0.9) * 255);
      const offset = (y * SIZE + x) * 4;
      data[offset] = level;
      data[offset + 1] = level;
      data[offset + 2] = level;
      data[offset + 3] = 255;
    }
  }

  const texture = RawTexture.CreateRGBATexture(
    data,
    SIZE,
    SIZE,
    scene,
    // 화면 좌표로 거의 1:1 로 찍으므로 밉맵이 필요 없다.
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE
  );
  texture.name = "paper-grain";
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;

  TEXTURES.set(scene, texture);
  return texture;
}
