# 캐릭터 에셋

플레이어 캐릭터는 **KayKit**(Kay Lousberg)의 두 CC0 팩으로 만듭니다.

- 몸: **KayKit - Character Pack: Adventurers** 2.0 FREE
  — Knight, Barbarian, Mage, Ranger, Rogue
- 동작: **KayKit - Character Animations** 1.1 — `Idle_A`, `Walking_A`, `Running_A`
- 라이선스: **CC0** (출처 표기 불필요, 상업적 사용 가능)
- 받는 곳: <https://kaylousberg.itch.io/kaykit-adventurers>,
  <https://kaylousberg.itch.io/kaykit-character-animations>

두 팩이 같은 리그(`Rig_Medium`, 뼈 23개)를 쓰기 때문에 뼈 이름이 그대로
일치하고, 그래서 애니메이션을 옮겨 붙일 수 있습니다.

## 다시 만들려면

```bash
python apps/client/scripts/build-character.py \
  "<...>/KayKit_Adventurers_2.0_FREE/Characters/gltf" \
  "<...>/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium" \
  apps/client/public/assets/character
```

**Blender 는 필요 없습니다.** glTF 는 JSON + 바이너리라 스크립트로 직접 다룹니다.
설치할 것도 없고 `.blend` 를 열 일도 없어 그편이 안전합니다.

스크립트가 하는 일:

1. 캐릭터 `.glb` 를 열어 텍스처를 바깥 `.png` 로 빼고 버퍼를 다시 짠다
2. 애니메이션 GLB 에서 원하는 클립의 샘플러·채널을 꺼낸다
3. 채널이 가리키는 노드를 **이름 기준으로** 캐릭터 뼈대에 다시 연결한다
4. **scale 채널을 버린다** — 아래 "머리 크기" 참고
5. 텍스처를 **NEAREST 샘플러**에 물린다 — 아래 "색과 음영" 참고
6. 모델을 키 1.7 에 맞춘다 — 아래 "크기" 참고

결과: 캐릭터 5종 합계 **2.3 MB**

## 캐릭터를 바꾸려면

스크립트의 `CHARACTERS` 를 고치세요. 파일 이름이 곧 출력 이름이 되고,
클라이언트 쪽 `characterAssets.ts` 의 `CHARACTER_FILES` 와 맞춰야 합니다.

무료 팩에는 `Rogue_Hooded` 도 들어 있고, 유료 티어를 사면 Engineer·Druid 가
늘어납니다. 같은 리그라면 그대로 붙습니다.

플레이어마다 세션 ID 해시로 한 종류가 배정됩니다. 서버가 정해 주지 않아도
모두가 같은 답을 내므로, 내 화면의 저 사람과 저 사람 화면의 자신이 같은
캐릭터로 보입니다.

## 애니메이션을 바꾸려면

스크립트의 `WANTED` 를 고치세요. 애니메이션 팩에는 133종이 들어 있습니다
(`Rig_Medium_MovementAdvanced.glb`, `Rig_Medium_Tools.glb` 등).

`PickUp` 처럼 이 게임에 어울리는 동작도 있지만, 지금은 이동 상태 세 개만
씁니다.

**바꿀 때 확인할 것:** 클립이 제자리 동작이어야 합니다. `root` 노드의
translation 키가 움직이면 캐릭터가 서버가 정한 위치에서 흘러나갑니다.
지금 쓰는 세 클립은 전부 0 으로 고정입니다.

| 상태 | 찾는 이름 | 현재 클립 |
|---|---|---|
| 대기 | `idle`, `idle_a`, `breathing`, `stand` | `Idle_A` |
| 걷기 | `walk`, `walking`, `jog` | `Walking_A` |
| 달리기 | `run`, `running`, `sprint` | `Running_A` |

`characterAssets.ts` 의 `CLIP_NAMES` 가 이름으로 클립을 찾습니다.
대소문자를 무시하고 **부분 일치**입니다. 찾지 못한 상태는 대기 동작으로
대체됩니다. 모델이 하나도 없으면 캡슐로 되돌아가고, 게임은 그대로 돌아갑니다.

## 머리 크기

`characterAssets.ts` 의 `HEAD_SCALE` 이 `head` 뼈만 키웁니다. 이 캐릭터들은
이미 머리가 큰 편이라 기본값은 `1`(끔)입니다. 더 아기자기하게 만들고 싶으면
1.1~1.2 정도까지 올려 보세요. 투구·모자도 같은 뼈에 물려 있어 함께 커집니다.

애니메이션 클립에 이 뼈의 **scale 채널이 남아 있으면 매 프레임 1로 덮어써서**
아무 효과가 없습니다. 그래서 빌드 스크립트가 scale 채널을 아예 빼고 만듭니다.
이 리그의 스케일 키는 전부 1이라 버려도 손실이 없습니다.

## 색과 음영

이 모델들은 색을 텍스처가 아니라 **그라디언트 아틀라스**에서 가져옵니다.
1024×1024 한 장에 색 띠를 격자로 붙여 놓고 UV 로 골라 쓰는 방식이라,
파일이 13 KB 밖에 안 됩니다.

대신 **선형 보간이나 밉맵을 켜면 띠 경계에서 이웃 색이 섞입니다**(검정 옆이
살구색입니다). 그래서 빌드 스크립트가 `.gltf` 안에서 NEAREST 샘플러로
못박아 둡니다. 같은 이유로 텍스처를 줄이지도 않습니다.

플레이어 구분색을 곱하지 않는 것도 이 때문입니다. 텍스처가 있는 모델에
색을 곱하면 옷과 피부까지 물들어 망가집니다. 색 대신 캐릭터 종류로
서로를 구분합니다.

머티리얼은 `apps/client/src/scene/toonMaterial.ts` 가 전부 갈아끼웁니다.
음영·그림자색·외곽선을 바꾸려면 그 파일의 `TOON` 값을 고치세요.

## 크기

원본은 캐릭터마다 키가 2.3~2.7 로 제각각이고 맵에 비해 큽니다. 빌드
스크립트가 아마추어 루트에 스케일을 걸어 **전부 1.7 로 맞춥니다**
(`TARGET_HEIGHT`). 정점을 건드리지 않으므로 애니메이션은 그대로입니다.

이름표는 코드가 모델의 실제 높이를 재서 머리 위에 놓습니다.

## 보안

- **`.gltf` / `.glb` 만 쓰세요.** glTF 규격은 실행 코드를 담는 방법을
  정의하지 않습니다. 데이터일 뿐입니다.
- **`.blend` 는 열지 마세요.** 팩 안에 들어 있어도 무시하면 됩니다
  (무료 티어에는 아예 없습니다). Blender 파일은 Python 스크립트를 품을 수
  있고, Auto Run 이 켜져 있으면 파일을 여는 즉시 실행됩니다. 무료 3D 에셋
  사이트에 악성 `.blend` 를 올려 정보 탈취 악성코드를 퍼뜨린 실제 사례가
  있습니다.
- **온라인 FBX→GLB 변환기를 쓰지 마세요.** 에셋을 모르는 서버에 올리게 됩니다.
  두 팩 모두 glTF 를 함께 주므로 변환할 일이 없습니다.
