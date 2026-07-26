import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileScoreStore, MemoryScoreStore } from "./ScoreStore";

describe("MemoryScoreStore", () => {
  it("누적은 더하고 최고는 큰 쪽을 남긴다", async () => {
    const store = new MemoryScoreStore();
    await store.record("p1", "바나", 5);
    const second = await store.record("p1", "바나", 3);

    expect(second.total).toBe(8);
    expect(second.best).toBe(5);
  });

  it("음수 점수는 무시한다", async () => {
    const store = new MemoryScoreStore();
    const record = await store.record("p1", "바나", -10);
    expect(record.total).toBe(0);
    expect(record.best).toBe(0);
  });

  it("신원이 다르면 기록도 따로 쌓인다", async () => {
    const store = new MemoryScoreStore();
    // 닉네임이 같아도 신원이 다르면 남의 기록을 가져가지 못해야 한다.
    await store.record("p1", "바나", 7);
    await store.record("p2", "바나", 2);

    expect((await store.load("p1"))?.total).toBe(7);
    expect((await store.load("p2"))?.total).toBe(2);
  });

  it("누적 상위를 순서대로 돌려준다", async () => {
    const store = new MemoryScoreStore();
    await store.record("low", "a", 1);
    await store.record("high", "b", 9);
    await store.record("mid", "c", 5);

    expect((await store.top(2)).map((r) => r.playerId)).toEqual(["high", "mid"]);
  });
});

describe("FileScoreStore", () => {
  let directory = "";
  let path = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "starfall-store-"));
    path = join(directory, "nested", "scores.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("새 인스턴스에서도 기록을 이어받는다", async () => {
    const first = new FileScoreStore(path);
    await first.record("p1", "바나", 4);
    // 쓰기가 끝날 때까지 기다린 뒤 다시 읽는다.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = new FileScoreStore(path);
    expect((await second.load("p1"))?.total).toBe(4);
  });

  it("없던 디렉터리를 만들어 저장한다", async () => {
    const store = new FileScoreStore(path);
    await store.record("p1", "바나", 2);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const raw = JSON.parse(await readFile(path, "utf8")) as unknown[];
    expect(raw).toHaveLength(1);
  });

  it("파일이 깨져 있어도 빈 상태로 시작한다", async () => {
    const store = new FileScoreStore(path);
    // 점수 파일 하나 때문에 서버가 못 뜨면 안 된다.
    await expect(store.load("p1")).resolves.toBeUndefined();
  });
});
