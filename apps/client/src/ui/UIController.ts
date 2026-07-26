import { CONFIG, isValidNickname, sanitizeNickname } from "@starfall/shared";
import { ServerUrlError } from "../net/serverUrl";

type StatusTone = "idle" | "connecting" | "online" | "error";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required UI element #${id} was not found.`);
  }
  return element as T;
}

export class UIController {
  private readonly startScreen = requireElement<HTMLElement>("start-screen");
  private readonly gameUI = requireElement<HTMLElement>("game-ui");
  private readonly joinForm = requireElement<HTMLFormElement>("join-form");
  private readonly nicknameInput = requireElement<HTMLInputElement>("nickname");
  private readonly nicknameCount = requireElement<HTMLElement>("nickname-count");
  private readonly formError = requireElement<HTMLElement>("form-error");
  private readonly playButton = requireElement<HTMLButtonElement>("play-button");
  private readonly connectionDot = requireElement<HTMLElement>("connection-dot");
  private readonly connectionStatus =
    requireElement<HTMLElement>("connection-status");
  private readonly hudNickname = requireElement<HTMLElement>("hud-nickname");
  private readonly hudScore = requireElement<HTMLElement>("hud-score");
  private readonly hudProfile = requireElement<HTMLElement>("hud-profile");
  private readonly hudTotal = requireElement<HTMLElement>("hud-total");
  private readonly hudBest = requireElement<HTMLElement>("hud-best");
  private readonly hudPlayers = requireElement<HTMLElement>("hud-players");
  private readonly hudTimer = requireElement<HTMLElement>("hud-timer");
  private readonly collectPrompt = requireElement<HTMLElement>("collect-prompt");
  private readonly eventBanner = requireElement<HTMLElement>("event-banner");
  private readonly eventMessage = requireElement<HTMLElement>("event-message");
  private readonly notice = requireElement<HTMLElement>("notice");
  private readonly fatalError = requireElement<HTMLElement>("fatal-error");
  private readonly fatalErrorMessage =
    requireElement<HTMLElement>("fatal-error-message");

  private readonly chatLog = requireElement<HTMLElement>("chat-log");
  private readonly chatForm = requireElement<HTMLFormElement>("chat-form");
  private readonly chatInput = requireElement<HTMLInputElement>("chat-input");
  private readonly audioToggle = requireElement<HTMLButtonElement>("audio-toggle");
  private readonly audioSliders = requireElement<HTMLElement>("audio-sliders");
  private readonly sfxRange = requireElement<HTMLInputElement>("volume-sfx");
  private readonly musicRange = requireElement<HTMLInputElement>("volume-music");

  private bannerTimeout: number | undefined;
  private noticeTimeout: number | undefined;
  private nickname = "";

  constructor() {
    this.nicknameInput.addEventListener("input", () => {
      this.nicknameCount.textContent = `${this.nicknameInput.value.length} / 12`;
      this.formError.textContent = "";
    });
  }

  /**
   * Enter 로 채팅창을 열고 닫는다.
   *
   * 입력창이 열려 있을 때의 Enter 는 form 의 submit 이 가져가므로 여기서
   * 다루지 않는다. keydown 을 캡처 단계에서 받지 않는 것도 같은 이유다.
   */
  onChat(handler: (text: string) => void): void {
    window.addEventListener("keydown", (event) => {
      if (event.code !== "Enter" && event.code !== "NumpadEnter") {
        return;
      }
      if (this.startScreen.classList.contains("is-hidden") === false) {
        return;
      }
      if (document.activeElement === this.chatInput) {
        return;
      }
      event.preventDefault();
      this.chatForm.classList.remove("is-hidden");
      this.chatInput.focus();
    });

    this.chatInput.addEventListener("keydown", (event) => {
      if (event.code === "Escape") {
        this.closeChat();
      }
    });

    this.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = this.chatInput.value.trim();
      this.chatInput.value = "";
      this.closeChat();
      if (text.length > 0) {
        handler(text);
      }
    });
  }

  /**
   * 채팅 한 줄을 화면에 넣는다.
   *
   * 반드시 textContent 로만 넣는다. 남이 보낸 문자열이므로 innerHTML 로 넣으면
   * 그대로 스크립트가 된다. 서버가 태그를 지우지 않는 것도 이 전제 때문이다.
   */
  appendChat(nickname: string, text: string): void {
    const line = document.createElement("li");
    const name = document.createElement("span");
    name.className = "chat-name";
    name.textContent = nickname;
    name.dataset.self = String(nickname === this.nickname);
    line.append(name, document.createTextNode(text));
    this.chatLog.append(line);

    while (this.chatLog.childElementCount > CONFIG.CHAT_HISTORY) {
      this.chatLog.firstElementChild?.remove();
    }
  }

  private closeChat(): void {
    this.chatInput.blur();
    this.chatForm.classList.add("is-hidden");
  }

  /**
   * 소리 설정을 연결한다.
   *
   * 슬라이더의 현재 값은 AudioController 가 들고 있으므로(저장까지 그쪽 몫이다)
   * 여기서는 초기값을 받아 표시하고, 움직이면 그대로 넘긴다.
   */
  bindAudioControls(
    initial: { sfx: number; music: number },
    onChange: (kind: "sfx" | "music", value: number) => void
  ): void {
    this.sfxRange.value = String(Math.round(initial.sfx * 100));
    this.musicRange.value = String(Math.round(initial.music * 100));

    this.audioToggle.addEventListener("click", () => {
      const open = this.audioSliders.classList.toggle("is-hidden");
      this.audioToggle.setAttribute("aria-expanded", String(!open));
    });
    this.sfxRange.addEventListener("input", () => {
      onChange("sfx", Number(this.sfxRange.value) / 100);
    });
    this.musicRange.addEventListener("input", () => {
      onChange("music", Number(this.musicRange.value) / 100);
    });
  }

  onJoin(handler: (nickname: string) => Promise<void>): void {
    this.joinForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nickname = sanitizeNickname(this.nicknameInput.value);
      this.nicknameInput.value = nickname;
      this.nicknameCount.textContent = `${nickname.length} / 12`;

      if (!isValidNickname(nickname)) {
        this.formError.textContent =
          "문자·숫자·공백을 사용해 2~12자로 입력해 주세요.";
        this.nicknameInput.focus();
        return;
      }

      this.formError.textContent = "";
      this.setJoinPending(true);
      try {
        await handler(nickname);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "서버에 연결할 수 없습니다.";
        this.setConnectionStatus(message, "error");
        // 설정 오류는 서버를 켜도 해결되지 않으므로 원인을 그대로 보여준다.
        this.formError.textContent =
          error instanceof ServerUrlError
            ? message
            : "연결하지 못했습니다. 서버 실행 상태를 확인해 주세요.";
        this.setJoinPending(false);
      }
    });
  }

  setConnectionStatus(message: string, tone: StatusTone): void {
    this.connectionStatus.textContent = message;
    this.connectionDot.dataset.tone = tone;
  }

  enterGame(nickname: string): void {
    this.nickname = nickname;
    this.hudNickname.textContent = nickname;
    this.startScreen.classList.add("is-hidden");
    this.gameUI.classList.remove("is-hidden");
  }

  setScore(score: number): void {
    this.hudScore.textContent = String(score);
  }

  /** 지난 기록. 처음 온 사람에게는 0만 보여줄 이유가 없어 숨긴다. */
  setProfile(total: number, best: number): void {
    if (total <= 0 && best <= 0) {
      this.hudProfile.classList.add("is-hidden");
      return;
    }
    this.hudTotal.textContent = String(total);
    this.hudBest.textContent = String(best);
    this.hudProfile.classList.remove("is-hidden");
  }

  setPlayerCount(count: number): void {
    this.hudPlayers.textContent = String(count);
  }

  setMeteorTimer(nextMeteorAt: number, meteorActive: boolean): void {
    if (meteorActive) {
      this.hudTimer.textContent = "낙하 중";
      return;
    }
    if (nextMeteorAt <= 0) {
      this.hudTimer.textContent = "대기";
      return;
    }
    const seconds = Math.max(0, Math.ceil((nextMeteorAt - Date.now()) / 1000));
    this.hudTimer.textContent = `${seconds}초`;
  }

  setCollectPrompt(visible: boolean): void {
    this.collectPrompt.classList.toggle("is-hidden", !visible);
  }

  showMeteorBanner(direction: string): void {
    if (this.bannerTimeout !== undefined) {
      window.clearTimeout(this.bannerTimeout);
    }
    this.eventMessage.textContent = `별똥별이 나타났습니다 · ${direction}`;
    this.eventBanner.classList.remove("is-hidden");
    this.bannerTimeout = window.setTimeout(() => {
      this.eventBanner.classList.add("is-hidden");
    }, 5_000);
  }

  hideMeteorBanner(): void {
    this.eventBanner.classList.add("is-hidden");
  }

  showNotice(message: string): void {
    if (this.noticeTimeout !== undefined) {
      window.clearTimeout(this.noticeTimeout);
    }
    this.notice.textContent = message;
    this.notice.classList.remove("is-hidden");
    this.noticeTimeout = window.setTimeout(() => {
      this.notice.classList.add("is-hidden");
    }, 2_350);
  }

  showFatalError(message: string): void {
    this.fatalErrorMessage.textContent = message;
    this.fatalError.classList.remove("is-hidden");
  }

  private setJoinPending(pending: boolean): void {
    this.playButton.disabled = pending;
    this.nicknameInput.disabled = pending;
    const label = this.playButton.querySelector("span");
    if (label) {
      label.textContent = pending ? "세계에 연결하는 중…" : "별빛 세계 입장";
    }
    if (pending) {
      this.setConnectionStatus("공개 방을 찾는 중", "connecting");
    }
  }

  get maxPlayers(): number {
    return CONFIG.MAX_PLAYERS;
  }
}

