// 타일링되는 값 노이즈. 종이결과 하늘 구름이 함께 쓴다.
//
// 격자 번호를 감아서(wrap) 읽으므로 u, v 가 1을 넘어가도 반대편으로 이어진다.
// 하늘은 구체를 한 바퀴 감싸므로 이 성질이 없으면 이음매가 보인다.

/** 배치를 매번 같게 하려고 쓰는 고정 시드 난수. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** freq × freq 격자에 난수를 채운다. */
export function makeLattice(freq: number, random: () => number): Float32Array {
  const grid = new Float32Array(freq * freq);
  for (let index = 0; index < grid.length; index += 1) {
    grid[index] = random();
  }
  return grid;
}

/** 격자를 부드럽게 보간해 읽는다. 선형 보간만 쓰면 격자 모양이 그대로 보인다. */
export function sampleLattice(
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

export interface Octave {
  readonly grid: Float32Array;
  readonly freq: number;
  readonly weight: number;
}

/** 여러 크기의 노이즈를 겹쳐 읽는다. 한 옥타브만 쓰면 균일한 잡음으로 보인다. */
export function fbm(octaves: readonly Octave[], u: number, v: number): number {
  let value = 0;
  for (const octave of octaves) {
    value += sampleLattice(octave.grid, octave.freq, u, v) * octave.weight;
  }
  return value;
}

/** 0..1 구간의 부드러운 계단. GLSL smoothstep 과 같다. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
