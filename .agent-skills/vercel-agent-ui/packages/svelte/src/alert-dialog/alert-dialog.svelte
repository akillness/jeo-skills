<!--
@component
A modal dialog that interrupts the user with something important and waits for an answer.
It takes none of the props only Dialog has, like `modal`: an alert dialog
is always modal and never a sheet.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import type {
    AlertDialogController,
    AlertDialogOpenChangeReason,
    AlertDialogPayloadChangeReason,
    dialog as dialogPrimitive,
    DialogController,
    DialogDismissAttemptDetails,
    DialogOpenChangeDetails,
  } from "@ui-sdk/core/dialog"
  // From its own module, so an app with only alert dialogs doesn't carry Dialog's presentation.
  import { alertDialog as alertDialogPrimitive } from "@ui-sdk/core/alert-dialog"
  import { setContext, type Snippet } from "svelte"
  import { DialogKey, type DialogContext } from "../dialog/context"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"

  type OpenDetails = DialogOpenChangeDetails<AlertDialogOpenChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
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
    /** Whether the alert dialog is open. Bind it with `bind:open` to control the alert dialog. */
    open?: boolean
    /** Whether the alert dialog starts open, when uncontrolled. Focus moves into it once it's on the page. */
    defaultOpen?: boolean
    /** Opens, closes and inspects the alert dialog from anywhere. Create one with `createAlertDialogController()` or `createConfirm()`. */
    controller?: AlertDialogController<any, any>
    /** Whether Escape, Android's back gesture and the screen reader's escape gesture can close the alert dialog. Close parts, triggers and the controller always can. */
    dismissible?: boolean
    /** Elements that stay usable while the alert dialog makes the page inert. Elements, CSS selectors, or a function that returns elements, read when it opens. */
    persistentElements?: (Element | string)[] | (() => Element[])
    /** What screen readers hear once a Close part's action has been running for a second. Set it in the page's language. An empty string says nothing. */
    pendingAnnouncement?: string
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the popup into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the alert dialog wants to open or close. `details.reason` says why, `details.cancel()` stops it, and `details.returnValue` is the `value` of the Close part that closed it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the alert dialog has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when a trigger or a controller with another payload opens the alert dialog, before `onOpenChange`. `details.cancel()` keeps the previous payload. */
    onPayloadChange?: (
      payload: unknown,
      details: ChangeDetails<AlertDialogPayloadChangeReason>
    ) => void
    /** Runs when a dismissal was refused, because `dismissible` is false or a Close part's action is running. */
    onDismissAttempt?: (details: DialogDismissAttemptDetails) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  // The alert dialog's slots and state are the dialog's, so the parts bind to it as one.
  const handle = usePrimitive(
    alertDialogPrimitive as unknown as typeof dialogPrimitive,
    () => ({
      id,
      get open() {
        return open
      },
      defaultOpen,
      // Its reasons are a subset of the dialog's, which the shared primitive type names.
      controller: controller as DialogController<any, any> | undefined,
      dismissible,
      persistentElements,
      pendingAnnouncement,
      debug,
      onOpenChange: (next: boolean, details: DialogOpenChangeDetails) => {
        // The callback runs first, so canceling there also keeps a bound `open` as it was.
        onOpenChange?.(next, details as OpenDetails)
        if (!details.canceled) {
          open = next
        }
      },
      onOpenChangeComplete,
      onPayloadChange,
      onDismissAttempt,
    })
  )
  const context: DialogContext = {
    handle,
    name: "AlertDialog",
    sheet: false,
    container: () => container,
  }
  useControllerEntry(() => controller, context)
  setContext(DialogKey, context)
</script>

{@render children?.()}
