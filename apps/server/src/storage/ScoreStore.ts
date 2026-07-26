// 점수 저장소.
//
// 지금은 파일 한 장에 쓰지만, 이 인터페이스만 지키면 SQLite·Postgres·Redis 로
// 갈아끼울 수 있다. 기획서 확장 E 가 요구하는 구조다.
//
// 무료 배포(Render Free)의 디스크는 재시작하면 사라진다. 그래서 이 구현은
// "같은 프로세스가 살아 있는 동안"과 "직접 띄운 서버"에서만 진짜로 영속한다.
// 진짜 영속이 필요해지면 같은 인터페이스로 DB 구현을 하나 더 만들면 된다.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface PlayerRecord {
  /** 브라우저가 들고 있는 신원. 계정이 없으므로 이게 유일한 식별자다. */
  readonly playerId: string;
  /** 마지막으로 쓴 닉네임. 표시용이고 식별에는 쓰지 않는다. */
  nickname: string;
  /** 누적 수집 개수. */
  total: number;
  /** 한 판 최고 기록. */
  best: number;
  updatedAt: number;
}

export interface ScoreStore {
  load(playerId: string): Promise<PlayerRecord | undefined>;
  /** 이번 판 점수를 반영한다. 누적은 더하고 최고는 큰 쪽을 남긴다. */
  record(playerId: string, nickname: string, sessionScore: number): Promise<PlayerRecord>;
  /** 누적 상위 목록. */
  top(limit: number): Promise<PlayerRecord[]>;
}

/** 저장이 꺼져 있을 때 쓰는 빈 구현. 게임은 그대로 돌아간다. */
export class MemoryScoreStore implements ScoreStore {
  protected readonly records = new Map<string, PlayerRecord>();

  async load(playerId: string): Promise<PlayerRecord | undefined> {
    return this.records.get(playerId);
  }

  async record(
    playerId: string,
    nickname: string,
    sessionScore: number
  ): Promise<PlayerRecord> {
    const previous = this.records.get(playerId);
    const next: PlayerRecord = {
      playerId,
      nickname,
      total: (previous?.total ?? 0) + Math.max(0, sessionScore),
      best: Math.max(previous?.best ?? 0, Math.max(0, sessionScore)),
      updatedAt: Date.now()
    };
    this.records.set(playerId, next);
    return next;
  }

  async top(limit: number): Promise<PlayerRecord[]> {
    return [...this.records.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
}

/**
 * 파일 한 장에 JSON 으로 쓰는 구현.
 *
 * 메모리에 전부 들고 있다가 통째로 덮어쓴다. 이 게임 규모(한 방 8명)에서는
 * 이걸로 충분하고, 부족해지는 시점이 곧 DB 로 갈아탈 시점이다.
 *
 * 쓰기는 임시 파일에 먼저 하고 이름을 바꾼다. 쓰는 도중에 프로세스가 죽어도
 * 반쯤 쓰인 JSON 이 남지 않는다.
 */
export class FileScoreStore extends MemoryScoreStore {
  private ready: Promise<void> | undefined;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    super();
  }

  private async ensureLoaded(): Promise<void> {
    this.ready ??= (async () => {
      try {
        const raw = await readFile(this.filePath, "utf8");
        const parsed = JSON.parse(raw) as PlayerRecord[];
        for (const record of parsed) {
          if (typeof record?.playerId === "string") {
            this.records.set(record.playerId, record);
          }
        }
      } catch {
        // 파일이 없거나 깨졌으면 빈 상태로 시작한다.
        // 점수 기록 때문에 서버가 못 뜨면 안 된다.
      }
    })();
    return this.ready;
  }

  override async load(playerId: string): Promise<PlayerRecord | undefined> {
    await this.ensureLoaded();
    return super.load(playerId);
  }

  override async record(
    playerId: string,
    nickname: string,
    sessionScore: number
  ): Promise<PlayerRecord> {
    await this.ensureLoaded();
    const next = await super.record(playerId, nickname, sessionScore);
    this.flush();
    return next;
  }

  override async top(limit: number): Promise<PlayerRecord[]> {
    await this.ensureLoaded();
    return super.top(limit);
  }

  /** 쓰기를 한 줄로 세운다. 동시에 두 번 쓰면 파일이 섞인다. */
  private flush(): void {
    this.writing = this.writing.then(async () => {
      try {
        const temporary = `${this.filePath}.tmp`;
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(temporary, JSON.stringify([...this.records.values()]), "utf8");
        await rename(temporary, this.filePath);
      } catch (error) {
        console.warn("[store] 점수를 저장하지 못했습니다.", error);
      }
    });
  }
}

/**
 * 환경변수로 저장소를 고른다.
 *
 *   SCORE_STORE=none  저장하지 않음
 *   SCORE_STORE=file  파일(기본). 경로는 SCORE_STORE_PATH
 */
export function createScoreStore(): ScoreStore {
  if ((process.env.SCORE_STORE ?? "file") === "none") {
    console.log("[store] 점수를 저장하지 않습니다 (SCORE_STORE=none)");
    return new MemoryScoreStore();
  }
  const path =
    process.env.SCORE_STORE_PATH ?? join(process.cwd(), "data", "scores.json");
  // 어디에 쌓이는지 모르면 배포에서 찾기 어렵다. 시작할 때 한 줄 남긴다.
  console.log(`[store] 점수 파일: ${path}`);
  return new FileScoreStore(path);
}
