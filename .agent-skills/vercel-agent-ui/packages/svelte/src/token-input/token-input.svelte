<!--
@component
A text field with atomic tokens. A TriggerMenu inside it suggests into
it. The `token` snippet renders each token's content.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    tokenInput as tokenInputPrimitive,
    type UndoStackOptions,
    type Token,
    type TokenCodec,
    type TokenDeletion,
    type TokenInputController,
    type TokenInputSubmitDetails,
    type TokenInputValue,
    type TokenInputValueChangeReason,
  } from "@ui-sdk/core/token-input"
  import { renderVersion } from "@ui-sdk/core/renderer"
  import {
    getAllContexts,
    mount,
    onDestroy,
    setContext,
    unmount,
    type Snippet,
  } from "svelte"
  import { EditorKey, type EditorContext } from "../editor-context"
  import { useFieldControl } from "../field/context"
  import { provideInstance } from "../instance"
  import { useHandlePart, usePrimitive } from "../use-primitive.svelte"
  import { TokenKey } from "./context"
  import TokenInputHost from "./token-input-host.svelte"

  type ValueDetails = ChangeDetails<TokenInputValueChangeReason> & {
    inputType?: string
    removed: Token[]
  }

  let {
    value = $bindable(),
    defaultValue,
    submitShortcut,
    tokenDeletion,
    copy,
    codec,
    getTokenDescription,
    history,
    disabled,
    readOnly,
    required,
    name,
    form,
    controller,
    debug,
    onSubmit,
    onValueChange,
    children,
    token,
  }: {
    /** The value. Bind it with `bind:value` to control the input. */
    value?: TokenInputValue
    /** The value at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: TokenInputValue
    /** Which keys submit: `"enter"`, with Shift+Enter for a new line, or `"mod+enter"`, with Enter for a new line. */
    submitShortcut?: "enter" | "mod+enter"
    /** How Backspace and Delete treat a token next to the caret: `"whole"`, `"select"` or `"revert"`. */
    tokenDeletion?: TokenDeletion
    /** What copying writes as plain text: `"codec"` keeps tokens through any app that pastes text, `"label"` writes what people read. */
    copy?: "codec" | "label"
    /** How tokens become text and back, for the clipboard and forms. */
    codec?: TokenCodec
    /** What a token says to screen readers besides its label, like its kind and status. */
    getTokenDescription?: (token: Token) => string
    /** Undo history: how many steps it keeps, and how long a typing pause starts a new step. */
    history?: UndoStackOptions
    /** Disables the input: it can't be focused or changed, and isn't submitted. */
    disabled?: boolean
    /** Keeps the input focusable and submitted, but stops changes. */
    readOnly?: boolean
    /** Blocks form submission while the input is empty. */
    required?: boolean
    /** The name the codec text submits under. Without one, the input submits nothing. */
    name?: string
    /** The id of a form to belong to, when the input isn't inside it. */
    form?: string
    /** Reads, edits and focuses the input from anywhere. Create one with `createTokenInputController()`. */
    controller?: TokenInputController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs on the submit shortcut. Without it, the shortcut submits the form the input is in. */
    onSubmit?: (
      value: TokenInputValue,
      details: TokenInputSubmitDetails
    ) => void
    /** Runs when typing, pasting, a menu, undo or a controller wants to change the value. `details.cancel()` stops it. */
    onValueChange?: (value: TokenInputValue, details: ValueDetails) => void
    children?: Snippet
    /** Renders a token's content, usually a TokenInputToken. Without it, tokens show their label. */
    token?: Snippet<[Token]>
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const input = usePrimitive(tokenInputPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    submitShortcut,
    tokenDeletion,
    copy,
    codec,
    getTokenDescription,
    history,
    disabled: disabled || field?.disabled(),
    readOnly,
    required,
    name: name ?? field?.name(),
    form,
    controller,
    debug,
    onSubmit,
    onValueChange: (next: TokenInputValue, details: ValueDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  provideInstance(tokenInputPrimitive, input)
  setContext<EditorContext>(EditorKey, () => input.api.editor)
  // Whether tokens get content from the snippet, which the editor's view
  // knows before it binds, since this runs at init.
  $effect.pre(() => input.api.internal.setCustom(!!token))

  // The hidden textarea that takes part in a form. Its attributes change
  // with the value, so reading them keeps the codec text current.
  const formInput = useHandlePart(input, "form-input")

  // Each token's content, mounted into the host the core keeps for it in the
  // editor. Svelte has no portal, so every host gets a component of its own,
  // with this component's contexts and the token's id. A root mounted from
  // an effect stays alive when the effect runs again; it leaves when its
  // host does, or with this component.
  const contexts = getAllContexts()
  const mounted = new Map<
    string,
    { host: Element; update: (token: Token) => void; destroy: () => void }
  >()
  const mountHost = (
    key: string,
    host: Element,
    first: Token,
    render: Snippet<[Token]>
  ) => {
    let current = $state.raw(first)
    const component = mount(TokenInputHost, {
      target: host,
      props: {
        get token() {
          return current
        },
        // The snippet as it is now, so a new one renders every token again.
        get render() {
          return token ?? render
        },
      },
      context: new Map<unknown, unknown>([...contexts, [TokenKey, key]]),
    })
    return {
      host,
      update: (next: Token) => (current = next),
      destroy: () => unmount(component),
    }
  }
  const sync = (render: Snippet<[Token]> | undefined) => {
    const seen = new Set<string>()
    if (render) {
      for (const {
        id: key,
        token: current,
        host,
      } of input.api.internal.hosts()) {
        seen.add(key)
        const entry = mounted.get(key)
        if (entry?.host === host) {
          entry.update(current)
          continue
        }
        entry?.destroy()
        mounted.set(key, mountHost(key, host, current, render))
      }
    }
    for (const [key, entry] of mounted) {
      if (!seen.has(key)) {
        entry.destroy()
        mounted.delete(key)
      }
    }
  }
  // Runs again when hosts come and go, and when tokens change.
  let version = $state(0)
  $effect(() =>
    input.instance.subscribe(() => (version = renderVersion(input.instance)))
  )
  $effect(() => {
    version
    sync(token)
  })
  onDestroy(() => sync(undefined))
</script>

{@render children?.()}
{#if formInput.attrs.name}
  {@const { value: text, ...attrs } = formInput.slot()}
  <textarea {...attrs}>{text}</textarea>
{/if}
