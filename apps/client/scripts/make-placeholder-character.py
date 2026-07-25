# 캐릭터 파이프라인 검증용 스킨드 glTF 생성기.
#
# 외부에서 아무것도 받지 않고, 뼈대 2개짜리 최소 캐릭터를 만든다.
# 실제 에셋과 같은 구조를 갖춘다:
#   - JOINTS_0 / WEIGHTS_0 스킨 가중치
#   - skin + inverseBindMatrices
#   - Idle / Walk / Run 애니메이션 3종 (회전 키프레임)
import base64
import io
import json
import math
import os
import struct
import sys

OUT = sys.argv[1]
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)

SPLIT = 1.1   # 이 높이에서 아래/위 뼈대가 나뉜다
TOP = 2.2
RADIUS = 0.42


def body():
    """세로로 긴 8각 기둥. 아래 절반은 joint0, 위 절반은 joint1 에 붙는다."""
    positions, normals, joints, weights, indices = [], [], [], [], []
    segments = 8
    rings = [0.0, SPLIT, TOP]
    for y in rings:
        for i in range(segments):
            angle = i / segments * math.tau
            nx, nz = math.cos(angle), math.sin(angle)
            positions.append((nx * RADIUS, y, nz * RADIUS))
            normals.append((nx, 0.0, nz))
            # 아래 링은 joint0, 위 두 링은 joint1
            if y <= 0.001:
                joints.append((0, 0, 0, 0))
                weights.append((1.0, 0.0, 0.0, 0.0))
            elif y <= SPLIT + 0.001:
                joints.append((0, 1, 0, 0))
                weights.append((0.5, 0.5, 0.0, 0.0))
            else:
                joints.append((1, 0, 0, 0))
                weights.append((1.0, 0.0, 0.0, 0.0))

    for r in range(len(rings) - 1):
        for i in range(segments):
            a0 = r * segments + i
            a1 = r * segments + (i + 1) % segments
            b0, b1 = a0 + segments, a1 + segments
            indices += [a0, a1, b0, a1, b1, b0]

    # 머리(위쪽 뚜껑)
    top_center = len(positions)
    positions.append((0.0, TOP + 0.25, 0.0))
    normals.append((0.0, 1.0, 0.0))
    joints.append((1, 0, 0, 0))
    weights.append((1.0, 0.0, 0.0, 0.0))
    base = (len(rings) - 1) * segments
    for i in range(segments):
        indices += [top_center, base + i, base + (i + 1) % segments]

    return positions, normals, joints, weights, indices


def quat_y(deg):
    half = math.radians(deg) / 2
    return (0.0, math.sin(half), 0.0, math.cos(half))


def quat_x(deg):
    half = math.radians(deg) / 2
    return (math.sin(half), 0.0, 0.0, math.cos(half))


positions, normals, joints, weights, indices = body()

pos_b = b"".join(struct.pack("<3f", *v) for v in positions)
nrm_b = b"".join(struct.pack("<3f", *v) for v in normals)
jnt_b = b"".join(struct.pack("<4H", *v) for v in joints)
wgt_b = b"".join(struct.pack("<4f", *v) for v in weights)
idx_b = b"".join(struct.pack("<H", i) for i in indices)
# joint0 = translate(0,0,0), joint1 = translate(0,SPLIT,0) 의 역행렬
ibm = [
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -SPLIT, 0, 1],
]
ibm_b = b"".join(struct.pack("<16f", *m) for m in ibm)

# 애니메이션: (이름, 프레임시간, joint1 회전 키)
clips = {
    "Idle": ([0.0, 1.0, 2.0], [quat_x(-2), quat_x(3), quat_x(-2)]),
    "Walk": ([0.0, 0.35, 0.7], [quat_x(-14), quat_x(14), quat_x(-14)]),
    "Run": ([0.0, 0.2, 0.4], [quat_x(-30), quat_x(30), quat_x(-30)]),
}

chunks = [pos_b, nrm_b, jnt_b, wgt_b, idx_b, ibm_b]
anim_meta = []
for name, (times, rots) in clips.items():
    t_b = b"".join(struct.pack("<f", t) for t in times)
    r_b = b"".join(struct.pack("<4f", *q) for q in rots)
    anim_meta.append((name, len(times), t_b, r_b))
    chunks += [t_b, r_b]

# 각 청크를 4바이트 정렬해 이어붙인다
offsets, blob = [], b""
for chunk in chunks:
    pad = (-len(blob)) % 4
    blob += b"\x00" * pad
    offsets.append(len(blob))
    blob += chunk

views, accessors = [], []


def add(chunk_index, byte_length, target=None):
    view = {"buffer": 0, "byteOffset": offsets[chunk_index], "byteLength": byte_length}
    if target:
        view["target"] = target
    views.append(view)
    return len(views) - 1


v_pos = add(0, len(pos_b), 34962)
v_nrm = add(1, len(nrm_b), 34962)
v_jnt = add(2, len(jnt_b), 34962)
v_wgt = add(3, len(wgt_b), 34962)
v_idx = add(4, len(idx_b), 34963)
v_ibm = add(5, len(ibm_b))

accessors.append({"bufferView": v_pos, "componentType": 5126, "count": len(positions), "type": "VEC3",
                  "min": [min(p[i] for p in positions) for i in range(3)],
                  "max": [max(p[i] for p in positions) for i in range(3)]})
accessors.append({"bufferView": v_nrm, "componentType": 5126, "count": len(normals), "type": "VEC3"})
accessors.append({"bufferView": v_jnt, "componentType": 5123, "count": len(joints), "type": "VEC4"})
accessors.append({"bufferView": v_wgt, "componentType": 5126, "count": len(weights), "type": "VEC4"})
accessors.append({"bufferView": v_idx, "componentType": 5123, "count": len(indices), "type": "SCALAR"})
accessors.append({"bufferView": v_ibm, "componentType": 5126, "count": 2, "type": "MAT4"})

animations = []
chunk_cursor = 6
for name, count, t_b, r_b in anim_meta:
    v_t = add(chunk_cursor, len(t_b))
    v_r = add(chunk_cursor + 1, len(r_b))
    chunk_cursor += 2
    a_t = len(accessors)
    accessors.append({"bufferView": v_t, "componentType": 5126, "count": count, "type": "SCALAR",
                      "min": [0.0], "max": [max(clips[name][0])]})
    a_r = len(accessors)
    accessors.append({"bufferView": v_r, "componentType": 5126, "count": count, "type": "VEC4"})
    animations.append({
        "name": name,
        "samplers": [{"input": a_t, "output": a_r, "interpolation": "LINEAR"}],
        "channels": [{"sampler": 0, "target": {"node": 2, "path": "rotation"}}],
    })

doc = {
    "asset": {"version": "2.0", "generator": "starfall-test-character"},
    "scene": 0,
    "scenes": [{"nodes": [0, 1]}],
    "nodes": [
        {"name": "Character", "mesh": 0, "skin": 0},
        {"name": "Hips", "children": [2]},
        {"name": "Spine", "translation": [0.0, SPLIT, 0.0]},
    ],
    "meshes": [{"primitives": [{
        "attributes": {"POSITION": 0, "NORMAL": 1, "JOINTS_0": 2, "WEIGHTS_0": 3},
        "indices": 4,
        "material": 0,
    }]}],
    "skins": [{"inverseBindMatrices": 5, "joints": [1, 2], "skeleton": 1}],
    "materials": [{"pbrMetallicRoughness": {
        "baseColorFactor": [0.45, 0.78, 0.85, 1.0],
        "metallicFactor": 0.0, "roughnessFactor": 0.85,
    }}],
    "animations": animations,
    "accessors": accessors,
    "bufferViews": views,
    "buffers": [{"byteLength": len(blob),
                 "uri": "data:application/octet-stream;base64," + base64.b64encode(blob).decode()}],
}

with io.open(OUT, "w", encoding="utf-8") as f:
    json.dump(doc, f)
print("wrote", OUT, os.path.getsize(OUT), "bytes")
print("  verts:", len(positions), "tris:", len(indices) // 3)
print("  animations:", [a["name"] for a in animations])
