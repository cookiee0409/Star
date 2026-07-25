// 게임 서버 주소를 결정한다.
//
// VITE_SERVER_URL 은 빌드 시점에 번들에 박힌다. 값이 없는 채로 배포하면
// 화면은 정상적으로 뜨지만 아무도 접속하지 못하는 상태가 되므로,
// 조용히 localhost 로 넘어가지 않고 명확한 오류로 알린다.

const LOCAL_FALLBACK = "http://localhost:2567";

export class ServerUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerUrlError";
  }
}

export function resolveServerUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL?.trim();

  if (!configured) {
    if (import.meta.env.PROD) {
      throw new ServerUrlError(
        "VITE_SERVER_URL 환경변수가 설정되지 않은 채로 빌드되었습니다. " +
          "배포 환경에 게임 서버 주소를 추가한 뒤 다시 배포해 주세요."
      );
    }
    return LOCAL_FALLBACK;
  }

  // https 페이지에서 http 주소로 접속하면 브라우저가 혼합 콘텐츠로 차단한다.
  if (
    window.location.protocol === "https:" &&
    configured.startsWith("http://")
  ) {
    throw new ServerUrlError(
      `게임 서버 주소가 http 로 설정되어 있어 https 페이지에서 차단됩니다. ` +
        `VITE_SERVER_URL 을 https 주소로 바꾼 뒤 다시 배포해 주세요. (현재: ${configured})`
    );
  }

  return configured;
}
