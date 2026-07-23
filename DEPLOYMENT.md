# 무료 배포 가이드

프론트엔드는 Vercel Hobby, 실시간 Colyseus 서버는 Render Free에 배포합니다.
두 서비스 모두 GitHub의 `cookiee0409/Star` 저장소 `main` 브랜치를 연결합니다.

## 1. Render 서버 배포

Vercel보다 Render를 먼저 배포해야 프론트엔드에 서버 주소를 넣을 수 있습니다.

1. [Render Dashboard](https://dashboard.render.com/)에서 **New > Blueprint**를 선택합니다.
2. GitHub 저장소 `cookiee0409/Star`를 연결합니다.
3. 저장소 루트의 `render.yaml`을 감지하면 **Apply**를 선택합니다.
4. `starfall-server` 서비스의 배포가 끝날 때까지 기다립니다.
5. 서비스 주소를 복사합니다. 예: `https://starfall-server.onrender.com`
6. 브라우저에서 `<서비스 주소>/health`를 열어 `{"status":"ok"}`가 표시되는지 확인합니다.

`render.yaml`에 무료 플랜, 싱가포르 리전, 빌드·실행 명령, 헬스 체크가
이미 설정되어 있습니다. Render가 자동으로 제공하는 `PORT`를 서버가 사용하므로
별도로 포트를 입력할 필요가 없습니다.

무료 서버는 한동안 요청이 없으면 잠들 수 있습니다. 첫 접속 때 클라이언트가
약 1분 동안 자동으로 다시 연결하도록 구성했습니다.

## 2. Vercel 프론트엔드 배포

1. [Vercel Dashboard](https://vercel.com/new)에서 **Add New > Project**를 선택합니다.
2. GitHub 저장소 `cookiee0409/Star`를 Import합니다.
3. **Root Directory는 저장소 루트 `./` 그대로** 둡니다.
4. Framework Preset은 `Vite`를 선택합니다.
5. Environment Variables에 다음 값을 추가합니다.

   - Name: `VITE_SERVER_URL`
   - Value: 앞에서 복사한 Render 주소. 예: `https://starfall-server.onrender.com`
   - Environments: Production, Preview, Development 모두 선택

6. **Deploy**를 선택합니다.

루트의 `vercel.json`이 다음 값을 자동으로 적용합니다.

- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @starfall/client build`
- Output Directory: `apps/client/dist`

`VITE_SERVER_URL`은 빌드 시점에 포함됩니다. Render 주소를 수정했다면 Vercel에서
반드시 새로 배포해야 합니다.

## 3. 확인

1. Vercel 배포 주소를 두 개의 브라우저 창에서 엽니다.
2. 서로 다른 닉네임으로 입장합니다.
3. 두 캐릭터의 이동이 서로 보이는지 확인합니다.
4. 첫 접속에서 서버 시작 메시지가 나오면 최대 1분 정도 기다립니다.

서버가 잠들거나 다시 배포되면 메모리에 있던 방, 점수, 별 조각은 초기화됩니다.
현재 MVP에는 데이터베이스가 없으므로 정상 동작입니다.
