import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@starfall/shared";
import { GameRoom } from "./rooms/GameRoom";

type JsonResponse = {
  json(body: Record<string, string>): void;
  status(code: number): JsonResponse;
};

const port = Number.parseInt(process.env.PORT ?? "2567", 10);

const server = defineServer({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.get("/", (_request: unknown, response: JsonResponse) => {
      response.json({
        name: "Starfall Collectors server",
        status: "ok"
      });
    });
    app.get("/health", (_request: unknown, response: JsonResponse) => {
      response.status(200).json({ status: "ok" });
    });
  },
  rooms: {
    [ROOM_NAME]: defineRoom(GameRoom)
  }
});

await server.listen(port);
console.log(`[server] Starfall Collectors listening on http://localhost:${port}`);
