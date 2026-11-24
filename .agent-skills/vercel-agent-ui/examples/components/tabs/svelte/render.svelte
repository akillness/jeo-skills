<script lang="ts">
  import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/svelte/tabs"

  const folders = [
    {
      value: "inbox",
      label: "Inbox",
      count: 12,
      content: "12 conversations, 3 of them unread.",
    },
    {
      value: "unread",
      label: "Unread",
      count: 3,
      content: "Hollis Grant, Inès Moreau and Kofi Mensah wrote to you.",
    },
    {
      value: "archived",
      label: "Archived",
      count: 0,
      content: "Nothing archived yet. Archived mail stays searchable.",
    },
  ]
</script>

<Tabs defaultValue="inbox">
  <TabsList aria-label="Mail">
    {#each folders as folder (folder.value)}
      <TabsTab value={folder.value}>
        {#snippet render({ props, state, children })}
          <button {...props}>
            {@render children?.(state)}
            {#if folder.count > 0}
              <span data-slot="badge">{folder.count}</span>
            {/if}
          </button>
        {/snippet}
        {folder.label}
      </TabsTab>
    {/each}
  </TabsList>
  {#each folders as folder (folder.value)}
    <TabsPanel value={folder.value}>{folder.content}</TabsPanel>
  {/each}
</Tabs>
