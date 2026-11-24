import { getContext, setContext } from "svelte"
import type { Attachment } from "svelte/attachments"

/**
 * Where an input renders while its popup presents as a sheet: in a header the
 * content renders at its top. The root calls `provideSheetHeader()`, the
 * content attaches `useSheetHeader()` to the header it renders while the
 * popup's `header` part is present, and the input's part takes
 * `portalTo(useInSheetHeader())` as its portal, so there's one input at a time.
 */
const SheetHeaderKey = Symbol("sheet-header")

type SheetHeader = {
  /** The header's element while it's in the page. Reading it tracks it. */
  readonly element: HTMLElement | null
  /** Records the header's element while it's in the page. */
  record: Attachment<HTMLElement>
}

/** Call in the root's script. */
function provideSheetHeader() {
  let element = $state.raw<HTMLElement | null>(null)
  setContext<SheetHeader>(SheetHeaderKey, {
    get element() {
      return element
    },
    record: (el) => {
      element = el
      return () => {
        if (element === el) {
          element = null
        }
      }
    },
  })
}

/** Call in the content's script. The attachment for the header's element. */
function useSheetHeader() {
  return (
    getContext<SheetHeader | undefined>(SheetHeaderKey)?.record ?? (() => {})
  )
}

/**
 * Call in the input's script, for its part's `portal`: the sheet's header
 * while there is one, else `false` to stay in place. The part binds the
 * input again where it lands, as Vue and React render it again, which is
 * when the core gives it focus back.
 */
function useInSheetHeader() {
  const header = getContext<SheetHeader | undefined>(SheetHeaderKey)
  return () => header?.element ?? false
}

export { provideSheetHeader, useInSheetHeader, useSheetHeader }
