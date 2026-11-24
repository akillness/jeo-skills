<script lang="ts">
  import { Tabs, TabsList, TabsPanel, TabsTab } from "../../src/tabs"

  // A bound value that starts empty, with a way for the test to set and read it.
  let {
    api = $bindable(),
  }: { api?: { set: (value: string) => void; get: () => unknown } } = $props()
  let selected = $state<string | undefined>()
  api = { set: (value) => (selected = value), get: () => selected }
</script>

<Tabs bind:value={selected} defaultValue="a">
  <TabsList aria-label="Settings">
    <TabsTab value="a">Alpha</TabsTab>
    <TabsTab value="b">Beta</TabsTab>
  </TabsList>
  <TabsPanel value="a">A panel</TabsPanel>
  <TabsPanel value="b">B panel</TabsPanel>
</Tabs>
