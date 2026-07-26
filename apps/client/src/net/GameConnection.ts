import { Client } from "@colyseus/sdk";
import { ROOM_NAME, type GameState } from "@starfall/shared";
import { getPlayerId } from "./playerId";

const RETRY_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 13_000, 13_000, 13_000];

export type ConnectionRetry = {
  attempt: number;
  maxAttempts: number;
};

export class GameConnection {
  private readonly client: Client;

  constructor(serverUrl: string) {
    this.client = new Client(serverUrl);
  }

  async connect(
    nickname: string,
    onRetry?: (progress: ConnectionRetry) => void
  ) {
    const maxAttempts = RETRY_DELAYS_MS.length + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.client.joinOrCreate<GameState>(ROOM_NAME, {
          nickname,
          playerId: getPlayerId()
        });
      } catch (error) {
        lastError = error;
        const retryDelay = RETRY_DELAYS_MS[attempt - 1];
        if (retryDelay === undefined) {
          break;
        }
        onRetry?.({ attempt, maxAttempts });
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, retryDelay);
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("서버에 연결할 수 없습니다.");
  }
}
