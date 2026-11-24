<!--
@component
A native <textarea>, wired to the Field it's in, that can grow with its
text. Its text is its content, so it takes no children.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    textarea as textareaPrimitive,
    type InputValueChangeReason,
    type TextareaState,
    type TextareaSubmitDetails,
  } from "@ui-sdk/core/input"
  import type { Attachment } from "svelte/attachments"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import {
    controlProps,
    elementProps,
    type TextControlProps,
    type TextPartProps,
  } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
  } from "../use-primitive.svelte"

  let {
    value = $bindable(),
    defaultValue,
    autoResize,
    submitShortcut,
    onSubmit,
    disabled,
    readOnly,
    required,
    controller,
    debug,
    onValueChange,
    render,
    children: _children,
    ...rest
  }: TextPartProps<"textarea", TextareaState> &
    TextControlProps & {
      /**
       * Grows and shrinks with the text. Bound it with CSS `min-height` and
       * `max-height`; past the maximum, it scrolls.
       */
      autoResize?: boolean
      /** Which keys submit: `"enter"`, with Shift+Enter for a new line, or `"mod+enter"`, with Enter for a new line. */
      submitShortcut?: "enter" | "mod+enter"
      /** Runs on the submit shortcut. Without it, the shortcut submits the form the textarea is in. */
      onSubmit?: (value: string, details: TextareaSubmitDetails) => void
    } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const textarea = usePrimitive(textareaPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    autoResize,
    submitShortcut,
    onSubmit,
    controller,
    debug,
    onValueChange: (
      next: string,
      details: ChangeDetails<InputValueChangeReason>
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  // Controlled from the start, or once the parent sets it, like `bind:value` to a variable that starts empty.
  const controlled = $derived(textarea.controls("value"))
  const states = () => ({ disabled, readOnly, required })
  const root = useHandlePart(textarea, "root", () =>
    controlProps(states(), field, rest)
  )
  const control = field?.control(
    () => rest.id as string | undefined,
    () => rest["aria-describedby"]
  )
  const element = () => elementProps(states(), field, rest)
  const bound = wrapPart(root, control)
  // The text is the element's content: the server renders it, and the client
  // writes it as the value. An uncontrolled textarea renders its default,
  // never `value`: the core owns the text once bound, and an unbound `value`
  // goes back to undefined whenever the parent's props change, which would
  // empty the field. A form reset returns to the element's default, which
  // nothing else writes, so an uncontrolled textarea sets it here.
  const setDefault: Attachment<HTMLTextAreaElement> = (el) => {
    if (!controlled) {
      el.defaultValue = defaultValue ?? ""
    }
  }
</script>

{#snippet text()}{controlled ? value : defaultValue}{/snippet}

{#if render}
  <Part
    tag="textarea"
    part={bound}
    props={{ ...element(), render, children: text }}
  />
{:else}
  <!-- A static element, so the compiler renders the text as a textarea's content, without hydration markers. -->
  <textarea {...bound.slot(element())} {@attach setDefault}
    >{controlled ? value : defaultValue}</textarea
  >
{/if}
