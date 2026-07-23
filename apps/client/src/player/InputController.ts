export class InputController {
  private readonly pressed = new Set<string>();
  private collectQueued = false;

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (event.repeat && event.code === "KeyE") {
        return;
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
}

