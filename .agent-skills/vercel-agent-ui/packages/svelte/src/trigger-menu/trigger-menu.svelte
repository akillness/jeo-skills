<!--
@component
Suggestions opened by a trigger like `@` or `/` in text. Inside a
TokenInput it uses that editor; otherwise render a TriggerMenuInput, or
pass `editor`.
@stable
-->
<script lang="ts">
  import type { ChangeDetails, DismissAttemptDetails } from "@ui-sdk/core"
  import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
  import {
    triggerMenu as triggerMenuPrimitive,
    type TextEditorAdapter,
    type TokenInsert,
    type TriggerDefinition,
    type TriggerMenuController,
    type TriggerMenuDismissReason,
    type TriggerMenuOpenChangeReason,
    type TriggerMenuQueryChangeReason,
    type TriggerMenuSelectDetails,
  } from "@ui-sdk/core/trigger-menu"
  import { getContext, setContext, type Snippet } from "svelte"
  import { EditorKey, type EditorContext } from "../editor-context"
  import { provideInstance } from "../instance"
  import { useOwnPart } from "../own-part.svelte"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { ContainerKey, OwnContentKey } from "./context"
  import TriggerMenuContent from "./trigger-menu-content.svelte"

  type OpenDetails = ChangeDetails<TriggerMenuOpenChangeReason> & {
    trigger: string | null
  }
  type QueryDetails = ChangeDetails<TriggerMenuQueryChangeReason> & {
    trigger: string
    argument?: string
  }

  let {
    triggers,
    editor,
    open = $bindable(),
    status,
    autoHighlight,
    loop,
    shortcut,
    controller,
    dismissible,
    debug,
    container,
    onSelect,
    pendingAnnouncement,
    onOpenChange,
    onOpenChangeComplete,
    onQueryChange,
    onDismissAttempt,
    children,
  }: {
    /** The texts that open the menu, and what each one lists. */
    triggers: TriggerDefinition<any>[]
    /** The editor the menu reads and writes, for editors without a part of their own. TriggerMenuInput and a surrounding TokenInput set it for you. */
    editor?: TextEditorAdapter
    /** Whether the menu is open. Bind it with `bind:open` to control it; it shows only while there's a match. */
    open?: boolean
    /** Whether items that come from outside are loading or failed, for the status and empty parts. */
    status?: AsyncOptionsStatus
    /** Whether the first match is highlighted so Enter and Tab choose it. */
    autoHighlight?: boolean
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** Reopens a match dismissed with Escape, with the caret in it. */
    shortcut?: string
    /** Opens, closes and inserts from anywhere. Create one with `createTriggerMenuController()`. */
    controller?: TriggerMenuController
    /** Whether Escape, an outside press, focus or the window leaving and the screen reader's escape gesture can close the menu. Choosing an item, moving the caret out of the match and the controller always can. */
    dismissible?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the list into this element instead of in place. */
    container?: PopupContainer
    /** Runs when an item, with every required argument, is chosen. Return a Promise and a pending token is inserted at once. */
    onSelect?: (
      value: any,
      details: TriggerMenuSelectDetails<any>
    ) => void | Promise<void | Partial<TokenInsert>>
    /** What screen readers hear once an `onSelect` Promise has been pending for a second. An empty string says nothing. */
    pendingAnnouncement?: string
    /** Runs when the menu wants to open or close. `details.trigger` says which trigger, and `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the menu has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the text after the trigger changes. `details.argument` names the argument being typed. */
    onQueryChange?: (query: string, details: QueryDetails) => void
    /** Runs when `dismissible` refused a dismissal made on purpose: Escape, an outside press or the screen reader's escape. Focus or the window leaving is refused without it. */
    onDismissAttempt?: (
      details: DismissAttemptDetails<TriggerMenuDismissReason>
    ) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  const inherited = getContext<EditorContext | undefined>(EditorKey)
  setContext(ContainerKey, () => container)
  const menu = usePrimitive(triggerMenuPrimitive, () => ({
    id,
    triggers,
    editor: editor ?? inherited?.(),
    get open() {
      return open
    },
    status,
    autoHighlight,
    loop,
    shortcut,
    controller,
    dismissible,
    debug,
    onSelect,
    pendingAnnouncement,
    onOpenChange: (next: boolean, details: OpenDetails) => {
      // The callback runs first, so canceling there also keeps a bound `open` as it was.
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    onQueryChange,
    onDismissAttempt,
  }))
  useControllerEntry(() => controller, menu)
  provideInstance(triggerMenuPrimitive, menu)
  // The menu renders its list, unless a TriggerMenuContent is among the children.
  const own = useOwnPart(OwnContentKey)
</script>

{@render children?.()}
{#if !own()}<TriggerMenuContent fromRoot />{/if}
