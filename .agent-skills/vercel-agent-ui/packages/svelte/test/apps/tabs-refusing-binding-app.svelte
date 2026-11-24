<script lang="ts">
  import { Tabs, TabsList, TabsPanel, TabsTab } from "../../src/tabs"

  // A function binding that starts empty and saves a change only until the
  // test tells it to refuse, with a way for the test to read it.
  let {
    api = $bindable(),
  }: { api?: { refuse: () => void; get: () => unknown } } = $props()
  let selected = $state<string | null>()
  let accepts = true
  api = { refuse: () => (accepts = false), get: () => selected }
</script>

<Tabs
  defaultValue="a"
  bind:value={() => selected, (next) => accepts && (selected = next)}
>
  <TabsList aria-label="Settings">
    <TabsTab value="a">Alpha</TabsTab>
    <TabsTab value="b">Beta</TabsTab>
  </TabsList>
  <TabsPanel value="a">A panel</TabsPanel>
  <TabsPanel value="b">B panel</TabsPanel>
</Tabs>
