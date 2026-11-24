<script lang="ts">
  import {
    Tabs,
    TabsIndicator,
    TabsList,
    TabsPanel,
    TabsTab,
    createTabsController,
  } from "@ui-sdk/svelte/tabs"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const tabs = createTabsController()
  let value = $state<string | null>("inbox")
</script>

<div>
  <div data-slot="controls">
    <button type="button" onclick={() => tabs.select("sent")}
      >Show Sent Mail</button
    >
  </div>
  <Tabs
    bind:value
    onValueChange={(next, details) => log(`value: ${next} (${details.reason})`)}
    controller={tabs}
  >
    <TabsList aria-label="Mail">
      <TabsTab value="inbox">Inbox</TabsTab>
      <TabsTab value="drafts">Drafts</TabsTab>
      <TabsTab value="sent">Sent</TabsTab>
      <TabsIndicator />
    </TabsList>
    <TabsPanel value="inbox"
      >3 unread messages from Hollis Grant and Inès Moreau.</TabsPanel
    >
    <TabsPanel value="drafts"
      >2 drafts, the last one edited yesterday at 4:12 PM.</TabsPanel
    >
    <TabsPanel value="sent"
      >12 messages sent this week, all delivered.</TabsPanel
    >
  </Tabs>
</div>
