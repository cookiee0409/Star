// 효과음을 코드로 만든다.
//
// 파일을 받아오지 않는 이유는 에셋과 같다. 하나 늘 때마다 출처·라이선스·용량을
// 같이 관리해야 하는데, 이 게임에 필요한 소리는 짧은 신호음 몇 개라 합성이 더 싸다.
// 대신 BGM 은 합성하지 않는다. 반복되는 앰비언트는 합성하면 금방 질린다.
//
// 모든 소리는 "짧은 잡음/파형 + 빠르게 닫히는 엔벨로프" 라는 같은 뼈대를 쓴다.
// 아니메 톤에 맞춰 날카로운 어택은 피하고 부드럽게 여닫는다.

type Ctx = AudioContext;

/** 잡음 한 덩어리. 충돌·바람처럼 음정이 없는 소리의 재료다. */
function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** 시간에 따라 여닫는 음량. 이게 없으면 모든 소리가 "삑" 하고 끊긴다. */
function envelope(
  ctx: Ctx,
  destination: AudioNode,
  attack: number,
  decay: number,
  peak: number
): GainNode {
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  gain.connect(destination);
  return gain;
}

/** 음정이 있는 짧은 소리. 시작음에서 끝음으로 미끄러진다. */
function tone(
  ctx: Ctx,
  destination: AudioNode,
  options: {
    from: number;
    to: number;
    duration: number;
    type?: OscillatorType;
    peak?: number;
    attack?: number;
  }
): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = options.type ?? "sine";
  osc.frequency.setValueAtTime(options.from, now);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(1, options.to),
    now + options.duration
  );
  const attack = options.attack ?? 0.008;
  osc.connect(
    envelope(ctx, destination, attack, options.duration, options.peak ?? 0.3)
  );
  osc.start(now);
  osc.stop(now + attack + options.duration + 0.05);
}

/** 음정이 없는 소리. 필터를 걸어 "쉬익"과 "쿵"을 구분한다. */
function noise(
  ctx: Ctx,
  destination: AudioNode,
  options: {
    duration: number;
    filter: BiquadFilterType;
    from: number;
    to: number;
    peak?: number;
    q?: number;
  }
): void {
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, options.duration + 0.1);

  const band = ctx.createBiquadFilter();
  band.type = options.filter;
  band.frequency.setValueAtTime(options.from, now);
  band.frequency.exponentialRampToValueAtTime(
    Math.max(1, options.to),
    now + options.duration
  );
  band.Q.value = options.q ?? 1;

  source.connect(band);
  band.connect(envelope(ctx, destination, 0.01, options.duration, options.peak ?? 0.25));
  source.start(now);
  source.stop(now + options.duration + 0.1);
}

export type SoundName =
  | "meteorWarning"
  | "meteorFall"
  | "meteorImpact"
  | "fragmentSpawn"
  | "fragmentCollect"
  | "uiClick"
  | "chat";

/** 소리 하나하나의 처방. 새 소리를 넣으려면 여기에 한 줄 추가한다. */
export const RECIPES: Record<SoundName, (ctx: Ctx, out: AudioNode) => void> = {
  // 하늘에서 신호가 온다. 위로 올라가는 음이라 "무언가 온다"로 읽힌다.
  meteorWarning: (ctx, out) => {
    tone(ctx, out, { from: 520, to: 1180, duration: 0.5, peak: 0.22 });
    tone(ctx, out, { from: 780, to: 1770, duration: 0.5, peak: 0.1, type: "triangle" });
  },
  // 낙하. 길게 스치는 바람.
  meteorFall: (ctx, out) => {
    noise(ctx, out, {
      duration: 1.5,
      filter: "bandpass",
      from: 2600,
      to: 420,
      peak: 0.2,
      q: 1.4
    });
  },
  // 충돌. 낮게 떨어지는 몸통 + 흩어지는 잡음.
  meteorImpact: (ctx, out) => {
    tone(ctx, out, { from: 180, to: 42, duration: 0.55, type: "sine", peak: 0.5 });
    noise(ctx, out, {
      duration: 0.4,
      filter: "lowpass",
      from: 1800,
      to: 260,
      peak: 0.32
    });
  },
  // 조각이 생겼다. 맑고 짧게, 여러 개가 겹쳐도 시끄럽지 않도록 작게.
  fragmentSpawn: (ctx, out) => {
    tone(ctx, out, { from: 1250, to: 1900, duration: 0.16, peak: 0.12 });
  },
  // 획득. 두 음을 올려 붙여 "얻었다"는 느낌을 만든다.
  fragmentCollect: (ctx, out) => {
    tone(ctx, out, { from: 880, to: 1320, duration: 0.12, peak: 0.28 });
    window.setTimeout(() => {
      tone(ctx, out, { from: 1320, to: 1760, duration: 0.18, peak: 0.22 });
    }, 90);
  },
  uiClick: (ctx, out) => {
    tone(ctx, out, { from: 660, to: 520, duration: 0.07, type: "triangle", peak: 0.16 });
  },
  chat: (ctx, out) => {
    tone(ctx, out, { from: 980, to: 1140, duration: 0.08, type: "sine", peak: 0.12 });
  }
};
