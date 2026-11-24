import { dev, warn } from "#dev"
import { whenKept } from "./keep"
import type { PrimitiveContext } from "./primitive-types"

const attach = Symbol.for("ui-sdk.controller.attach")
const detach = Symbol.for("ui-sdk.controller.detach")
const attached = Symbol.for("ui-sdk.controller.attached")

/**
 * Whether a controller drives an instance now, like an alert dialog the app
 * rendered for `confirm()`. Hidden behind a symbol, like attaching.
 */
function isControllerAttached(controller: unknown) {
  return !!(controller as { [attached]?: boolean } | undefined)?.[attached]
}

// Hands an instance's api to a controller. Hidden behind a symbol, so the
// controller's public surface is only its methods.
function attachController(controller: unknown, api: unknown) {
  ;(controller as { [attach]?: (api: unknown) => void } | undefined)?.[
    attach
  ]?.(api)
}

// Takes an instance's api back from a controller, if it's still the one attached.
function detachController(controller: unknown, api: unknown) {
  ;(controller as { [detach]?: (api: unknown) => void } | undefined)?.[
    detach
  ]?.(api)
}

// A render on the server or before mount calls methods before anything attaches.
// Other names stay undefined, so `await` or a framework never takes the
// controller for a promise, a ref or a React element.
const methodName = (key: PropertyKey) =>
  typeof key === "string" &&
  /^[a-z]/.test(key) &&
  !/^(internal|then|toJSON)$/.test(key) &&
  !(key in {})

// Reads like `isOpen()` render before mount on purpose, so only verbs warn.
const isRead = (key: PropertyKey) =>
  typeof key === "string" && /^(is|get|has|can)[A-Z]/.test(key)

/**
 * A handle created outside any component and passed as the `controller` option.
 * Calls go to the instance it is attached to. Before it attaches, and once that
 * instance is gone, its methods do nothing and return undefined. Development
 * builds warn once for each action called before it first attaches, like
 * `open()`, but not for reads like `isOpen()`. A method read earlier calls the
 * instance attached when it's called. An api's `internal` is for adapters, so a
 * controller never hands it out.
 * @stable
 */
function createController<Api extends object>() {
  let current: Api | undefined
  let hasAttached = false
  // One function per method, kept across reads, which calls the method of
  // whichever instance is attached when it's called.
  const methods = new Map<PropertyKey, (...args: unknown[]) => unknown>()
  const read = (key: PropertyKey) =>
    key === "internal"
      ? undefined
      : (current as Record<PropertyKey, unknown> | undefined)?.[key]
  const forward = (key: PropertyKey) => {
    let method = methods.get(key)
    if (method) {
      return method
    }
    let warned = false
    method = (...args: unknown[]) => {
      const value = read(key)
      if (typeof value === "function") {
        return value.apply(current, args)
      }
      if (dev && !hasAttached && !warned && !isRead(key)) {
        warned = true
        warn(
          `${String(key)}() was called before its component attached and did nothing.`
        )
      }
    }
    methods.set(key, method)
    return method
  }
  const valueOf = (key: PropertyKey) => {
    if (!current) {
      return methodName(key) ? forward(key) : undefined
    }
    const value = read(key)
    return typeof value === "function" ? forward(key) : value
  }
  const isMember = (key: PropertyKey) =>
    key !== "internal" && !!current && Object.hasOwn(current, key)
  // A target without a prototype, so Svelte's `$state` keeps the controller
  // instead of wrapping it in a proxy that asks `has` before anything attaches.
  return new Proxy(Object.create(null) as Api, {
    get(_, key) {
      if (key === attach) {
        return (api: Api) => {
          current = api
          if (dev) {
            hasAttached = true
          }
        }
      }
      if (key === attached) {
        return current !== undefined
      }
      if (key === detach) {
        return (api: Api) => {
          if (current === api) {
            current = undefined
          }
        }
      }
      return valueOf(key)
    },
    has: (_, key) => isMember(key),
    ownKeys: () => (current ? Reflect.ownKeys(current).filter(isMember) : []),
    getOwnPropertyDescriptor: (_, key) =>
      isMember(key)
        ? { value: valueOf(key), enumerable: true, configurable: true }
        : undefined,
  })
}

// Lets the controller passed as the `controller` option drive `api`. Adapters
// pass options once the instance is committed, so a framework that creates and
// discards instances never leaves a controller stale, and an instance that
// leaves detaches unless another has attached since. So does one its framework
// releases, like React's <Activity> hiding it, until it's kept again.
function connectController(
  context: Pick<
    PrimitiveContext<{ controller?: unknown }, object, string>,
    "options" | "onOptions"
  >,
  api: unknown
) {
  let current = context.options().controller
  let kept = false
  whenKept(() => {
    kept = true
    attachController(current, api)
    return () => {
      kept = false
      detachController(current, api)
    }
  })
  context.onOptions(({ controller }) => {
    // Options handed over again with the same controller leave it be, so a
    // render of one instance never takes it from another that attached since.
    if (controller === current) {
      return
    }
    // Swapped for another, the old controller lets go, unless another instance has it now.
    detachController(current, api)
    current = controller
    if (kept) {
      attachController(controller, api)
    }
  })
}

export {
  attachController,
  connectController,
  createController,
  isControllerAttached,
}
