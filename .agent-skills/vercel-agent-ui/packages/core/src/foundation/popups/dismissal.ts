// `dismissible` and `onDismissAttempt`, shared by every layer a person can
// dismiss: whether Escape, an outside press, focus leaving, back and a swipe
// may close it, and what the app hears when one is refused.
import {
  isDismissal,
  type DismissAttemptDetails,
  type DismissAttemptReason,
} from "../kernel/details"

/** The options a dismissable layer takes, for the dismissals its `Reason` lists. */
type DismissOptions<Reason extends string> = {
  /**
   * Whether Escape, an outside press, focus or the window leaving, Android's back gesture and a
   * sheet's swipe can close it. Triggers, Close parts and the controller always can. Pass `false`
   * while it holds unsaved work, and ask in `onDismissAttempt`.
   * @defaultValue true
   */
  dismissible?: boolean
  /**
   * Runs when `dismissible` refused a dismissal made on purpose: Escape, an outside press, back or
   * a swipe. Focus or the window leaving is refused without it. Ask "Discard changes?" here.
   */
  onDismissAttempt?: (
    details: DismissAttemptDetails<Extract<Reason, DismissAttemptReason>>
  ) => void
}

/**
 * How a close is refused: `"attempt"` refuses it and tells `onDismissAttempt`
 * when someone tried on purpose, and `"silent"` refuses it without a word.
 */
type Refusal = "attempt" | "silent"

/** What a layer refuses beyond `dismissible`, like Dialog's closes while an action runs. */
type DismissRules = {
  /** How a close is refused, or undefined to leave it to `dismissible`. */
  refusal?: (reason: string) => Refusal | undefined
  /** Runs after `onDismissAttempt` heard a refused attempt, like a sheet nudging. */
  refused?: (reason: DismissAttemptReason) => void
}

/**
 * The dismissal policy of a layer, from its options and any rules of its own.
 * `allows(reason, event)` decides a close, and `sheet` is what its sheet
 * presentation takes.
 */
function createDismissal(
  options: () => {
    dismissible?: boolean
    onDismissAttempt?: (details: never) => void
  },
  rules: DismissRules = {}
) {
  const dismissible = () => options().dismissible !== false
  // Each layer lists its own reasons, and core reports only those.
  const attempt = (reason: DismissAttemptReason, event?: Event) =>
    (
      options().onDismissAttempt as
        ((details: DismissAttemptDetails) => void) | undefined
    )?.({
      reason,
      event,
    } as DismissAttemptDetails)
  return {
    allows(reason: string, event?: Event) {
      const refused =
        rules.refusal?.(reason) ??
        (isDismissal(reason) && !dismissible() ? "attempt" : undefined)
      if (!refused) {
        return true
      }
      // Focus or the window leaving isn't a try to dismiss it.
      if (
        refused === "attempt" &&
        reason !== "focus-out" &&
        reason !== "window-blur"
      ) {
        attempt(reason as DismissAttemptReason, event)
        rules.refused?.(reason as DismissAttemptReason)
      }
      return false
    },
    sheet: {
      dismissible,
      onDismissAttempt: (event?: Event) => attempt("swipe", event),
    },
  }
}

export { createDismissal, type DismissOptions, type DismissRules, type Refusal }
