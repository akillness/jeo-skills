<script lang="ts">
  import {
    Tabs,
    TabsIndicator,
    TabsList,
    TabsPanel,
    TabsTab,
  } from "../../src/tabs"

  let { defaultValue }: { defaultValue?: string } = $props()
</script>

<Tabs {defaultValue}>
  <TabsList aria-label="Settings">
    <TabsTab value="a">A</TabsTab>
    <TabsTab value="b">B</TabsTab>
    <TabsIndicator />
  </TabsList>
  <TabsPanel value="a">Panel A</TabsPanel>
  <TabsPanel value="b">Panel B</TabsPanel>
</Tabs>
