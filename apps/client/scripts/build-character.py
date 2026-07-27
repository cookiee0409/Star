# KayKit Adventurers + KayKit Character Animations(CC0) 를 게임용 glTF 로 굽는다.
#
# Blender 를 쓰지 않는다. glTF 는 JSON + 바이너리라 직접 다룰 수 있고,
# 그편이 설치할 것도 없고 .blend 를 열 일도 없어 안전하다.
#
# 두 팩은 같은 리그(Rig_Medium)를 쓰므로 뼈 이름이 23개 전부 일치한다.
# 애니메이션의 채널이 가리키는 노드를 "이름"으로 캐릭터 쪽 노드에 다시 연결한다.
#
# 사용법:
#   python build-character.py <캐릭터 디렉터리> <애니메이션 디렉터리> <출력 디렉터리>
import io
import json
import os
import struct
import sys

from PIL import Image

# 만들 캐릭터. 파일 이름이 곧 출력 이름이 된다(knight.gltf ...).
# 플레이어마다 이 중 하나를 배정한다(characterAssets.ts).
CHARACTERS = ["Knight", "Barbarian", "Mage", "Ranger", "Rogue"]

# 게임에서 쓰는 상태 -> (애니메이션 파일, 클립 이름)
#
# 클립은 전부 제자리 동작이다. root 의 translation 키가 0 으로 고정이라
# 서버가 정하는 위치와 싸우지 않는다. 확인은 scripts 폴더 밖에서 했고,
# 다른 클립으로 바꿀 때는 이 성질을 다시 확인해야 한다.
WANTED = {
    "Idle": ("Rig_Medium_General.glb", "Idle_A"),
    "Walk": ("Rig_Medium_MovementBasic.glb", "Walking_A"),
    "Sprint": ("Rig_Medium_MovementBasic.glb", "Running_A"),
    # 공중 자세. Jump_Full_Short 는 도약~착지가 한 덩어리라 체공 시간이
    # 입력에 따라 달라지는 우리 점프에는 맞지 않는다. Jump_Idle 이 뜬 상태의
    # 반복 동작이라 얼마를 떠 있든 자연스럽다.
    "Jump": ("Rig_Medium_MovementBasic.glb", "Jump_Idle"),
}

# 모델을 이 키(월드 단위)에 맞춘다. 원본은 2.54 로 커서 그대로 두면
# 맵과 카메라 거리(CONFIG.CAM_DISTANCE)에 비해 거인처럼 보인다.
TARGET_HEIGHT = 1.7

# glTF 샘플러 상수. NEAREST 는 밉맵도 함께 끈다.
#
# KayKit 텍스처는 색 띠를 격자로 붙인 그라디언트 아틀라스다.
# 선형 보간이나 밉맵을 켜면 띠 경계에서 이웃 색이 섞여(검정 옆이 살구색이다)
# 캐릭터에 엉뚱한 색 테두리가 생긴다. 에셋 쪽에서 못박아 둔다.
NEAREST = 9728

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


def externalize_images(doc, blob, out_dir, stem):
    """
    GLB 안에 박혀 있는 텍스처를 바깥 .png 로 빼고 버퍼를 다시 짠다.

    출력이 .gltf + .bin + .png 인 이유: 무엇이 들어 있는지 파일 목록만 봐도
    알 수 있고, 텍스처만 따로 열어 보거나 갈아끼울 수 있다.

    버퍼를 통째로 다시 만드는 김에 어디서도 참조하지 않는 바이트도 사라진다.
    """
    saved = []
    drop = set()
    for index, image in enumerate(doc.get("images", [])):
        view = image.get("bufferView")
        if view is None:
            continue
        span = doc["bufferViews"][view]
        start = span.get("byteOffset", 0)
        data = blob[start:start + span["byteLength"]]

        name = f"{stem}.png"
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(data)
        saved.append((name, len(data)))

        image.clear()
        image["uri"] = name
        drop.add(view)

    # 남은 bufferView 만 새 버퍼에 순서대로 옮겨 담고 참조를 새 번호로 고친다.
    fresh = bytearray()
    views, remap = [], {}
    for index, view in enumerate(doc["bufferViews"]):
        if index in drop:
            continue
        start = view.get("byteOffset", 0)
        data = blob[start:start + view["byteLength"]]
        fresh.extend(b"\x00" * ((-len(fresh)) % 4))
        moved = dict(view)
        moved["byteOffset"] = len(fresh)
        fresh.extend(data)
        remap[index] = len(views)
        views.append(moved)

    doc["bufferViews"] = views
    for acc in doc.get("accessors", []):
        if "bufferView" in acc:
            acc["bufferView"] = remap[acc["bufferView"]]

    return fresh, saved


def use_nearest_sampling(doc):
    """모든 텍스처를 NEAREST 샘플러에 물린다(위 NEAREST 주석 참고)."""
    samplers = doc.setdefault("samplers", [])
    samplers.append({"magFilter": NEAREST, "minFilter": NEAREST})
    index = len(samplers) - 1
    for texture in doc.get("textures", []):
        texture["sampler"] = index


def fit_height(doc, blob):
    """
    아마추어 루트에 스케일을 걸어 모델을 TARGET_HEIGHT 에 맞춘다.

    뼈와 메시가 모두 이 노드 아래에 있으므로 하나만 줄이면 전부 따라온다.
    정점을 건드리지 않으니 애니메이션도 그대로다.
    """
    low, high = 1e9, -1e9
    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            acc = doc["accessors"][prim["attributes"]["POSITION"]]
            if "min" in acc:
                low = min(low, acc["min"][1])
                high = max(high, acc["max"][1])
    height = high - low
    if height <= 0:
        return 1.0

    scale = TARGET_HEIGHT / height
    root = doc["nodes"][doc["scenes"][doc.get("scene", 0)]["nodes"][0]]
    base = root.get("scale", [1, 1, 1])
    root["scale"] = [value * scale for value in base]
    return scale


def copy_clip(char, blob, anim_doc, anim_blob, source, out_name, by_name):
    """애니메이션 클립 하나를 캐릭터 쪽으로 옮겨 붙인다."""
    sampler_map = {}
    new_samplers = []

    def take_sampler(si):
        """실제로 쓰이는 sampler 만 캐릭터 쪽 버퍼로 옮긴다."""
        if si in sampler_map:
            return sampler_map[si]

        sampler = source["samplers"][si]
        new_ids = {}
        for key in ("input", "output"):
            src_acc = anim_doc["accessors"][sampler[key]]
            data, _element = accessor_bytes(anim_doc, anim_blob, sampler[key])

            blob.extend(b"\x00" * ((-len(blob)) % 4))
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
        return sampler_map[si]

    new_channels, missing = [], set()
    for channel in source["channels"]:
        target = channel["target"]
        # scale 채널은 버린다. 이 리그의 스케일 키는 전부 1이라 용량만 차지하고,
        # 남겨 두면 뼈 스케일 조정을 매 프레임 덮어쓴다.
        if target["path"] == "scale":
            continue
        node_name = anim_doc["nodes"][target["node"]].get("name")
        if node_name not in by_name:
            missing.add(node_name)
            continue
        new_channels.append({
            "sampler": take_sampler(channel["sampler"]),
            "target": {"node": by_name[node_name], "path": target["path"]},
        })

    char["animations"].append({
        "name": out_name,
        "samplers": new_samplers,
        "channels": new_channels,
    })
    return len(new_channels), sorted(x for x in missing if x)


def build(char_path, anims, out_dir, stem):
    char, raw = read_glb(char_path)

    blob, saved = externalize_images(char, raw, out_dir, stem)
    use_nearest_sampling(char)
    scale = fit_height(char, blob)

    # 툰 셰이딩은 노멀맵도 러프니스도 쓰지 않는다. 참조를 끊는다.
    for material in char.get("materials", []):
        material.pop("normalTexture", None)
        material.pop("occlusionTexture", None)
        material.get("pbrMetallicRoughness", {}).pop("metallicRoughnessTexture", None)

    by_name = {n["name"]: i for i, n in enumerate(char["nodes"]) if n.get("name")}
    char.setdefault("animations", [])
    report, skipped = [], []

    for out_name, (file_name, clip_name) in WANTED.items():
        anim_doc, anim_blob = anims[file_name]
        source = next(
            (a for a in anim_doc.get("animations", []) if a.get("name") == clip_name),
            None,
        )
        if source is None:
            skipped.append(clip_name)
            continue
        channels, missing = copy_clip(
            char, blob, anim_doc, anim_blob, source, out_name, by_name
        )
        report.append((out_name, clip_name, channels, missing))

    bin_name = f"{stem}.bin"
    char["buffers"] = [{"byteLength": len(blob), "uri": bin_name}]
    with open(os.path.join(out_dir, bin_name), "wb") as f:
        f.write(blob)

    out_path = os.path.join(out_dir, f"{stem}.gltf")
    with io.open(out_path, "w", encoding="utf-8") as f:
        json.dump(char, f)

    total = len(blob) + sum(size for _n, size in saved) + os.path.getsize(out_path)
    notes = []
    for name, clip, channels, missing in report:
        note = f"(못 붙인 뼈 {len(missing)}: {missing[:3]})" if missing else ""
        notes.append(f"{name}<-{clip} {channels}ch {note}".strip())
    if skipped:
        notes.append(f"찾지 못한 클립: {skipped}")

    print(f"{stem:10s} x{scale:.3f}  {total/1024:6.0f} KB  " + " | ".join(notes))
    return total


def main():
    char_dir, anim_dir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)

    # 애니메이션 파일은 캐릭터마다 다시 읽지 않는다.
    anims = {}
    for file_name in {file for file, _clip in WANTED.values()}:
        anims[file_name] = read_glb(os.path.join(anim_dir, file_name))

    total = 0
    for name in CHARACTERS:
        source = os.path.join(char_dir, f"{name}.glb")
        if not os.path.exists(source):
            print(f"{name}: {source} 가 없습니다")
            continue
        total += build(source, anims, out_dir, name.lower())

    # 텍스처는 줄이지 않는다. 1024 이지만 색 띠뿐이라 13 KB 밖에 안 되고,
    # 줄이면 띠 경계가 뭉개져 색이 섞인다.
    for name in sorted(os.listdir(out_dir)):
        if name.endswith(".png"):
            path = os.path.join(out_dir, name)
            with Image.open(path) as picture:
                print(f"tex   {name:20s} {picture.width}x{picture.height} "
                      f"{os.path.getsize(path)/1024:5.0f} KB")

    print(f"\n합계: {total/1024/1024:.2f} MB  ->  {out_dir}")


if __name__ == "__main__":
    main()
