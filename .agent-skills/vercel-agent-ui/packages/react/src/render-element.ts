// Renders an element with no primitive behind it, and merges props and refs.
// Nothing here uses hooks or context, so the build ships this module without
// "use client" and a Server Component can call `renderElement` itself.
import * as React from "react"

// Whether a handler marked its event handled, on React's events and the DOM's.
function prevented(event: unknown) {
  const handled = event as
    | { isDefaultPrevented?: () => boolean; defaultPrevented?: boolean }
    | undefined
  return !!(handled?.isDefaultPrevented?.() ?? handled?.defaultPrevented)
}

/**
 * Later props win, except where they combine: className, style and ref, and
 * event handlers, where the later one runs first and can call
 * preventDefault() to skip the earlier. Undefined never replaces a value.
 * @stable
 */
function mergeProps(...sources: Record<string, any>[]) {
  const result: Record<string, any> = {}
  for (const source of sources) {
    for (const key in source) {
      const value = source[key]
      if (value === undefined) {
        continue
      }
      const earlier = result[key]
      if (earlier === undefined) {
        result[key] = value
      } else if (key === "className" && earlier) {
        result.className = `${earlier} ${value}`
      } else if (key === "style" && earlier) {
        result.style = mergeStyles(earlier, value)
      } else if (key === "ref" && earlier) {
        result.ref = mergeRefs(earlier, value)
      } else if (
        /^on[A-Z]/.test(key) &&
        typeof earlier === "function" &&
        typeof value === "function"
      ) {
        result[key] = (...args: unknown[]) => {
          value(...args)
          if (!prevented(args[0])) {
            earlier(...args)
          }
        }
      } else {
        result[key] = value
      }
    }
  }
  return result
}

// Styles merge, and a function of the part's state stays a function, so a
// part's own inline styles never drop a user's style function.
function mergeStyles(earlier: unknown, later: unknown) {
  if (typeof earlier !== "function" && typeof later !== "function") {
    return { ...(earlier as object), ...(later as object) }
  }
  const resolve = (style: unknown, state: unknown) =>
    typeof style === "function" ? style(state) : style
  return (state: unknown) => ({
    ...resolve(earlier, state),
    ...resolve(later, state),
  })
}

const mergedRefs = new WeakMap<
  object,
  WeakMap<object, (el: unknown) => () => void>
>()

function setRef(ref: React.Ref<unknown>, el: unknown) {
  if (typeof ref === "function") {
    return ref(el)
  }
  if (ref) {
    ;(ref as React.RefObject<unknown>).current = el
  }
}

/**
 * Stable for the same pair of refs, so React does not detach and reattach.
 * React runs the cleanup it returns instead of passing null, so each ref's
 * own cleanup runs, and a ref without one gets null.
 */
function mergeRefs(a: React.Ref<unknown>, b: React.Ref<unknown>) {
  if (!a || !b) {
    return a ?? b
  }
  let inner = mergedRefs.get(a)
  if (!inner) {
    mergedRefs.set(a, (inner = new WeakMap()))
  }
  let merged = inner.get(b)
  if (!merged) {
    merged = (el: unknown) => {
      const cleanups = [setRef(a, el), setRef(b, el)]
      return () =>
        cleanups.forEach((cleanup, index) =>
          typeof cleanup === "function"
            ? cleanup()
            : setRef(index ? b : a, null)
        )
    }
    inner.set(b, merged)
  }
  return merged
}

/**
 * A part's `render` prop: an element that receives the part's props, or a
 * function of the props and the part's state that returns one.
 * @stable
 */
type RenderProp<State = {}> =
  | React.ReactElement<any>
  | ((props: Record<string, any>, state: State) => React.ReactElement)

// React hands a client component a lazy wrapper in place of an element a
// Server Component passed it while that element's client module loads, two
// deep in development. Reading it suspends until the element is there.
function resolveLazy<Render>(render: Render) {
  let value = render
  let lazy = value as
    | {
        $$typeof?: symbol
        _payload: unknown
        _init: (payload: unknown) => Render
      }
    | undefined
  while (lazy?.$$typeof === Symbol.for("react.lazy")) {
    value = lazy._init(lazy._payload)
    lazy = value as typeof lazy
  }
  return value
}

/**
 * Renders an element with no primitive behind it that takes a `render` prop,
 * like a wrapper of your own: the tag, or the element or function passed as
 * `render`, which gets the props. Class name, style and children functions
 * resolve against `state`. Parts of a primitive use `createParts` or `usePart`.
 * It uses no hooks, so a Server Component can call it. Anything built on `usePrimitive`, `usePart` or `createParts` still needs a client component, since those use hooks.
 *
 * @example
 * function Card({ render, ...props }: PartProps<"div">) {
 *   return renderElement("div", { ...props, "data-card": "" }, render)
 * }
 * @stable
 */
function renderElement<State>(
  tag: string,
  props: Record<string, any>,
  render?: RenderProp<State>,
  state: State = {} as State
) {
  if (typeof props.className === "function") {
    props = { ...props, className: props.className(state) }
  }
  if (typeof props.style === "function") {
    props = { ...props, style: props.style(state) }
  }
  if (typeof props.children === "function") {
    props = { ...props, children: props.children(state) }
  }
  if (typeof render === "function") {
    return render(props, state)
  }
  const element = resolveLazy(render)
  if (element) {
    // The element's own props merge in: its handlers run before the part's.
    return React.cloneElement(
      element,
      mergeProps(props, element.props as Record<string, any>)
    )
  }
  return React.createElement(tag, props)
}

export { mergeProps, mergeRefs, renderElement, resolveLazy, type RenderProp }
