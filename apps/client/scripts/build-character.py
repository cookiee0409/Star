# Quaternius Universal Base Characters + Universal Animation Library(CC0)를
# 하나의 glTF 로 합친다.
#
# Blender 를 쓰지 않는다. glTF 는 JSON + 바이너리라 직접 다룰 수 있고,
# 그편이 설치할 것도 없고 .blend 를 열 일도 없어 안전하다.
#
# 두 팩은 같은 휴머노이드 리그를 쓰므로 뼈 이름이 일치한다.
# 애니메이션의 채널이 가리키는 노드를 "이름"으로 캐릭터 쪽 노드에 다시 연결한다.
#
# 사용법:
#   python build-character.py <캐릭터.gltf> <애니메이션.glb> <출력.gltf>
import io
import json
import os
import struct
import sys

from PIL import Image

MAX_TEXTURE = 512

# 게임에서 쓰는 상태 -> 애니메이션 팩 안의 클립 이름
WANTED = {
    "Idle": "Idle_Loop",
    "Walk": "Walk_Loop",
    "Sprint": "Sprint_Loop",
}

COMPONENT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def read_glb(path):
    """GLB 에서 JSON 과 바이너리 청크를 꺼낸다."""
    with open(path, "rb") as f:
        magic, _version, _length = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            raise SystemExit(f"{path} 는 GLB 가 아닙니다")
        doc, blob = None, b""
        while True:
            header = f.read(8)
            if len(header) < 8:
                break
            chunk_len, chunk_type = struct.unpack("<II", header)
            data = f.read(chunk_len)
            if chunk_type == 0x4E4F534A:      # 'JSON'
                doc = json.loads(data.decode("utf-8"))
            elif chunk_type == 0x004E4942:    # 'BIN'
                blob = data
        return doc, blob


def accessor_bytes(doc, blob, index):
    """accessor 가 가리키는 실제 데이터만 잘라 온다."""
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    element = COMPONENT_SIZE[acc["componentType"]] * TYPE_COUNT[acc["type"]]
    stride = view.get("byteStride")
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    if stride and stride != element:
        # 인터리브된 데이터는 풀어서 담는다
        out = b""
        for i in range(acc["count"]):
            begin = start + i * stride
            out += blob[begin:begin + element]
        return out, element
    return blob[start:start + element * acc["count"]], element


def main():
    char_path, anim_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    out_dir = os.path.dirname(out_path) or "."
    os.makedirs(out_dir, exist_ok=True)

    char = json.load(io.open(char_path, encoding="utf-8"))
    char_dir = os.path.dirname(char_path)
    with open(os.path.join(char_dir, char["buffers"][0]["uri"]), "rb") as f:
        blob = bytearray(f.read())

    anim_doc, anim_blob = read_glb(anim_path)

    # 캐릭터 노드 이름 -> 인덱스
    by_name = {n["name"]: i for i, n in enumerate(char["nodes"]) if n.get("name")}

    char.setdefault("animations", [])
    added, skipped = [], []

    for out_name, src_name in WANTED.items():
        source = next(
            (a for a in anim_doc.get("animations", []) if a.get("name") == src_name), None
        )
        if source is None:
            skipped.append(src_name)
            continue

        sampler_map = {}
        new_samplers = []
        for si, sampler in enumerate(source["samplers"]):
            new_ids = {}
            for key in ("input", "output"):
                src_acc = anim_doc["accessors"][sampler[key]]
                data, element = accessor_bytes(anim_doc, anim_blob, sampler[key])

                pad = (-len(blob)) % 4
                blob.extend(b"\x00" * pad)
                offset = len(blob)
                blob.extend(data)

                char["bufferViews"].append(
                    {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
                )
                accessor = {
                    "bufferView": len(char["bufferViews"]) - 1,
                    "componentType": src_acc["componentType"],
                    "count": src_acc["count"],
                    "type": src_acc["type"],
                }
                # 시간축은 min/max 가 필수다
                if "min" in src_acc:
                    accessor["min"] = src_acc["min"]
                if "max" in src_acc:
                    accessor["max"] = src_acc["max"]
                char["accessors"].append(accessor)
                new_ids[key] = len(char["accessors"]) - 1

            new_sampler = {"input": new_ids["input"], "output": new_ids["output"]}
            if "interpolation" in sampler:
                new_sampler["interpolation"] = sampler["interpolation"]
            sampler_map[si] = len(new_samplers)
            new_samplers.append(new_sampler)

        new_channels, missing = [], set()
        for channel in source["channels"]:
            target = channel["target"]
            node_name = anim_doc["nodes"][target["node"]].get("name")
            if node_name not in by_name:
                missing.add(node_name)
                continue
            new_channels.append({
                "sampler": sampler_map[channel["sampler"]],
                "target": {"node": by_name[node_name], "path": target["path"]},
            })

        char["animations"].append({
            "name": out_name,
            "samplers": new_samplers,
            "channels": new_channels,
        })
        added.append((out_name, src_name, len(new_channels), sorted(x for x in missing if x)))

    # 버퍼 갱신
    bin_name = os.path.splitext(os.path.basename(out_path))[0] + ".bin"
    char["buffers"][0] = {"byteLength": len(blob), "uri": bin_name}
    with open(os.path.join(out_dir, bin_name), "wb") as f:
        f.write(blob)

    # 셀셰이딩은 노멀맵도 러프니스도 쓰지 않는다. 참조를 끊고 이미지도 빼 버린다.
    keep, remap = [], {}
    used = set()
    for material in char.get("materials", []):
        material.pop("normalTexture", None)
        material.pop("occlusionTexture", None)
        pbr = material.get("pbrMetallicRoughness", {})
        pbr.pop("metallicRoughnessTexture", None)
        base = pbr.get("baseColorTexture")
        if base:
            used.add(char["textures"][base["index"]]["source"])

    for index, image in enumerate(char.get("images", [])):
        if index in used:
            remap[index] = len(keep)
            keep.append(image)
    char["images"] = keep

    new_textures, tex_remap = [], {}
    for index, texture in enumerate(char.get("textures", [])):
        if texture.get("source") in remap:
            texture = dict(texture)
            texture["source"] = remap[texture["source"]]
            tex_remap[index] = len(new_textures)
            new_textures.append(texture)
    char["textures"] = new_textures

    for material in char.get("materials", []):
        base = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if base and base["index"] in tex_remap:
            base["index"] = tex_remap[base["index"]]

    # 남은 텍스처를 512px 로 줄여 함께 내보낸다
    for image in char["images"]:
        uri = image["uri"]
        src = os.path.join(char_dir, uri)
        picture = Image.open(src)
        before = os.path.getsize(src)
        if max(picture.size) > MAX_TEXTURE:
            ratio = MAX_TEXTURE / max(picture.size)
            picture = picture.resize(
                (max(1, int(picture.width * ratio)), max(1, int(picture.height * ratio))),
                Image.LANCZOS,
            )
        dst = os.path.join(out_dir, uri)
        picture.save(dst, optimize=True)
        print(f"tex   {uri:34s} {before/1024:7.0f} KB -> {os.path.getsize(dst)/1024:6.0f} KB")

    with io.open(out_path, "w", encoding="utf-8") as f:
        json.dump(char, f)

    print()
    for name, src, channels, missing in added:
        note = f"  (연결 못한 뼈 {len(missing)}개: {missing[:3]})" if missing else ""
        print(f"anim  {name:8s} <- {src:16s} 채널 {channels}{note}")
    if skipped:
        print("찾지 못한 클립:", skipped)

    total = sum(
        os.path.getsize(os.path.join(out_dir, f))
        for f in os.listdir(out_dir)
        if not f.endswith(".md")
    )
    print(f"\n출력: {out_path}")
    print(f"합계: {total/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
