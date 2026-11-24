// A data component renders a part itself, like a data select's list, unless
// the app renders one among its children. A part counts while it's on the
// page, so one removed from an `{#if}` hands rendering back to the root.
import { getContext, onDestroy, setContext, untrack } from "svelte"

type Claim = () => () => void

/** For a data root: whether its children render the part under `key`. Reading it tracks it. */
function useOwnPart(key: symbol) {
  let owners = $state(0)
  setContext<Claim>(key, () => {
    owners++
    return () => owners--
  })
  return () => owners > 0
}

/** For the part: tells the root around it that the app renders it, until it leaves the page. */
function claimOwnPart(key: symbol) {
  // Untracked, so the root's block that renders this part doesn't depend on the count.
  const release = untrack(() => getContext<Claim | undefined>(key)?.())
  if (release) {
    onDestroy(release)
  }
}

export { claimOwnPart, useOwnPart }
