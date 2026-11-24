/**
 * Adds a listener and returns what removes it.
 */
function on<Type extends keyof HTMLElementEventMap>(
  target: HTMLElement | Document | Window,
  type: Type,
  listener: (event: HTMLElementEventMap[Type]) => void,
  options?: AddEventListenerOptions
) {
  target.addEventListener(type, listener as EventListener, options)
  return () =>
    target.removeEventListener(type, listener as EventListener, options)
}

// What an `onSelect` handler receives when no DOM event is left to cancel, like
// for a shortcut or a controller's call. A real Event, so `target`, `timeStamp`
// and `preventDefault()` behave as on a click; Node has `Event` too.
const selectEvent = () => new Event("select", { cancelable: true })

/**
 * Whether an event belongs to an input method composing text, like Enter
 * choosing one of its candidates or an `input` event for a half-typed word, so
 * a handler leaves it alone. Safari ends a composition with `isComposing`
 * false, so key code 229 counts too. Takes a key or input event, from the DOM or React.
 * @experimental
 */
function isComposing(
  event:
    | { isComposing?: boolean; keyCode?: number }
    | { nativeEvent: Event | { isComposing?: boolean; keyCode?: number } }
) {
  // React types a change's native event as a plain Event, though it's an InputEvent with `isComposing`.
  const key = ("nativeEvent" in event ? event.nativeEvent : event) as {
    isComposing?: boolean
    keyCode?: number
  }
  return key.isComposing === true || key.keyCode === 229
}

export { isComposing, on, selectEvent }
