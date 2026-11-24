<script lang="ts">
  import { toggle } from "@ui-sdk/core/toggle"
  import type { Attachment } from "svelte/attachments"
  import { createParts } from "../../src/create-parts"
  import { Tabs, TabsList, TabsPanel, TabsTab } from "../../src/tabs"
  import { Toggle } from "../../src/toggle"

  // A render snippet's native handler, a refusing function binding set
  // after mount, and attachments on hand-written and generated parts.
  let {
    log,
    api = $bindable(),
  }: { log: (entry: string) => void; api?: { set: (value: string) => void } } =
    $props()
  let selected = $state<string>()
  api = { set: (value) => (selected = value) }
  const { Root: GeneratedToggle } = createParts(toggle, { root: "button" })
  const inspect: Attachment<HTMLElement> = (el) =>
    log(`attached:${el.textContent}`)
</script>

<Toggle
  onPressedChange={(next) => log(`change:${next}`)}
  onclick={(event: MouseEvent) => {
    log("user")
    event.preventDefault()
  }}
>
  {#snippet render({ props })}
    <button {...props}>Snippet</button>
  {/snippet}
</Toggle>

<Tabs
  defaultValue="a"
  bind:value={() => selected, (next) => log(`requested:${next}`)}
>
  <TabsList aria-label="Settings">
    <TabsTab value="a">Alpha</TabsTab>
    <TabsTab value="b">Beta</TabsTab>
  </TabsList>
  <TabsPanel value="a">A panel</TabsPanel>
  <TabsPanel value="b">B panel</TabsPanel>
</Tabs>

<Toggle {@attach inspect}>Written</Toggle>
<GeneratedToggle {@attach inspect}>Generated</GeneratedToggle>
