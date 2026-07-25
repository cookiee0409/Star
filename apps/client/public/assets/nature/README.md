# 자연 오브젝트 에셋

여기 있는 모델은 **Quaternius — Stylized Nature MegaKit** 에서 가져왔습니다.

- 라이선스: **CC0** (출처 표기 불필요, 상업적 사용 가능)
- 원본: https://quaternius.itch.io/stylized-nature-megakit

## 들어있는 것

| 파일 | 원본 모델 | 쓰임 |
|---|---|---|
| `tree` | CommonTree_1 | 장애물 자리의 큰 나무 |
| `tree_alt` | CommonTree_2 | 흩뿌리는 활엽수 |
| `pine` | Pine_1 | 흩뿌리는 침엽수 |
| `rock` | Rock_Medium_1 | 장애물 자리의 바위, 작은 돌 |
| `bush` | Bush_Common_Flowers | 꽃 덤불 |
| `fern` | Fern_1 | 고사리 |
| `grass` | Grass_Common_Short | 풀 |

원본 팩의 `Bush_Common` 은 잎 텍스처가 붉은 계열이라 전체 톤에서 튀어
`Bush_Common_Flowers` 로 바꿨습니다.

## 원본에서 다시 가져오려면

```bash
python apps/client/scripts/import-nature-assets.py <원본_glTF_폴더> apps/client/public/assets/nature
```

이 스크립트가 하는 일:

- **노멀맵을 버립니다.** 셀셰이딩은 노멀맵을 쓰지 않습니다.
- **텍스처를 512px 로 줄입니다.** 원본은 2048px(최대 3.8 MB)이라 그대로 넣으면
  저장소와 첫 로딩이 무거워집니다. 툰 음영에서는 차이가 거의 드러나지 않습니다.
- 결과: 11.9 MB → **2.3 MB**

모델을 더 추가하려면 스크립트의 `PICKS` 에 항목을 넣고,
`apps/client/src/scene/natureAssets.ts` 의 `NATURE_ASSETS` 에도 등록하세요.

## 크기 조절

코드가 자동으로 맞춥니다. 장애물 자리에 놓이는 모델은 서버가 정한 충돌
크기(`WORLD_OBSTACLES` 의 `height`)를 기준으로 바운딩 박스를 재서
배율을 계산합니다. 충돌 판정은 언제나 서버 값이 담당하므로,
모델을 바꿔도 플레이 감각은 변하지 않습니다.

## 알아둘 점

**잎에는 외곽선을 걸지 않습니다.** 외곽선은 메시를 부풀려 뒷면만 그리는
방식이라 양면 렌더링과 함께 쓸 수 없습니다. 잎(알파로 모양을 오려내는 판)에
걸면 부풀린 검은 껍데기가 앞을 덮어 나무가 통째로 까맣게 보입니다.
그래서 닫힌 입체(줄기·바위)에만 겁니다.

**정점 색상은 끕니다.** 이 모델들은 `COLOR_0` 을 갖고 있는데, 켜 두면
Babylon 이 알파 테스트를 비활성화해 잎이 잘리지 않고, 구워진 음영이
셀 음영과 곱해져 전체가 어두워집니다.

## 보안

- **`.gltf` / `.glb` 만 받으세요.**
- **`.blend` 는 받지 마세요.** Blender 파일은 Python 스크립트를 품을 수 있고,
  Auto Run 이 켜져 있으면 파일을 여는 즉시 실행됩니다. 무료 3D 에셋 사이트에
  악성 `.blend` 를 올려 정보 탈취 악성코드를 퍼뜨린 실제 사례가 있습니다.
  `.unitypackage` 도 같은 이유로 피하세요.
- 사용자 업로드형 마켓보다 Quaternius, Kenney, Poly Pizza 처럼 운영자가 직접
  큐레이션하는 CC0 사이트를 쓰세요.
