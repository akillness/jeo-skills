<script lang="ts">
  import {
    Tabs,
    TabsIndicator,
    TabsList,
    TabsPanel,
    TabsTab,
  } from "@ui-sdk/svelte/tabs"

  const pages = [
    {
      value: "overview",
      href: "#project-overview",
      label: "Overview",
      content:
        "Hollis Grant started this project in March. It has 14 open issues.",
    },
    {
      value: "activity",
      href: "#project-activity",
      label: "Activity",
      content:
        "Wren Takahashi merged 3 pull requests and closed 5 issues this week.",
    },
    {
      value: "members",
      href: "#project-members",
      label: "Members",
      content:
        "Hollis Grant owns the project. Wren Takahashi and 3 others can edit it.",
    },
  ]
</script>

<Tabs defaultValue="overview">
  <TabsList aria-label="Project">
    {#each pages as page (page.value)}
      <TabsTab value={page.value}>
        {#snippet render({ props, state, children })}
          <a {...props} href={page.href}>{@render children?.(state)}</a>
        {/snippet}
        {page.label}
      </TabsTab>
    {/each}
    <TabsIndicator />
  </TabsList>
  {#each pages as page (page.value)}
    <TabsPanel value={page.value}>{page.content}</TabsPanel>
  {/each}
</Tabs>
