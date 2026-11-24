// The source of a change an event explains: whether a key, a pointer or a
// screen reader caused it, read from `kernel/modality`. Details of a change no
// event explains need only `kernel/details.ts`.
import { dev, emit } from "#dev"
import { sourceOf, trackInput } from "./modality"
import { changeFrom } from "./change"
import {
  createDetails,
  resolveSource,
  withSource,
  type ChangeSource,
} from "./details"
import { isDestroying } from "./keep"
import { callbackName } from "./option-names"
import type { PrimitiveContext, ReasonFor } from "./primitive-types"
import { watchers } from "./watchers"

/**
 * How a change came about, from its reason, its event and the change that caused it.
 */
const changeSource = (reason: string, event?: Event) =>
  resolveSource(reason, event && (() => sourceOf(event)))

/**
 * `createChange`'s source of a change, from its reason and event. Input
 * tracking starts here, as the primitive is created, so its first change
 * already knows the key or pointer press behind it.
 */
function inputSource() {
  trackInput()
  return changeSource
}

/**
 * The `change` an `api` calls to fire `on<Key>Change` from options, which
 * writes the state unless the key is controlled or the change is canceled,
 * and returns whether it went through. Each change's details say whether a
 * key, a pointer or a screen reader caused it, from its event; `source`
 * replaces how that's worked out, for a primitive whose changes come from
 * somewhere else, like an image loading.
 * @stable
 */
function createChange<Options, State extends object>(
  context: PrimitiveContext<Options, State, any>,
  source: (reason: string, event?: Event) => ChangeSource = inputSource()
) {
  return changeFrom(context, source)
}

/**
 * The `commit` an `api` calls once an interaction that changed a key in steps
 * ends, like a slider's drag, which fires `on<Key>Commit` from options:
 * `onValueCommit` for `"value"`. Its details carry the reason, the event and
 * who caused it, like a change's, and whatever else is passed, like which
 * thumb moved. Commits can't be canceled. Declare the key in the definition's
 * `commits`, so `observe` reports one change per commit instead of every step.
 * `source` replaces how the source is worked out, like `createChange`'s.
 *
 * ```ts
 * const commit = createCommit(context)
 * commit("value", store.get().value, { reason: "drag", event })
 * ```
 * @experimental
 */
function createCommit<Options, State extends object>(
  context: PrimitiveContext<Options, State, any>,
  source: (reason: string, event?: Event) => ChangeSource = inputSource()
) {
  return <
    Key extends {
      [
        Name in keyof State & string
      ]: `on${Capitalize<Name>}Commit` extends keyof Options ? Name : never
    }[keyof State & string],
  >(
    key: Key,
    value: State[Key],
    details: {
      reason: ReasonFor<Options, Key, "Commit">
      event?: Event
      [extra: string]: unknown
    }
  ) => {
    if (isDestroying()) {
      return
    }
    const commitDetails = createDetails(
      details,
      source(details.reason, details.event),
      false
    )
    const callbacks = context.options() as Record<
      string,
      ((value: unknown, details: object) => void) | undefined
    >
    const callback = callbacks[callbackName(key, "Commit")]
    if (callback) {
      withSource(commitDetails.source, () => callback(value, commitDetails))
    }
    if (dev) {
      emit({
        type: "commit",
        component: context.label,
        id: context.id,
        key,
        value,
        reason: details.reason,
        source: commitDetails.source,
      })
    }
    watchers.commit?.(context.id, key, value, commitDetails)
  }
}

/**
 * Calls an event option that isn't state, like `onAction(value, details)`
 * when a menu runs an action, with the details a change passes: the reason,
 * the event and who caused it. Returns whether a listener canceled it, so a
 * primitive can skip what the event would have done.
 *
 * ```ts
 * if (dispatch(context, "onAction", "share", { reason: "item-press", event })) return
 * ```
 * @experimental
 */
function dispatch<Value>(
  context: { options: () => unknown },
  name: `on${string}`,
  value: Value,
  details: {
    reason: string
    event?: Event
    source?: ChangeSource
    [extra: string]: unknown
  }
) {
  const callbackDetails = createDetails(
    details,
    details.source ?? changeSource(details.reason, details.event)
  )
  const callback = (context.options() as Record<string, unknown>)[name]
  if (typeof callback === "function") {
    withSource(callbackDetails.source, () =>
      (callback as (value: Value, details: unknown) => void)(
        value,
        callbackDetails
      )
    )
  }
  return callbackDetails.canceled
}

export { changeSource, createChange, createCommit, dispatch, inputSource }
