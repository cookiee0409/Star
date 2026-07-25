# Quaternius Stylized Nature MegaKit(CC0)에서 필요한 모델만 골라
# 프로젝트로 들여온다.
#
# - 노멀맵은 가져오지 않는다. 셀셰이딩은 노멀맵을 쓰지 않는다.
# - 텍스처는 512px 로 줄인다. 툰 음영에서는 해상도 차이가 거의 드러나지 않고,
#   원본(2048px, 최대 4MB)을 그대로 넣으면 저장소와 첫 로딩이 무거워진다.
import io
import json
import os
import shutil
import sys

from PIL import Image

SRC = sys.argv[1]
DST = sys.argv[2]
MAX_TEXTURE = 512

# 프로젝트에서 쓰는 이름 -> 원본 파일 이름
PICKS = {
    "tree": "CommonTree_1",
    "tree_alt": "CommonTree_2",
    "pine": "Pine_1",
    "rock": "Rock_Medium_1",
    # Bush_Common 은 잎 텍스처가 붉은 계열이라 전체 톤에서 튄다.
    # 초록 잎을 쓰는 쪽으로 고른다.
    "bush": "Bush_Common_Flowers",
    "fern": "Fern_1",
    "grass": "Grass_Common_Short",
}

os.makedirs(DST, exist_ok=True)
wanted_textures = {}

for out_name, src_name in PICKS.items():
    gltf_path = os.path.join(SRC, src_name + ".gltf")
    doc = json.load(io.open(gltf_path, encoding="utf-8"))

    # 노멀맵 참조 제거 (이미지 목록에서 빼고 머티리얼에서도 끊는다)
    keep_images, remap = [], {}
    for index, image in enumerate(doc.get("images", [])):
        uri = image["uri"]
        if uri.endswith("_Normal.png"):
            continue
        remap[index] = len(keep_images)
        keep_images.append(image)
        wanted_textures[uri] = True
    doc["images"] = keep_images

    kept_texture_indices = {}
    new_textures = []
    for index, texture in enumerate(doc.get("textures", [])):
        source = texture.get("source")
        if source not in remap:
            continue
        texture = dict(texture)
        texture["source"] = remap[source]
        kept_texture_indices[index] = len(new_textures)
        new_textures.append(texture)
    doc["textures"] = new_textures

    for material in doc.get("materials", []):
        normal = material.pop("normalTexture", None)
        if normal is not None:
            pass  # 노멀맵은 버린다
        pbr = material.get("pbrMetallicRoughness", {})
        base = pbr.get("baseColorTexture")
        if base and base.get("index") in kept_texture_indices:
            base["index"] = kept_texture_indices[base["index"]]
        for key in ("metallicRoughnessTexture", "occlusionTexture", "emissiveTexture"):
            pbr.pop(key, None)
            material.pop(key, None)

    # 버퍼 파일명은 그대로 유지하되 우리 이름으로 바꾼다
    for buffer in doc.get("buffers", []):
        if "uri" in buffer:
            buffer["uri"] = out_name + ".bin"

    shutil.copyfile(
        os.path.join(SRC, src_name + ".bin"), os.path.join(DST, out_name + ".bin")
    )
    with io.open(os.path.join(DST, out_name + ".gltf"), "w", encoding="utf-8") as f:
        json.dump(doc, f)
    print(f"model {out_name:9s} <- {src_name}")

print()
for uri in sorted(wanted_textures):
    src_path = os.path.join(SRC, uri)
    image = Image.open(src_path)
    before = os.path.getsize(src_path)
    if max(image.size) > MAX_TEXTURE:
        ratio = MAX_TEXTURE / max(image.size)
        image = image.resize(
            (max(1, int(image.width * ratio)), max(1, int(image.height * ratio))),
            Image.LANCZOS,
        )
    out_path = os.path.join(DST, uri)
    image.save(out_path, optimize=True)
    after = os.path.getsize(out_path)
    print(f"tex   {uri:28s} {before/1024:7.0f} KB -> {after/1024:6.0f} KB  {image.size}")

total = sum(
    os.path.getsize(os.path.join(DST, f)) for f in os.listdir(DST) if not f.endswith(".md")
)
print(f"\n합계: {total/1024/1024:.2f} MB")
