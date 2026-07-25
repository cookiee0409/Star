# 캐릭터 에셋

`player.gltf` 는 **임시 플레이스홀더**입니다. 파이프라인 검증용으로 만든
뼈대 2개짜리 최소 모델이라, 실제 캐릭터로 교체하면 훨씬 좋아집니다.

## 교체 방법

`player.gltf` 를 같은 이름의 `.gltf` 또는 `.glb` 로 덮어쓰면 됩니다.
파일명을 바꾸려면 `apps/client/src/player/characterAssets.ts` 의
`CHARACTER_URL` 을 수정하세요.

모델이 없거나 로딩에 실패하면 자동으로 캡슐로 되돌아갑니다.
게임이 멈추지는 않습니다.

## 애니메이션 이름

`characterAssets.ts` 의 `CLIP_NAMES` 가 이름으로 클립을 찾습니다.
대소문자를 무시하고 **부분 일치**로 찾으므로, 아래 중 하나를 포함하면 됩니다.

| 상태 | 찾는 이름 |
|---|---|
| 대기 | `idle`, `idle_a`, `breathing`, `stand` |
| 걷기 | `walk`, `walking`, `walk_forward`, `jog` |
| 달리기 | `run`, `running`, `sprint`, `run_forward` |

다른 이름을 쓴다면 `CLIP_NAMES` 에 추가하세요.
찾지 못한 상태는 대기 동작으로 대체됩니다.

## 추천 출처 (CC0, 변환 불필요)

**Quaternius** 를 권합니다. 지금 배경에 쓴 자연물과 같은 곳이라 톤이 맞고,
**GLB 를 직접 제공**해서 파일 변환 과정이 없습니다.

- **Universal Base Characters** — 기본 체형 6종, 헤어 20종
  https://quaternius.com/packs/universalbasecharacters.html
- **Universal Animation Library** — 120종 이상, 걷기·달리기·대기 포함
  https://quaternius.com/packs/universalanimationlibrary.html

캐릭터와 애니메이션이 다른 파일로 나뉘어 있다면, Blender 등에서 하나로 합쳐
내보내야 합니다. 이 코드는 **모델과 애니메이션이 한 파일에 있는 것**을 전제로
합니다.

### 아니메 스타일을 원한다면

**VRoid Studio**(무료)로 만든 캐릭터가 가장 근접합니다.
VRM 은 glTF 기반이라 확장자만 `.glb` 로 바꿔도 대개 읽힙니다.

다만 **애니메이션이 들어있지 않습니다.** Mixamo 를 쓰면 FBX 로만 받을 수 있어
변환 단계가 필요하고, 그만큼 위험 표면이 늘어납니다(아래 참고).

## 보안

- **`.gltf` / `.glb` 만 받으세요.** glTF 규격은 실행 코드를 담는 방법을
  정의하지 않습니다. 데이터일 뿐입니다.
- **`.blend` 는 받지 마세요.** Blender 파일은 Python 스크립트를 품을 수 있고,
  Auto Run 이 켜져 있으면 파일을 여는 즉시 실행됩니다. 무료 3D 에셋 사이트에
  악성 `.blend` 를 올려 정보 탈취 악성코드를 퍼뜨린 실제 사례가 있습니다.
- **온라인 FBX→GLB 변환기를 피하세요.** 에셋을 모르는 서버에 업로드하게 됩니다.
  변환이 꼭 필요하면 로컬에서 Blender 로 하세요.
- **VRoid Studio 는 공식 사이트에서만** 받으세요 (https://vroid.com).
  검색하면 상위에 뜨는 softonic·sourceforge 미러는 공식이 아니며
  애드웨어를 끼워 넣는 경우가 있습니다.

이 프로젝트가 지금까지 쓴 에셋은 전부 **glTF 로 직접 제공되는 CC0** 이라,
변환기도 Blender 도 거치지 않았습니다. 가능하면 그 방식을 유지하세요.

## 플레이스홀더를 다시 만들려면

`scratchpad/make_test_character.py` 로 생성했습니다. 외부 다운로드 없이
스킨 가중치와 Idle/Walk/Run 애니메이션까지 갖춘 최소 모델을 만듭니다.
