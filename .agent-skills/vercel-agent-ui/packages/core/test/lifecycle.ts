import type {
  Primitive,
  PrimitiveInstance,
} from "../src/foundation/kernel/primitive-types"
import { mount, rerenderOf } from "../src/testing/mount"
import { changesOf, idle } from "./after-mount"
import type { Case } from "./after-mount.cases"

type Listened = {
  target: EventTarget
  type: string
  listener: unknown
  capture: boolean
}

const listeners = new Set<Listened>()
const timers = new Map<unknown, { delay: number; order: number }>()
let timersMade = 0
const frames = new Set<number>()
const observed = new Map<object, { targets: Set<Node>; kind: string }>()
let framesAsked = 0

const pageTargets = () =>
  [window, document, document.documentElement, document.body] as EventTarget[]
const captureOf = (options?: boolean | AddEventListenerOptions) =>
  typeof options === "boolean" ? options : !!options?.capture
const find = (
  target: EventTarget,
  type: string,
  listener: unknown,
  capture: boolean
) =>
  [...listeners].find(
    (entry) =>
      entry.target === target &&
      entry.type === type &&
      entry.listener === listener &&
      entry.capture === capture
  )

function trackListeners() {
  const { addEventListener, removeEventListener } = EventTarget.prototype
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    addEventListener.call(this, type, listener, options)
    if (!listener || !pageTargets().includes(this)) {
      return
    }
    const capture = captureOf(options)
    if (find(this, type, listener, capture)) {
      return
    }
    const entry = { target: this, type, listener, capture }
    listeners.add(entry)
    const signal = typeof options === "object" ? options.signal : undefined
    signal?.addEventListener("abort", () => listeners.delete(entry), {
      once: true,
    })
    if (typeof options === "object" && options.once) {
      addEventListener.call(this, type, () => listeners.delete(entry), {
        capture,
        once: true,
      })
    }
  }
  EventTarget.prototype.removeEventListener = function (
    type,
    listener,
    options
  ) {
    removeEventListener.call(this, type, listener, options)
    const entry = find(this, type, listener, captureOf(options))
    if (entry) {
      listeners.delete(entry)
    }
  }
}

function trackTimers() {
  const scope = globalThis as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >
  for (const [set, clear, repeats] of [
    ["setTimeout", "clearTimeout", false],
    ["setInterval", "clearInterval", true],
  ] as const) {
    const start = scope[set]!
    const stop = scope[clear]!
    scope[set] = (callback: unknown, ...rest: unknown[]) => {
      const id: unknown = start(
        (...args: unknown[]) => {
          if (!repeats) {
            timers.delete(id)
          }
          if (typeof callback === "function") {
            callback(...args)
          }
        },
        ...rest
      )
      timers.set(id, { delay: Number(rest[0] ?? 0), order: ++timersMade })
      return id
    }
    scope[clear] = (id: unknown) => {
      timers.delete(id)
      stop(id)
    }
  }
  const ask = window.requestAnimationFrame.bind(window)
  const cancel = window.cancelAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => {
    framesAsked++
    const id = ask((time) => {
      frames.delete(id)
      callback(time)
    })
    frames.add(id)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    frames.delete(id)
    cancel(id)
  }
}

function trackObservers() {
  for (const kind of [
    "MutationObserver",
    "ResizeObserver",
    "IntersectionObserver",
  ] as const) {
    const Observer = (
      globalThis as unknown as Record<
        string,
        { prototype: Record<string, unknown> } | undefined
      >
    )[kind]
    if (!Observer) {
      continue
    }
    const proto = Observer.prototype as Record<
      string,
      (this: object, ...args: unknown[]) => unknown
    >
    const { observe, unobserve, disconnect } = proto
    proto.observe = function (target, ...rest) {
      const entry = observed.get(this) ?? { targets: new Set<Node>(), kind }
      entry.targets.add(target as Node)
      observed.set(this, entry)
      return observe!.call(this, target, ...rest)
    }
    if (unobserve) {
      proto.unobserve = function (target) {
        observed.get(this)?.targets.delete(target as Node)
        return unobserve.call(this, target)
      }
    }
    proto.disconnect = function () {
      observed.delete(this)
      return disconnect!.call(this)
    }
  }
}

trackListeners()
trackTimers()
trackObservers()

// A mutation observer on an element that left the page goes with it; the
// others hold their targets until they let go.
function running(since = 0) {
  const watching = [...observed.values()].flatMap(({ targets, kind }) =>
    [...targets]
      .filter((target) => kind !== "MutationObserver" || target.isConnected)
      .map((target) => `${kind} on ${target.nodeName.toLowerCase()}`)
  )
  return {
    listeners: [...listeners]
      .map(({ target, type, capture }) => {
        const name =
          target === window ? "window" : (target as Node).nodeName.toLowerCase()
        return `${name} ${type}${capture ? " (capture)" : ""}`
      })
      .sort(),
    timers: [...timers.values()]
      .filter(({ order }) => order > since)
      .map(({ delay }) => `${delay}ms`),
    frames: frames.size,
    observers: watching.sort(),
    page: [...document.body.children]
      .filter((el) => !el.hasAttribute("data-ui-sdk-announcer"))
      .map((el) => el.outerHTML.slice(0, 80)),
  }
}

async function framesDuring(run: () => Promise<unknown>) {
  const before = framesAsked
  await run()
  return framesAsked - before
}

type Step = {
  key: string
  values: readonly unknown[]
  set: (value: unknown) => void
}

function stepsOf(entry: Case, view: ReturnType<typeof mount>) {
  const rerender = rerenderOf(view)
  const steps = new Map<string, Step>()
  for (const change of changesOf(entry).changes) {
    const key =
      change.kind === "option"
        ? change.key
        : `${change.slot} "${change.partKey}" ${change.key}`
    const step = steps.get(key)
    const values = step ? step.values : [change.from]
    const next = values.includes(change.to) ? values : [...values, change.to]
    const set =
      change.kind === "option"
        ? (value: unknown) => rerender.setOptions({ [change.key]: value })
        : (value: unknown) =>
            rerender.setProps(change.slot, change.partKey, {
              [change.key]: value,
            })
    steps.set(key, { key, values: next, set })
  }
  return [...steps.values()]
}

type Exercised = { view: ReturnType<typeof mount>; instance: PrimitiveInstance }

async function exercise(
  entry: Case,
  after?: (exercised: Exercised, step: Step) => Promise<void>,
  extra: Record<string, unknown> = {}
) {
  const primitive = entry.primitive as Primitive
  let instance: PrimitiveInstance | undefined
  const made = Object.assign(
    (options: never) => (instance = primitive(options)),
    primitive
  ) as Primitive
  const view = mount(
    made,
    { ...extra, ...entry.options } as never,
    entry.markup
  )
  await view.settle()
  for (const step of stepsOf(entry, view)) {
    for (const value of [...step.values.slice(1), step.values[0]]) {
      step.set(value)
    }
    await view.settle()
    await after?.({ view, instance: instance! }, step)
  }
  return view
}

async function afterTimers(mark: number) {
  const changed: string[] = []
  const observer = new MutationObserver((records) =>
    records.forEach((record) =>
      changed.push(
        `${record.type} on ${(record.target as Element).outerHTML?.slice(0, 60) ?? record.target.nodeName}`
      )
    )
  )
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  const warned: string[] = []
  const { warn, error } = console
  console.warn = (...args: unknown[]) => warned.push(args.map(String).join(" "))
  console.error = console.warn
  try {
    const waits = [...timers.values()]
      .filter(({ order }) => order > mark)
      .map(({ delay }) => delay)
    if (waits.length) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(...waits) + 20)
      )
    }
  } finally {
    console.warn = warn
    console.error = error
  }
  changed.push(...observer.takeRecords().map((record) => record.type))
  observer.disconnect()
  return { changed, warned }
}

const timerMark = () => timersMade

export {
  afterTimers,
  exercise,
  framesDuring,
  idle,
  running,
  timerMark,
  type Step,
}
