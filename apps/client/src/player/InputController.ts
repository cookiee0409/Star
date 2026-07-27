/**
 * 글자를 입력받는 요소에 포커스가 있는가.
 *
 * 채팅을 치는 동안 WASD 가 캐릭터를 움직이면 안 된다. 키 이벤트는 window 에서
 * 받으므로 입력창에서 올라온 것인지 여기서 걸러야 한다.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  );
}

export class InputController {
  private readonly pressed = new Set<string>();
  private collectQueued = false;
  private jumpQueued = false;

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (isTyping(event.target)) {
        // 입력창으로 들어간 키는 무시하되, 눌린 채로 남지 않도록 비운다.
        // 그러지 않으면 W 를 누른 채 채팅을 열면 계속 걷는다.
        this.pressed.clear();
        return;
      }
      // 눌러 두면 계속 발동하는 키가 아니다. 한 번 누를 때 한 번만 센다.
      if (event.repeat && (event.code === "KeyE" || event.code === "Space")) {
        return;
      }
      if (event.code === "Space") {
        // 스페이스는 기본 동작이 스크롤이다.
        event.preventDefault();
        this.jumpQueued = true;
      }
      this.pressed.add(event.code);
      if (event.code === "KeyE") {
        this.collectQueued = true;
      }
    });
    window.addEventListener("keyup", (event) => {
      this.pressed.delete(event.code);
    });
    window.addEventListener("blur", () => this.pressed.clear());
  }

  get horizontal(): number {
    return Number(this.pressed.has("KeyD")) - Number(this.pressed.has("KeyA"));
  }

  get vertical(): number {
    return Number(this.pressed.has("KeyW")) - Number(this.pressed.has("KeyS"));
  }

  get running(): boolean {
    return this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight");
  }

  consumeCollect(): boolean {
    const queued = this.collectQueued;
    this.collectQueued = false;
    return queued;
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }
}

