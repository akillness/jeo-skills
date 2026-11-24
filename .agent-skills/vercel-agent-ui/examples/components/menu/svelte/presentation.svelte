<script lang="ts">
  import {
    ChevronRightIcon,
    DownloadIcon,
    LinkIcon,
    ShareIcon,
    TrashIcon,
  } from "@lucide/svelte"
  import {
    Menu,
    MenuContent,
    MenuItem,
    MenuSeparator,
    MenuSub,
    MenuSubContent,
    MenuSubTrigger,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Menu presentation="sheet" onAction={(value) => log(`Chose ${value}`)}>
  <MenuTrigger>Options</MenuTrigger>
  <MenuContent>
    <MenuItem value="share">
      <ShareIcon />
      Share
    </MenuItem>
    <MenuItem value="copy-link">
      <LinkIcon />
      Copy link
    </MenuItem>
    <MenuSub>
      <MenuSubTrigger>
        <DownloadIcon />
        Move to
        <ChevronRightIcon aria-hidden="true" />
      </MenuSubTrigger>
      <MenuSubContent>
        <MenuItem value="inbox">Inbox</MenuItem>
        <MenuItem value="archive">Archive</MenuItem>
      </MenuSubContent>
    </MenuSub>
    <MenuSeparator />
    <MenuItem value="delete" destructive>
      <TrashIcon aria-hidden="true" />
      Delete
    </MenuItem>
  </MenuContent>
</Menu>
