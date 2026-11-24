// A text field's value changes in ways no event reports: frameworks write
// `value` for controlled inputs, apps clear a chat box after sending, and a
// form reset puts every default back. Parts that show whether a field is
// filled, or size a textarea to its text, hear all of them through here.

type TextControl = HTMLInputElement | HTMLTextAreaElement

/** What changed the value: typing, a write from code, or a form reset. */
type ValueSource = "input" | "write" | "reset"

const watchers = new WeakMap<TextControl, Set<(source: ValueSource) => void>>()

// The setter on the element's prototype. Writing through it skips whatever an
// own `value` property does, like React's tracker, so React still sees the
// next `input` event as a change and calls `onChange`.
function prototypeValue(el: TextControl) {
  return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!
}

// Runs once a form reset has put every control back, unless it was canceled.
// The reset event fires before the controls reset, and when the user pressed
// the button, microtasks run in between, so this waits a task.
function afterReset(event: Event, run: () => void) {
  setTimeout(() => {
    if (!event.defaultPrevented) {
      run()
    }
  })
}

// State set from script, like a custom element's `value` property, fires no
// `input` or `change`, like a native control's.
const scriptWrites = new Set<Element>()

function writeFromScript(el: Element, write: () => void) {
  if (scriptWrites.has(el)) {
    return write()
  }
  scriptWrites.add(el)
  try {
    write()
  } finally {
    scriptWrites.delete(el)
  }
}

function writingFromScript(el: Element) {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (scriptWrites.has(node)) {
      return true
    }
  }
  return false
}

/**
 * Writes a text control's value. From code by default, and only when it
 * differs: watchers hear a write, a framework's value tracker follows, and no
 * event fires, like for a hidden input that mirrors a component's value.
 * `asUser` writes it the way typing would: past the tracker, so a framework
 * sees a change, then `input` fires so frameworks, form libraries and fields
 * hear it.
 */
function writeValue(
  el: TextControl,
  value: string,
  options?: { asUser?: boolean }
) {
  if (options?.asUser && !writingFromScript(el)) {
    prototypeValue(el).set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
  } else if (el.value !== value) {
    el.value = value
  }
}

function notify(el: TextControl, source: ValueSource) {
  watchers.get(el)?.forEach((listener) => listener(source))
}

/**
 * Calls `listener` whenever the element's value may have changed: typing,
 * writes to `value` from code, and form resets. Returns a cleanup.
 */
function watchValue(el: TextControl, listener: (source: ValueSource) => void) {
  let listeners = watchers.get(el)
  if (!listeners) {
    listeners = new Set()
    watchers.set(el, listeners)
    intercept(el)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size) {
      return
    }
    watchers.delete(el)
    release(el)
  }
}

const restores = new WeakMap<TextControl, () => void>()
// Each element's wrapper, and how to take it off.
const wrapped = new WeakMap<
  TextControl,
  { wrapper: PropertyDescriptor; unwrap: () => void }
>()

// Wraps `value` with an own property that reports writes, around whatever was
// there, like React's tracker. The cleanup puts that back, unless a testing
// library or other layer wrapped it since: then binding again reuses ours.
function intercept(el: TextControl) {
  let layer = wrapped.get(el)
  // With no own `value` left, a layer took ours off with its own.
  if (!layer || !Object.getOwnPropertyDescriptor(el, "value")) {
    const own = Object.getOwnPropertyDescriptor(el, "value")
    const base = own ?? prototypeValue(el)
    const wrapper: PropertyDescriptor = {
      configurable: true,
      enumerable: base.enumerable,
      get() {
        return base.get!.call(el)
      },
      set(value: string) {
        base.set!.call(el, value)
        notify(el, "write")
      },
    }
    Object.defineProperty(el, "value", wrapper)
    layer = {
      wrapper,
      unwrap: () => {
        if (own) {
          Object.defineProperty(el, "value", own)
        } else {
          delete (el as { value?: string }).value
        }
      },
    }
    wrapped.set(el, layer)
  }
  const { wrapper, unwrap } = layer
  const onInput = () => notify(el, "input")
  const onReset = (event: Event) => {
    if (event.target === el.form) {
      afterReset(event, () => notify(el, "reset"))
    }
  }
  el.addEventListener("input", onInput)
  el.ownerDocument.addEventListener("reset", onReset, true)
  restores.set(el, () => {
    el.removeEventListener("input", onInput)
    el.ownerDocument.removeEventListener("reset", onReset, true)
    if (Object.getOwnPropertyDescriptor(el, "value")?.set === wrapper.set) {
      unwrap()
      wrapped.delete(el)
    }
  })
}

function release(el: TextControl) {
  restores.get(el)?.()
  restores.delete(el)
}

// A form reset returns a control to its default. A controlled one with no
// default keeps its value, like a controlled input in React, so a form action
// that resets the form leaves the app's state alone.
function keepsValueOnReset(value: unknown, defaultValue: unknown) {
  return value !== undefined && defaultValue === undefined
}

export {
  afterReset,
  keepsValueOnReset,
  type TextControl,
  type ValueSource,
  watchValue,
  writeFromScript,
  writeValue,
  writingFromScript,
}
