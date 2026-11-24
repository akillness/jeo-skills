// What Button and Toggle share: a part that acts like a button whatever it's
// rendered as. A native button keeps its own behavior, a link stays a link,
// and anything else becomes a button.
import { withSource } from "../kernel/details"
import { trusted } from "../kernel/trusted"

/** What a button-like part is rendered as, `unknown` until it binds. */
type ButtonElement = "button" | "link" | "other" | "unknown"

function buttonElement(el: HTMLElement) {
  if (el.tagName === "BUTTON") {
    return "button"
  }
  if (el.matches("a[href]")) {
    return "link"
  }
  return "other"
}

// The role a button-like part's slot declares: a native button or a link keeps its own.
function buttonRole<State>(
  elementOf: (state: State, context: { key: string }) => ButtonElement
) {
  return {
    role: (state: State, context: { key: string }) =>
      elementOf(state, context) === "other" ? ("button" as const) : undefined,
    roles: ["button"] as const,
  }
}

// A native button is natively disabled, or keeps focus with aria-disabled when
// `focusable`. Links and other elements always use aria-disabled. Until a part
// binds, which is all a server sees, it gets both, and leaves its tab stop alone.
function buttonElementAttrs(
  element: ButtonElement,
  options: {
    type?: string
    disabled: boolean
    focusable: boolean
    tabindex?: string
  }
) {
  const native = element === "button"
  const unknown = element === "unknown"
  const mayBeNative = native || unknown
  const unfocusable = options.disabled && !options.focusable
  const leavesTabOrder = unfocusable && !mayBeNative
  const defaultTabindex = leavesTabOrder
    ? "-1"
    : element === "other"
      ? "0"
      : undefined
  return {
    type: mayBeNative ? options.type : undefined,
    disabled: mayBeNative && unfocusable ? "" : undefined,
    "aria-disabled":
      options.disabled && (unknown || !(native && unfocusable))
        ? "true"
        : undefined,
    tabindex: options.tabindex ?? defaultTabindex,
  }
}

// The click a key makes reports the person's key, as a native button's own
// click does, since a script's click reports itself as programmatic. A key an
// agent sends isn't a person's, so its click keeps the agent's source.
function keyClick(event: KeyboardEvent, el: HTMLElement) {
  // An SVG element has no `click()`, so it gets the click a script would dispatch.
  const click = () =>
    typeof el.click === "function"
      ? el.click()
      : el.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        )
  if (trusted(event)) {
    withSource("keyboard", click)
  } else {
    click()
  }
}

// Enter activates on keydown and Space on keyup, like a native button, for
// parts rendered as something that isn't a button or a link. Space never
// scrolls the page. Buttons and links activate themselves.
function buttonKeydown(event: KeyboardEvent, el: HTMLElement) {
  if (event.target !== el || buttonElement(el) !== "other") {
    return
  }
  if (event.key === "Enter") {
    event.preventDefault()
    if (!event.repeat) {
      keyClick(event, el)
    }
  } else if (event.key === " ") {
    event.preventDefault()
  }
}

function buttonKeyup(event: KeyboardEvent, el: HTMLElement) {
  if (
    event.target === el &&
    event.key === " " &&
    buttonElement(el) === "other"
  ) {
    keyClick(event, el)
  }
}

// A press a link leaves to the browser: a new tab or window, or a download.
function opensElsewhere(event: Event | undefined, el: HTMLElement | undefined) {
  if (
    !event ||
    !el ||
    !(event instanceof MouseEvent) ||
    !el.matches("a[href]")
  ) {
    return false
  }
  const target = el.getAttribute("target")
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0 ||
    el.hasAttribute("download") ||
    (!!target && target !== "_self")
  )
}

export {
  buttonElement,
  buttonElementAttrs,
  type ButtonElement,
  buttonKeydown,
  buttonKeyup,
  buttonRole,
  opensElsewhere,
}
