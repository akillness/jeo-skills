import { preferencesScript, type PreferenceLike } from "@ui-sdk/core"
import * as React from "react"
import { mergeRefs } from "./render-element"

/**
 * Props of `Preferences`.
 * @experimental
 */
type PreferencesProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** The preferences to show, from `createPreference` or `createColorScheme`. */
  preferences: readonly PreferenceLike[]
  /** The nonce your Content Security Policy gives inline scripts. */
  nonce?: string
  children?: React.ReactNode
}

const noSubscribe = () => () => {}

// The same array while every preference in it is, so an inline list doesn't resubscribe each render.
function useStable(preferences: readonly PreferenceLike[]) {
  const ref = React.useRef(preferences)
  const same =
    ref.current.length === preferences.length &&
    ref.current.every((preference, index) => preference === preferences[index])
  if (!same) {
    ref.current = preferences
  }
  return ref.current
}

// The current values, not the render's, which right after hydration are the
// server's. Its own element too: a restore that `onValueChange` cancels leaves
// the render's value, and React won't touch the attribute the script set.
function show(list: readonly PreferenceLike[], element: HTMLElement | null) {
  for (const preference of list) {
    ;(preference.global ? document.documentElement : element)?.setAttribute(
      preference.attribute,
      preference.get().value
    )
  }
}

/**
 * Shows preferences on `data-*` attributes, so CSS styles by them from the
 * first paint: global ones on `<html>`, the rest on its own element, which
 * has `display: contents`. On the server it renders one inline script as its
 * first child, which puts every saved value on its attribute as the page
 * loads, before hydration. Content that reads a preference, through
 * `usePreference`, catches up after hydration.
 * @experimental
 */
function Preferences({
  preferences,
  nonce,
  children,
  style,
  ref,
  ...props
}: PreferencesProps) {
  const list = useStable(preferences)
  const element = React.useRef<HTMLDivElement>(null)
  // True on the server and while hydrating, when the script is in the HTML. A
  // client-only render leaves it out, since the browser never runs a script React inserts.
  const fromServer = React.useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true
  )
  const subscribe = React.useCallback(
    (listener: () => void) => {
      const stops = list.map((preference) => preference.subscribe(listener))
      return () => stops.forEach((stop) => stop())
    },
    [list]
  )
  // One string, so the snapshot compares equal until a value changes.
  const values = React.useSyncExternalStore(
    subscribe,
    () => JSON.stringify(list.map((preference) => preference.get().value)),
    () =>
      JSON.stringify(list.map((preference) => preference.initialState.value))
  )
  // Before paint, where no script ran, like a root layout that mounts `<html>`
  // again on a client navigation, and again once subscribing reads saved values.
  React.useLayoutEffect(() => show(list, element.current), [list, values])
  React.useEffect(() => show(list, element.current), [list, values])
  const shown = JSON.parse(values) as string[]
  const attributes: Record<string, string> = {}
  list.forEach((preference, index) => {
    if (!preference.global) {
      attributes[preference.attribute] = shown[index]
    }
  })
  return (
    // The script changes these attributes before hydration, so they may differ from the server's HTML.
    <div
      data-slot="preferences"
      {...attributes}
      {...props}
      // `mergeRefs` takes refs to any element, and both of these are to this div.
      ref={mergeRefs(element, ref ?? null) as React.Ref<HTMLDivElement>}
      style={{ display: "contents", ...style }}
      suppressHydrationWarning
    >
      {fromServer ? (
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: preferencesScript(list) }}
        />
      ) : null}
      {children}
    </div>
  )
}

/**
 * A preference's state, like `{ value: "dark" }`, or a color scheme's. It's
 * the server's while hydrating, so the page hydrates without a mismatch, and
 * the saved value right after.
 * @experimental
 */
function usePreference<State>(preference: {
  get: () => State
  initialState: State
  subscribe: (listener: () => void) => () => void
}) {
  return React.useSyncExternalStore(
    preference.subscribe,
    preference.get,
    () => preference.initialState
  )
}

export { Preferences, type PreferencesProps, usePreference }
