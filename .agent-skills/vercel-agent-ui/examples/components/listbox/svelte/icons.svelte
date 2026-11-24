<script lang="ts">
  import {
    ArchiveIcon,
    ArrowRightIcon,
    MailIcon,
    PencilIcon,
    StarIcon,
  } from "@lucide/svelte"
  import { Listbox, ListboxItem, ListboxItemIcon } from "@ui-sdk/svelte/listbox"

  const views = [
    { value: "inbox", label: "Inbox", icon: MailIcon },
    { value: "starred", label: "Starred", icon: StarIcon },
    { value: "drafts", label: "Drafts", icon: PencilIcon },
    { value: "archive", label: "Archive", icon: ArchiveIcon },
    { value: "next", label: "Next page", icon: ArrowRightIcon },
  ]
</script>

<Listbox defaultValue="inbox" aria-label="Mailbox">
  {#each views as view (view.value)}
    <ListboxItem value={view.value}>
      <ListboxItemIcon mirror={view.icon === ArrowRightIcon}>
        <view.icon />
      </ListboxItemIcon>
      {view.label}
    </ListboxItem>
  {/each}
</Listbox>
