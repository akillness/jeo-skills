<!--
@component
The editable text. The core owns its content, so it takes no children;
style it, and show the placeholder with `data-empty`.
@stable
-->
<script lang="ts">
  import {
    tokenInput,
    type TokenInputEditorProps,
    type TokenInputEditorState,
  } from "@ui-sdk/core/token-input"
  import { renderStaticHtml } from "@ui-sdk/core/renderer"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import {
    useHandlePart,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    placeholder,
    children: _children,
    ...rest
  }: PartProps<"div", TokenInputEditorState> & TokenInputEditorProps = $props()

  const input = useHandle(tokenInput)
  const field = useFieldControl()
  const editor = useHandlePart(input, "editor", () => ({ placeholder }))
  const control = field?.control(
    () => rest.id as string | undefined,
    () => rest["aria-describedby"]
  )
  // The first value as markup, so a server render shows it. Svelte never
  // touches it again: the core owns the content once it binds, and takes
  // the anchor Svelte left with the rest.
  const html = renderStaticHtml(
    input.api.getValue(),
    input.api.internal.describe
  )
</script>

{#snippet content()}{@html html}{/snippet}

<Part
  tag="div"
  part={wrapPart(editor, control)}
  props={{ ...rest, children: content }}
/>
