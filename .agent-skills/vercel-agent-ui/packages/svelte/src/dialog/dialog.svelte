<!--
@component
A window over the page that asks for the user's attention. Put its trigger, backdrop and content inside.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    dialog as dialogPrimitive,
    type DialogController,
    type DialogDismissAttemptDetails,
    type DialogOpenChangeDetails,
    type DialogPayloadChangeReason,
  } from "@ui-sdk/core/dialog"
  import { setContext, type Snippet } from "svelte"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { DialogKey, type DialogContext } from "./context"

  let {
    open = $bindable(),
    defaultOpen,
    modal,
    closeOnOutsidePress,
    presentation,
    controller,
    dismissible,
    persistentElements,
    pendingAnnouncement,
    debug,
    container,
    onOpenChange,
    onOpenChangeComplete,
    onPayloadChange,
    onDismissAttempt,
    children,
  }: {
    /** Whether the dialog is open. Bind it with `bind:open` to control the dialog. */
    open?: boolean
    /** Whether the dialog starts open, when uncontrolled. Focus moves into it once it's on the page. */
    defaultOpen?: boolean
    /** `true`: the rest of the page is inert and doesn't scroll, focus is trapped, and an outside press only closes the dialog. `"trap-focus"`: traps focus, and leaves the page scrollable and clickable. `false`: a dialog beside the page, which Tab can leave and outside presses don't close. */
    modal?: boolean | "trap-focus"
    /** Whether pressing outside the dialog, like on its backdrop, closes it. The press counts once it's released outside too. */
    closeOnOutsidePress?: boolean
    /** How the dialog presents. `"sheet"` slides it up from the bottom of the screen, where it can be swiped away, and `"auto"` does that on small touch screens. */
    presentation?: "auto" | "dialog" | "sheet"
    /** Opens, closes and inspects the dialog from anywhere, and connects triggers outside it. Create one with `createDialogController()`. */
    controller?: DialogController<any, any>
    /** Whether Escape, an outside press, Android's back gesture and the screen reader's escape gesture can close the dialog. Close parts, triggers and the controller always can. */
    dismissible?: boolean
    /** Elements that stay usable while the dialog makes the page inert. Elements, CSS selectors, or a function that returns elements, read when the dialog opens. */
    persistentElements?: (Element | string)[] | (() => Element[])
    /** What screen readers hear once a Close part's action has been running for a second. Set it in the page's language. An empty string says nothing. */
    pendingAnnouncement?: string
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the popup into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the dialog wants to open or close. `details.reason` says why, `details.cancel()` stops it, and `details.returnValue` carries what closed it. */
    onOpenChange?: (open: boolean, details: DialogOpenChangeDetails) => void
    /** Runs once the dialog has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the payload the content shows changes. `details.cancel()` keeps the previous payload. */
    onPayloadChange?: (
      payload: unknown,
      details: ChangeDetails<DialogPayloadChangeReason>
    ) => void
    /** Runs when a dismissal was refused, because `dismissible` is false, an outside press doesn't close it, or a Close part's action is running. */
    onDismissAttempt?: (details: DialogDismissAttemptDetails) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  const handle = usePrimitive(dialogPrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    modal,
    closeOnOutsidePress,
    presentation,
    controller,
    dismissible,
    persistentElements,
    pendingAnnouncement,
    debug,
    onOpenChange: (next: boolean, details: DialogOpenChangeDetails) => {
      // The callback runs first, so canceling there also keeps a bound `open` as it was.
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    onPayloadChange,
    onDismissAttempt,
  }))
  const context: DialogContext = {
    handle,
    name: "Dialog",
    sheet: true,
    container: () => container,
  }
  useControllerEntry(() => controller, context)
  setContext(DialogKey, context)
</script>

{@render children?.()}
