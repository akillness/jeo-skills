// A carousel's rotation timer. Each page gets the full interval once it
// arrives, and pauses keep the time left, so a CSS progress bar timed by
// `--carousel-interval` and paused by `[data-paused]` stays in step with it.
// Pure timing: the carousel decides what pauses it and what a tick does.

/** Why rotation is paused for now. None of these is a change to `playing`. */
type CarouselPause = "hover" | "hidden" | "offscreen" | "touch" | "drag"

function createAutoplay(options: {
  interval: () => number
  onTick: () => void
  /** Runs when it pauses or resumes. */
  onPausedChange: (paused: boolean) => void
  /** The clock pauses measure time left with, for tests. */
  now?: () => number
}) {
  const now = options.now ?? (() => performance.now())
  const pauses = new Set<CarouselPause>()
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  // Time left on the current page, and when the timer started counting it down.
  let remaining = 0
  let startedAt = 0

  const isPaused = () => running && pauses.size > 0

  function arm() {
    clearTimeout(timer)
    timer = undefined
    if (!running || pauses.size > 0) {
      return
    }
    startedAt = now()
    timer = setTimeout(tick, remaining)
  }

  function tick() {
    timer = undefined
    remaining = options.interval()
    options.onTick()
    arm()
  }

  function setPaused(cause: CarouselPause, paused: boolean) {
    const was = isPaused()
    if (paused === pauses.has(cause)) {
      return
    }
    if (paused) {
      // Keep what's left of this page's time.
      if (pauses.size === 0 && running && timer) {
        remaining = Math.max(0, remaining - (now() - startedAt))
      }
      pauses.add(cause)
      clearTimeout(timer)
      timer = undefined
    } else {
      pauses.delete(cause)
      arm()
    }
    if (isPaused() !== was) {
      options.onPausedChange(isPaused())
    }
  }

  return {
    /** Starts or stops rotating. Starting gives the current page a full interval. */
    setRunning(value: boolean) {
      if (value === running) {
        return
      }
      const was = isPaused()
      running = value
      remaining = options.interval()
      arm()
      if (isPaused() !== was) {
        options.onPausedChange(isPaused())
      }
    },
    /** The page changed: it gets a full interval from now. */
    restart() {
      remaining = options.interval()
      arm()
    },
    setPaused,
    isPaused,
    destroy() {
      running = false
      clearTimeout(timer)
    },
  }
}

export { createAutoplay }
