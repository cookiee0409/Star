# 캐릭터 에셋

`player.gltf` 는 **Quaternius** 의 두 CC0 팩을 합쳐서 만들었습니다.

- 몸: **Universal Base Characters** — `Superhero_Male_FullBody`
- 동작: **Universal Animation Library** — `Idle_Loop`, `Walk_Loop`, `Sprint_Loop`
- 라이선스: **CC0** (출처 표기 불필요, 상업적 사용 가능)

두 팩이 같은 휴머노이드 리그를 쓰기 때문에 뼈 이름이 일치하고,
그래서 애니메이션을 그대로 옮겨 붙일 수 있었습니다.

## 다시 만들려면

```bash
python apps/client/scripts/build-character.py \
  "<...>/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf" \
  "<...>/Unreal-Godot/UAL1_Standard.glb" \
  apps/client/public/assets/character/player.gltf
```

**Blender 는 필요 없습니다.** glTF 는 JSON + 바이너리라 스크립트로 직접 다룹니다.
설치할 것도 없고 `.blend` 를 열 일도 없어 그편이 안전합니다.

스크립트가 하는 일:

1. 애니메이션 GLB 에서 원하는 클립의 샘플러·채널을 꺼낸다
2. 채널이 가리키는 노드를 **이름 기준으로** 캐릭터 뼈대에 다시 연결한다
3. 데이터를 캐릭터 `.bin` 에 이어붙이고 accessor·bufferView 를 재구성한다
4. **노멀맵과 러프니스맵을 버린다** — 셀셰이딩은 쓰지 않는다
5. 텍스처를 512px 로 줄인다

결과: 원본 약 9 MB → **1.9 MB**

### 다른 캐릭터로 바꾸려면

첫 번째 인자만 바꾸면 됩니다. 예를 들어 여성 캐릭터는
`Superhero_Female_FullBody.gltf` 입니다.

### 다른 동작을 쓰려면

스크립트의 `WANTED` 를 고치세요. 애니메이션 팩에는 43종이 들어 있습니다
(`Jog_Fwd_Loop`, `Crouch_Idle_Loop`, `Swim_Idle_Loop` 등).

## 애니메이션 이름 규칙

`apps/client/src/player/characterAssets.ts` 의 `CLIP_NAMES` 가 이름으로
클립을 찾습니다. 대소문자를 무시하고 **부분 일치**입니다.

| 상태 | 찾는 이름 | 현재 파일 |
|---|---|---|
| 대기 | `idle`, `breathing`, `stand` | `Idle` |
| 걷기 | `walk`, `walking`, `jog` | `Walk` |
| 달리기 | `run`, `running`, `sprint` | `Sprint` |

찾지 못한 상태는 대기 동작으로 대체됩니다.
모델이 아예 없으면 캡슐로 되돌아가고, 게임은 그대로 돌아갑니다.

## 크기

코드가 모델의 실제 높이를 재서 이름표를 머리 위에 놓습니다.
캐릭터를 바꿔도 따로 맞출 필요가 없습니다.
현재 모델은 키 1.82m 입니다.

## 보안

- **`.gltf` / `.glb` 만 쓰세요.** glTF 규격은 실행 코드를 담는 방법을
  정의하지 않습니다. 데이터일 뿐입니다.
- **`.blend` 는 열지 마세요.** 팩 안에 들어 있어도 무시하면 됩니다.
  Blender 파일은 Python 스크립트를 품을 수 있고, Auto Run 이 켜져 있으면
  파일을 여는 즉시 실행됩니다. 무료 3D 에셋 사이트에 악성 `.blend` 를 올려
  정보 탈취 악성코드를 퍼뜨린 실제 사례가 있습니다.
- **온라인 FBX→GLB 변환기를 쓰지 마세요.** 에셋을 모르는 서버에 올리게 됩니다.
  이 프로젝트는 변환기도 Blender 도 거치지 않았습니다.

### 아니메 스타일을 원한다면

**VRoid Studio**(무료, https://vroid.com 공식 사이트에서만) 로 만든 캐릭터가
가장 근접합니다. VRM 은 glTF 기반이라 확장자만 `.glb` 로 바꿔도 대개 읽힙니다.

다만 **애니메이션이 들어 있지 않습니다.** Mixamo 는 FBX 로만 주기 때문에
변환 단계가 생기고 그만큼 위험 표면이 늘어납니다. 지금 구성을 유지하는 편이
안전합니다.
