import type { PrimitiveContext } from "@ui-sdk/core"

function sameValue(a: unknown, b: unknown) {
  if (Object.is(a, b)) {
    return true
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false
  }
  return a.every((item, index) => Object.is(item, b[index]))
}

const prefersReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches

type FlipOptions<State extends object> = {
  watch: (state: State) => unknown
  duration?: () => number
  easing?: string
  skip?: (key: string) => boolean
}

function createFlip<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: FlipOptions<State>
) {
  const { store } = context
  const elements = new Map<string, HTMLElement>()
  const slides = new Map<string, Animation>()
  let watched = options.watch(store.get())
  let before: Map<string, DOMRect> | undefined
  let frame = 0
  let view: Window | null = null

  function play() {
    frame = 0
    const from = before
    before = undefined
    if (!from) {
      return
    }
    const moving = [...elements].filter(
      ([key, el]) =>
        from.has(key) &&
        el.isConnected &&
        typeof el.animate === "function" &&
        !options.skip?.(key)
    )
    for (const [key] of moving) {
      slides.get(key)?.cancel()
    }
    const to = moving.map(([, el]) => el.getBoundingClientRect())
    const duration = options.duration?.() ?? 200
    moving.forEach(([key, el], index) => {
      const dx = from.get(key)!.left - to[index].left
      const dy = from.get(key)!.top - to[index].top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return
      }
      const slide = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        {
          duration,
          easing: options.easing ?? "cubic-bezier(0.2, 0, 0, 1)",
        }
      )
      slides.set(key, slide)
      const done = () => slides.get(key) === slide && slides.delete(key)
      slide.addEventListener("finish", done)
      slide.addEventListener("cancel", done)
    })
  }

  function measure() {
    if (before || !elements.size || prefersReducedMotion()) {
      return
    }
    view = [...elements.values()][0].ownerDocument.defaultView
    if (!view) {
      return
    }
    before = new Map()
    for (const [key, el] of elements) {
      if (el.isConnected) {
        before.set(key, el.getBoundingClientRect())
      }
    }
    frame = view.requestAnimationFrame(play)
  }

  context.onDestroy(
    store.subscribe(() => {
      const next = options.watch(store.get())
      if (sameValue(next, watched)) {
        return
      }
      watched = next
      measure()
    })
  )
  context.onDestroy(() => {
    if (frame) {
      view?.cancelAnimationFrame(frame)
    }
    slides.forEach((slide) => slide.cancel())
  })

  return {
    bind(el: HTMLElement, key: string) {
      elements.set(key, el)
      return () => {
        if (elements.get(key) === el) {
          elements.delete(key)
        }
      }
    },
    measure,
  }
}

type Flip = ReturnType<typeof createFlip>

export { createFlip, type Flip, type FlipOptions }
