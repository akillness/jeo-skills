<!--
@component
The command's text, with the part the search matched in `<mark>`.
Without text content, it shows the command's label.
@stable
-->
<script lang="ts">
  import {
    command as commandPrimitive,
    type CommandItemTextState,
  } from "@ui-sdk/core/command"
  import { getContext, untrack } from "svelte"
  import { createAttachmentKey, type Attachment } from "svelte/attachments"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  let { children, ...rest }: PartProps<"span", CommandItemTextState> = $props()

  const command = useHandle(commandPrimitive)
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error("<CommandItemText> must be used inside <CommandItem>.")
  }
  // The text it marks, read from its content once it's in the page: a snippet
  // can't be read before it renders, as a Vue slot can. Until then, and on
  // the server, the content renders as it is. Content that holds elements
  // stays as it is, and the command's label is what's marked.
  const key = $derived(item().key)
  // A reused item takes a new key, maybe while a search shows the marked text
  // in place of its content, so its text is read again.
  let text = $derived.by<string | undefined>(() => {
    void key
    return undefined
  })
  const part = useHandlePart(command, "item-text", () => ({
    id: item().key,
    text: text ?? item().label ?? "",
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

{#snippet marked(state: CommandItemTextState)}
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
