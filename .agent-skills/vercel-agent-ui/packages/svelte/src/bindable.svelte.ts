// Who controls a component's bindable keys, the ones with a default or a
// change callback, like `value`. A bindable prop the component writes back,
// which it keeps when nothing is bound, isn't the parent controlling it. A key
// is controlled when it starts defined, once the parent sets it to a value the
// component didn't write, like `bind:value` to a variable that starts empty,
// even one that matches the default, or once the parent keeps its value
// through a change, like a function binding whose setter refuses it.
import type { ChangeDetails, Primitive } from "@ui-sdk/core"
import { schemaOf } from "@ui-sdk/core/renderer"
import { untrack } from "svelte"

// Whether two values hold the same data. A bindable prop's value comes back
// as Svelte's proxy, so a token list the component wrote back isn't the same
// array the core holds.
// check-code: allow return-type recursive, so TypeScript cannot infer it.
function sameShape(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    !a ||
    !b ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false
  }
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) {
    return false
  }
  return keys.every((key) =>
    sameShape(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  )
}

// The name of a key's change callback: `onValueChange` for `value`.
const changeOf = (key: string) =>
  `on${key[0].toUpperCase()}${key.slice(1)}Change`

/**
 * Tracks who controls each bindable key of an instance of `primitive`, from
 * its first `state`, the `first` options it was made with, and the
 * component's `options` getter, which passes each bindable prop as a getter.
 */
function trackBindable(
  primitive: Primitive,
  state: object,
  first: Record<string, unknown>,
  options: () => object
) {
  const schema = schemaOf(primitive).options
  const isBindable = (key: string) =>
    `default${key[0].toUpperCase()}${key.slice(1)}` in schema ||
    (key in schema && changeOf(key) in schema)
  // Per key: whether the parent controls it, its value at the last update,
  // and what the component last wrote back, which coming back is its own echo.
  const keys: Record<
    string,
    { on: boolean; last: unknown; wrote?: [unknown] }
  > = {}
  for (const key in state) {
    if (isBindable(key)) {
      keys[key] = { on: first[key] !== undefined, last: first[key] }
    }
  }
  // Counts the keys the parent took control of, so reads of who controls them track it.
  let taken = $state(0)
  const takes = (own: (typeof keys)[string], value: unknown) =>
    value !== undefined &&
    !sameShape(value, own.last) &&
    !(own.wrote && sameShape(value, own.wrote[0]))
  const take = (own: (typeof keys)[string]) => {
    own.on = true
    taken++
  }
  // What the parent holds for a key now, read through the component's getter.
  const held = (key: string) =>
    (untrack(options) as Record<string, unknown>)[key]
  // A parent that held a value and kept it through the write-back refused the
  // change. One that holds nothing controls nothing, so the component keeps it.
  const refused = (before: unknown, after: unknown, asked: unknown) =>
    before !== undefined && sameShape(after, before) && !sameShape(after, asked)
  // The change callback the instance gets for `key`: the component's, then
  // the check of who controls the key. It runs on every change, since a
  // binding that saved the last one can refuse this one, and a refused change
  // is canceled, so the instance keeps the parent's value.
  const checked =
    (key: string, callback: Function) =>
    (asked: unknown, details?: ChangeDetails<string>) => {
      const own = keys[key]
      const before = held(key)
      callback(asked, details)
      if (details?.canceled) {
        return
      }
      if (details && refused(before, held(key), asked)) {
        details.cancel()
        if (!own.on) {
          take(own)
        }
      } else {
        own.wrote = [asked]
      }
    }

  return {
    /** Whether the parent controls `key`. Reading it tracks it. */
    controls(key: string) {
      taken
      return keys[key]?.on ?? false
    },
    /**
     * `given` with the keys the parent doesn't control left undefined, never
     * reading their getters, so writing one back, like a layout on every move
     * of a drag, wakes nothing that reads this. Reading it tracks who controls them.
     */
    controlledOnly(given: object) {
      taken
      const result: Record<string, unknown> = {}
      for (const key in given) {
        result[key] =
          keys[key] && !keys[key].on
            ? undefined
            : (given as Record<string, unknown>)[key]
      }
      return result
    },
    /**
     * The options the instance takes: who controls each key brought up to
     * date from `next`, the keys the parent doesn't control left undefined,
     * and change callbacks that check who controls their key.
     */
    resolve(next: object) {
      const resolved: Record<string, unknown> = { ...next }
      for (const key in keys) {
        const own = keys[key]
        const value = resolved[key]
        const callback = resolved[changeOf(key)]
        if (typeof callback === "function") {
          resolved[changeOf(key)] = checked(key, callback)
        }
        if (!own.on && takes(own, value)) {
          take(own)
        }
        own.last = value
        if (!own.on) {
          resolved[key] = undefined
        }
      }
      return resolved
    },
  }
}

export { changeOf, trackBindable }
