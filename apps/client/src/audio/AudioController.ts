// 소리 재생 창구. 게임 코드는 play("fragmentCollect") 만 부르면 된다.
//
// 브라우저는 사용자가 무언가 누르기 전에는 소리를 못 내게 막는다(자동재생 정책).
// 그래서 AudioContext 를 미리 만들지 않고 첫 입력 때 만든다. 그전의 play 는
// 조용히 무시한다 — 소리는 게임이 멈출 이유가 아니다.
//
// BGM 은 아직 없다. 합성한 앰비언트는 반복되면 금방 질려서, CC0 트랙을 넣을
// 자리(setMusic)만 열어 두었다.
import { RECIPES, type SoundName } from "./synth";

const VOLUME_KEY = "starfall.volume";

interface StoredVolume {
  sfx: number;
  music: number;
}

function readVolume(): StoredVolume {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (!raw) {
      return { sfx: 0.8, music: 0.5 };
    }
    const parsed = JSON.parse(raw) as Partial<StoredVolume>;
    return {
      sfx: clamp01(parsed.sfx ?? 0.8),
      music: clamp01(parsed.music ?? 0.5)
    };
  } catch {
    // 저장값이 깨져 있어도 소리 때문에 게임이 멈추면 안 된다.
    return { sfx: 0.8, music: 0.5 };
  }
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export class AudioController {
  private ctx: AudioContext | undefined;
  private sfxBus: GainNode | undefined;
  private musicBus: GainNode | undefined;
  private music: AudioBufferSourceNode | undefined;
  private volume = readVolume();
  /** 같은 소리가 한 프레임에 여러 번 겹쳐 찢어지는 것을 막는다. */
  private readonly lastPlayedAt = new Map<SoundName, number>();

  /**
   * 첫 사용자 입력에 맞춰 오디오를 연다.
   * 여러 번 불러도 안전하다.
   */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.volume.sfx;
    this.sfxBus.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volume.music;
    this.musicBus.connect(ctx.destination);
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== "running") {
      return;
    }
    const now = ctx.currentTime;
    const previous = this.lastPlayedAt.get(name) ?? -1;
    if (now - previous < 0.04) {
      return;
    }
    this.lastPlayedAt.set(name, now);
    RECIPES[name](ctx, bus);
  }

  /**
   * 반복 재생할 배경음을 건다. CC0 트랙을 넣게 되면 여기로 들어온다.
   * 아직 호출하는 곳은 없다.
   */
  setMusic(buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) {
      return;
    }
    this.music?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(bus);
    source.start();
    this.music = source;
  }

  setSfxVolume(value: number): void {
    this.volume.sfx = clamp01(value);
    if (this.sfxBus) {
      this.sfxBus.gain.value = this.volume.sfx;
    }
    this.saveVolume();
  }

  setMusicVolume(value: number): void {
    this.volume.music = clamp01(value);
    if (this.musicBus) {
      this.musicBus.gain.value = this.volume.music;
    }
    this.saveVolume();
  }

  get volumes(): StoredVolume {
    return { ...this.volume };
  }

  private saveVolume(): void {
    try {
      window.localStorage.setItem(VOLUME_KEY, JSON.stringify(this.volume));
    } catch {
      // 저장 실패는 무시한다. 시크릿 모드에서도 게임은 돌아가야 한다.
    }
  }
}
