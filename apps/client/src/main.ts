import "./styles.css";
import { GameApp } from "./GameApp";
import { UIController } from "./ui/UIController";

const canvas = document.getElementById("game-canvas");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("게임 캔버스를 찾을 수 없습니다.");
}

const ui = new UIController();
const game = new GameApp(canvas, ui);

ui.onJoin(async (nickname) => {
  await game.start(nickname);
});
