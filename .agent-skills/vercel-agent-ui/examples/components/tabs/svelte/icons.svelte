<script lang="ts">
  import { ArchiveIcon, MailIcon, ReplyIcon } from "@lucide/svelte"
  import {
    Tabs,
    TabsList,
    TabsPanel,
    TabsTab,
    TabsTabIcon,
  } from "@ui-sdk/svelte/tabs"
</script>

<Tabs defaultValue="inbox">
  <TabsList aria-label="Mail">
    <TabsTab value="inbox">
      <TabsTabIcon>
        <MailIcon />
      </TabsTabIcon>
      Inbox
    </TabsTab>
    <TabsTab value="replies">
      <TabsTabIcon mirror>
        <ReplyIcon />
      </TabsTabIcon>
      Replies
    </TabsTab>
    <TabsTab value="archive">
      <TabsTabIcon>
        <ArchiveIcon />
      </TabsTabIcon>
      Archive
    </TabsTab>
  </TabsList>
  <TabsPanel value="inbox"
    >3 new messages from Inès Moreau and Kofi Mensah.</TabsPanel
  >
  <TabsPanel value="replies"
    >Wren Takahashi replied to your message about the launch.</TabsPanel
  >
  <TabsPanel value="archive"
    >Messages you archived stay here and in search.</TabsPanel
  >
</Tabs>
