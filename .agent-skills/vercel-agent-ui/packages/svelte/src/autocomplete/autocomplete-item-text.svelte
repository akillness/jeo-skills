<!--
@component
The suggestion's text, with the part the field's text matched in `<mark>`.
Without text content, it shows the suggestion's label.
@stable
-->
<script lang="ts">
  import {
    autocomplete as autocompletePrimitive,
    type AutocompleteItemTextState,
  } from "@ui-sdk/core/autocomplete"
  import { getContext, untrack } from "svelte"
  import { createAttachmentKey, type Attachment } from "svelte/attachments"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let { children, ...rest }: PartProps<"span", AutocompleteItemTextState> =
    $props()

  const autocomplete = useHandle(autocompletePrimitive)
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error(
      "<AutocompleteItemText> must be used inside <AutocompleteItem>."
    )
  }
  // The text it marks, read from its content once it's in the page: a snippet
  // can't be read before it renders, as a Vue slot can. Until then, and on
  // the server, the content renders as it is. Content that holds elements
  // stays as it is, and the suggestion's label is what's marked.
  const key = $derived(item().key)
  // A reused item takes a new key, maybe while a search shows the marked text
  // in place of its content, so its text is read again.
  let text = $derived.by<string | undefined>(() => {
    void key
    return undefined
  })
  const part = useHandlePart(autocomplete, "item-text", () => ({
    id: item().key,
    text: text ?? item().label,
  }))
  // A reused item or a count in its label changes the content without a new
  // snippet, so only the page can tell.
  const searching = $derived(
    text !== undefined && part.state.segments.some((segment) => segment.match)
  )
  const learn: Attachment<HTMLElement> = (el) => {
    if (!children) {
      return
    }
    const read = () => {
      if (searching) {
        return
      }
      const nodes = [...el.childNodes]
      text = nodes.some((node) => node.nodeType === Node.ELEMENT_NODE)
        ? undefined
        : (el.textContent ?? "").replace(/\s+/g, " ").trim()
    }
    untrack(read)
    const observer = new MutationObserver(read)
    observer.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }
  const learnKey = createAttachmentKey()
</script>

{#snippet marked(state: AutocompleteItemTextState)}
  {#each state.segments as segment, index (index)}
    {#if segment.match}<mark>{segment.text}</mark>{:else}{segment.text}{/if}
  {/each}
{/snippet}

<Part
  tag="span"
  {part}
  props={{
    ...rest,
    children: children && !searching ? children : marked,
    [learnKey]: learn,
  }}
/>
