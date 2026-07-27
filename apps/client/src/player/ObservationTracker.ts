// 밤하늘 관측.
//
// 별똥별을 기다리는 45~90초가 통째로 비어 있었다. 관측 지점에 서서 하늘을
// 올려다보면 다음 낙하 지점을 남보다 먼저 알려 준다 — 빈 시간이 채워지고,
// 보상이 물건이 아니라 정보라 전투 없는 게임의 성격을 깨지 않는다.
//
// 여기서는 "언제 다 봤는지"만 센다. 실제 지급은 서버가 하고, 서버는 자기가
// 아는 플레이어 위치로 다시 판정한다. 이 파일을 고쳐도 부정할 수 없다.
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG, OBSERVE_POINTS } from "@starfall/shared";

export interface ObservationStatus {
  /** 지금 어느 관측 지점 안에 있는가. 밖이면 undefined. */
  readonly spotIndex: number | undefined;
  /** 0~1. 지점 안에서 하늘을 보고 있을 때만 오른다. */
  readonly progress: number;
  /** 지점 안이지만 아직 하늘을 안 보고 있는가. 안내 문구용. */
  readonly needsLookUp: boolean;
}

export class ObservationTracker {
  private spotIndex: number | undefined;
  private elapsed = 0;

  /**
   * @param onComplete 관측을 마쳤을 때. 서버에 신고하는 쪽이 붙는다.
   */
  constructor(private readonly onComplete: (spotIndex: number) => void) {}

  update(
    deltaSeconds: number,
    position: Vector3,
    lookUpDegrees: number,
    alreadyHasForecast: boolean
  ): ObservationStatus {
    const spotIndex = findSpot(position);

    // 지점을 벗어나거나 다른 지점으로 옮기면 처음부터 다시 센다.
    if (spotIndex !== this.spotIndex) {
      this.spotIndex = spotIndex;
      this.elapsed = 0;
    }

    if (spotIndex === undefined) {
      return { spotIndex: undefined, progress: 0, needsLookUp: false };
    }

    // 이미 예보를 들고 있으면 더 쌓아 봐야 소용없다. 한 번에 하나다.
    if (alreadyHasForecast) {
      this.elapsed = 0;
      return { spotIndex, progress: 0, needsLookUp: false };
    }

    const lookingUp = lookUpDegrees >= CONFIG.OBSERVE_MIN_PITCH_DEG;
    if (!lookingUp) {
      // 고개를 내리면 진행도가 천천히 빠진다. 완전히 초기화하면
      // 잠깐 시선이 흔들렸을 때 억울하다.
      this.elapsed = Math.max(0, this.elapsed - deltaSeconds);
      return {
        spotIndex,
        progress: this.elapsed / CONFIG.OBSERVE_SECONDS,
        needsLookUp: true
      };
    }

    this.elapsed += deltaSeconds;
    if (this.elapsed >= CONFIG.OBSERVE_SECONDS) {
      this.elapsed = 0;
      this.onComplete(spotIndex);
      return { spotIndex, progress: 1, needsLookUp: false };
    }

    return {
      spotIndex,
      progress: this.elapsed / CONFIG.OBSERVE_SECONDS,
      needsLookUp: false
    };
  }
}

function findSpot(position: Vector3): number | undefined {
  for (let index = 0; index < OBSERVE_POINTS.length; index += 1) {
    const spot = OBSERVE_POINTS[index]!;
    const distance = Math.hypot(position.x - spot.x, position.z - spot.z);
    if (distance <= CONFIG.OBSERVE_RADIUS) {
      return index;
    }
  }
  return undefined;
}
