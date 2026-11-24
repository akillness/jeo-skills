<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "../../src/dialog"
  import { Tabs, TabsList, TabsPanel, TabsTab } from "../../src/tabs"
  import { Toolbar, ToolbarLink } from "../../src/toolbar"

  let tabId = $state("account")

  export function renameTab(id: string) {
    tabId = id
  }
</script>

<Dialog defaultOpen modal={false}>
  <DialogTrigger id="mine">Edit</DialogTrigger>
  <DialogContent id="sheet">
    <DialogTitle id="heading">Profile</DialogTitle>
    <DialogDescription id="hint">Change it.</DialogDescription>
  </DialogContent>
</Dialog>

<Tabs defaultValue="a">
  <TabsList aria-label="Settings">
    <TabsTab value="a" id={tabId}>Account</TabsTab>
  </TabsList>
  <TabsPanel value="a">A</TabsPanel>
</Tabs>

<Toolbar aria-label="Formatting">
  <ToolbarLink id="docs" href="#docs">Docs</ToolbarLink>
</Toolbar>
