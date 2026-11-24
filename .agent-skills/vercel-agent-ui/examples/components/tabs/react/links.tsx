"use client"

import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/react/tabs"

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

function Example() {
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Project">
        {pages.map((page) => (
          <TabsTab
            key={page.value}
            value={page.value}
            render={<a href={page.href} />}
          >
            {page.label}
          </TabsTab>
        ))}
        <TabsIndicator />
      </TabsList>
      {pages.map((page) => (
        <TabsPanel key={page.value} value={page.value}>
          {page.content}
        </TabsPanel>
      ))}
    </Tabs>
  )
}

export { Example }
