// 이 브라우저의 신원.
//
// 계정이 없는 게임이라 "다시 온 사람"을 알아볼 방법이 이것뿐이다. 닉네임은
// 입장할 때 아무거나 칠 수 있으므로 기록의 키로 쓰면 안 된다.
//
// 위조할 수 있다는 점은 분명히 해 둔다. localStorage 값이라 마음먹으면 바꾼다.
// 지금은 "내 기록이 이어진다" 정도가 목적이라 이걸로 충분하고, 순위 경쟁이
// 걸리는 순간 진짜 계정이 필요해진다.
const KEY = "starfall.playerId";

function createId(): string {
  const source = globalThis.crypto;
  // randomUUID 는 보안 컨텍스트(https 또는 localhost)에서만 있다.
  if (typeof source.randomUUID === "function") {
    return source.randomUUID().replace(/-/g, "");
  }
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 저장된 신원을 읽고, 없으면 만들어 둔다.
 *
 * localStorage 를 못 쓰는 환경(시크릿 모드 등)에서도 게임은 돌아가야 하므로,
 * 실패하면 이번 접속에만 쓰는 임시 ID 를 준다. 기록이 안 이어질 뿐이다.
 */
export function getPlayerId(): string {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) {
      return stored;
    }
    const created = createId();
    window.localStorage.setItem(KEY, created);
    return created;
  } catch {
    return createId();
  }
}
