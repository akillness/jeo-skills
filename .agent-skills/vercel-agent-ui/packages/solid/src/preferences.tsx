import { preferencesScript, type PreferenceLike } from "@ui-sdk/core"
import { isServer, type JSX } from "@solidjs/web"
import { createEffect, createSignal, omit } from "solid-js"

/**
 * Props of `Preferences`.
 * @experimental
 */
type PreferencesProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  /** The preferences to show, from `createPreference` or `createColorScheme`. */
  preferences: readonly PreferenceLike[]
  /** The nonce your Content Security Policy gives inline scripts. */
  nonce?: string
  children?: JSX.Element
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
function Preferences(props: PreferencesProps) {
  const rest = omit(props, "preferences", "nonce", "children")
  let element: HTMLDivElement | undefined
  // The script is in the server's HTML until mounted. A client-only render
  // drops it right away, and the browser never runs a script Solid inserts.
  const [mounted, setMounted] = createSignal(false, { ownedWrite: true })
  // The server renders the defaults. In the browser the effect below writes
  // them, never the template, since hydrating it would put the server's
  // values back over the ones the script put there.
  const server = () => {
    const shown: Record<string, string> = {}
    if (isServer) {
      for (const preference of props.preferences) {
        if (!preference.global) {
          shown[preference.attribute] = preference.initialState.value
        }
      }
    }
    return shown
  }
  createEffect(
    () => props.preferences,
    (list) => {
      const write = () => {
        for (const preference of list) {
          ;(preference.global
            ? document.documentElement
            : element
          )?.setAttribute(preference.attribute, preference.get().value)
        }
      }
      // Subscribing first reads back what was saved.
      const stops = list.map((preference) => preference.subscribe(write))
      write()
      setMounted(true)
      return () => stops.forEach((stop) => stop())
    }
  )
  return (
    <div
      {...rest}
      {...server()}
      data-slot="preferences"
      style={{ display: "contents" }}
      ref={(el: HTMLDivElement) => (element = el)}
    >
      {mounted() ? null : (
        <script
          nonce={props.nonce}
          innerHTML={preferencesScript(props.preferences)}
        />
      )}
      {props.children}
    </div>
  )
}

/**
 * A preference's state, like `{ value: "dark" }`, or a color scheme's, as an
 * accessor. It's the server's until mounted, so the page hydrates without a
 * mismatch, and the saved value right after.
 * @experimental
 */
function usePreference<State extends object>(preference: {
  get: () => State
  initialState: State
  subscribe: (listener: () => void) => () => void
}) {
  // A state is an object, never a function, which a signal would take for a way to compute it.
  const [state, setState] = createSignal(
    preference.initialState as Exclude<State, Function>,
    {
      ownedWrite: true,
    }
  )
  createEffect(
    () => preference,
    (current) => {
      // Subscribing first reads back what was saved.
      const stop = current.subscribe(() =>
        setState(() => current.get() as Exclude<State, Function>)
      )
      setState(() => current.get() as Exclude<State, Function>)
      return stop
    }
  )
  return state
}

export { Preferences, type PreferencesProps, usePreference }
