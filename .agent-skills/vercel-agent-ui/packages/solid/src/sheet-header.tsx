import type { Primitive } from "@ui-sdk/core"
import { Portal, type JSX } from "@solidjs/web"
import { createContext, onCleanup, Show } from "solid-js"
import type { PrimitiveHandle } from "./use-primitive"

/**
 * Where an input renders while its popup presents as a sheet: in a header the
 * content renders at its top. The root keeps the header element, the content
 * renders it with `sheetHeader`, and the input renders into it with
 * `inSheetHeader`, so there's one input at a time.
 */
const SheetHeaderContext = createContext<
  [() => HTMLElement | null, (header: HTMLElement | null) => void]
>([() => null, () => {}])

/** The header at the top of a sheet's content, while the popup's `header` slot is present. */
function sheetHeader(
  popup: PrimitiveHandle<Primitive>,
  setHeader: (header: HTMLElement | null) => void
) {
  const header = popup.slot("header", undefined, { ref: setHeader })
  const element = () => {
    onCleanup(() => setHeader(null))
    return <div {...header} />
  }
  return <Show when={popup.present("header")}>{element()}</Show>
}

/**
 * Renders an input into the sheet's header while there is one. The input is
 * made again on each move, like in React, so its part binds the new element
 * and takes focus back where it lands.
 */
function inSheetHeader(
  element: () => JSX.Element,
  header: () => HTMLElement | null
) {
  return (
    <Show when={header()} keyed fallback={element()}>
      {(mount) => <Portal mount={mount}>{element()}</Portal>}
    </Show>
  )
}

export { inSheetHeader, sheetHeader, SheetHeaderContext }
