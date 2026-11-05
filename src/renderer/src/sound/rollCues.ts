// 抽選の音の段取り（design/03 §2.7）。DOM に触れないのでテストできる。
// 回っているスロットが 1 つでもあれば回る音を流し続け、止まったスロットごとに小さく鳴らし、
// 全部が止まったら回る音を止めて 1 回だけ「決定」を鳴らす。

export type RollCueSounds = {
  /** 回る音を流し始める（流れていれば呼ばれない） */
  loopStart: () => void
  /** 回る音を止める */
  loopStop: () => void
  stop: () => void
  decide: () => void
}

type Timer = unknown
export type RollCueTimers = {
  setTimeout: (fn: () => void, ms: number) => Timer
  clearTimeout: (t: Timer) => void
}

/** 最後のスロットが止まってから「決定」までの間。同時に止まったスロットをまとめる */
export const SETTLE_MS = 40

export type RollCues = {
  /** スロットが回り始めた */
  start: () => void
  /** 回っていたスロットが止まった。stopped が false なら音を出さずに数だけ減らす（演出の途中で消えたとき） */
  end: (stopped: boolean) => void
  /** 演出なしで決まった（動きを減らす設定のとき） */
  instant: () => void
}

export function createRollCues(sounds: RollCueSounds, timers: RollCueTimers): RollCues {
  let active = 0
  let looping = false
  let settle: Timer | null = null

  const cancelSettle = () => {
    if (settle !== null) timers.clearTimeout(settle)
    settle = null
  }
  const scheduleDecide = () => {
    cancelSettle()
    settle = timers.setTimeout(() => {
      settle = null
      sounds.decide()
    }, SETTLE_MS)
  }

  return {
    start() {
      active += 1
      cancelSettle()
      if (!looping) {
        looping = true
        sounds.loopStart()
      }
    },
    end(stopped) {
      if (active === 0) return
      active -= 1
      if (stopped) sounds.stop()
      if (active > 0) return
      if (looping) sounds.loopStop()
      looping = false
      scheduleDecide()
    },
    instant() {
      if (active === 0) scheduleDecide()
    }
  }
}
