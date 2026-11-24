// When toasts close on their own. One countdown per shown toast, and one set
// of pause reasons per region: each reason is cleared on its own, so the
// window regaining focus never resumes a toast the pointer still rests on.
// Paused time is kept, never reset. Pure apart from `setTimeout`, so it runs
// on every platform and is unit tested with fake timers.

/**
 * Why a region's timers are paused: the pointer on it, focus in it, the window
 * or the page going away, a swipe, or a reason of your own.
 * @stable
 */
type ToastPauseReason =
  | "item-hover"
  | "focus-in"
  | "window-blur"
  | "page-hide"
  | "swipe"
  | (string & {})

type Countdown = {
  // Which update of the toast it counts for. An update restarts it.
  version: number
  duration: number
  remaining: number
  // When it last started running, or undefined while it waits.
  startedAt?: number
  timer?: ReturnType<typeof setTimeout>
}

/** What a countdown needs to know about a toast. */
type TimedToast = {
  id: string
  version: number
  duration: number
  // Whether something holds it open, like a pending action. It waits until that ends.
  held: boolean
}

function createToastTimers(
  expire: (id: string) => unknown,
  now = () => Date.now()
) {
  const countdowns = new Map<string, Countdown>()
  const reasons = new Set<string>()
  let shown: readonly TimedToast[] = []

  function stop(countdown: Countdown) {
    if (countdown.startedAt === undefined) {
      return
    }
    clearTimeout(countdown.timer)
    countdown.remaining -= now() - countdown.startedAt
    countdown.startedAt = undefined
    countdown.timer = undefined
  }

  function start(id: string, countdown: Countdown) {
    if (
      countdown.startedAt !== undefined ||
      !Number.isFinite(countdown.remaining)
    ) {
      return
    }
    countdown.startedAt = now()
    countdown.timer = setTimeout(
      () => {
        countdown.startedAt = undefined
        countdown.timer = undefined
        countdown.remaining = 0
        // An `onDismiss` that cancels the close starts a new countdown, so the toast tries again later.
        if (expire(id) === false && countdowns.get(id) === countdown) {
          countdown.remaining = countdown.duration
          apply()
        }
      },
      Math.max(0, countdown.remaining)
    )
  }

  function apply() {
    const ids = new Set(shown.map((toast) => toast.id))
    for (const [id, countdown] of countdowns) {
      // Toasts that are no longer shown, like ones pushed past `maxVisible`, wait with the time they have left.
      if (!ids.has(id)) {
        stop(countdown)
      }
    }
    for (const toast of shown) {
      let countdown = countdowns.get(toast.id)
      if (!countdown || countdown.version !== toast.version) {
        if (countdown) {
          stop(countdown)
        }
        countdown = {
          version: toast.version,
          duration: toast.duration,
          remaining: toast.duration,
        }
        countdowns.set(toast.id, countdown)
      }
      if (reasons.size || toast.held) {
        stop(countdown)
      } else {
        start(toast.id, countdown)
      }
    }
  }

  return {
    /**
     * The toasts on screen now, and the ids still in the queue. Countdowns for
     * toasts that left the queue are dropped.
     */
    update(next: readonly TimedToast[], queued: Set<string>) {
      shown = next
      for (const [id, countdown] of countdowns) {
        if (!queued.has(id)) {
          stop(countdown)
          countdowns.delete(id)
        }
      }
      apply()
    },
    /** Pauses every countdown for a reason, until that reason is cleared. */
    pause(reason: ToastPauseReason) {
      if (reasons.has(reason)) {
        return
      }
      reasons.add(reason)
      apply()
    },
    /** Clears one reason. Countdowns resume once no reason is left. */
    resume(reason: ToastPauseReason) {
      if (!reasons.delete(reason)) {
        return
      }
      apply()
    },
    /** Whether anything pauses the countdowns now. */
    isPaused: () => reasons.size > 0,
    /** The time a toast has left, in ms, for tests and devtools. */
    remaining(id: string) {
      const countdown = countdowns.get(id)
      if (!countdown) {
        return undefined
      }
      return countdown.startedAt === undefined
        ? countdown.remaining
        : countdown.remaining - (now() - countdown.startedAt)
    },
    /** Stops every countdown, for when the region leaves the page. */
    destroy() {
      for (const countdown of countdowns.values()) {
        stop(countdown)
      }
      countdowns.clear()
    },
  }
}

export { createToastTimers, type TimedToast, type ToastPauseReason }
