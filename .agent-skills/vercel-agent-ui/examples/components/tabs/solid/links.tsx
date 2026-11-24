import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/solid/tabs"
import { For } from "solid-js"

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
        <For each={pages}>
          {(page) => (
            <TabsTab
              value={page.value}
              render={(props) => <a {...props} href={page.href} />}
            >
              {page.label}
            </TabsTab>
          )}
        </For>
        <TabsIndicator />
      </TabsList>
      <For each={pages}>
        {(page) => <TabsPanel value={page.value}>{page.content}</TabsPanel>}
      </For>
    </Tabs>
  )
}

export { Example }
