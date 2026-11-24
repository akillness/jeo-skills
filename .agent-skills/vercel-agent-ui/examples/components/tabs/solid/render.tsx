import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/solid/tabs"
import { For } from "solid-js"

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

function Example() {
  return (
    <Tabs defaultValue="inbox">
      <TabsList aria-label="Mail">
        <For each={folders}>
          {(folder) => (
            <TabsTab
              value={folder.value}
              render={(props) => (
                <button {...props}>
                  {props.children}
                  {folder.count > 0 && (
                    <span data-slot="badge">{folder.count}</span>
                  )}
                </button>
              )}
            >
              {folder.label}
            </TabsTab>
          )}
        </For>
      </TabsList>
      <For each={folders}>
        {(folder) => (
          <TabsPanel value={folder.value}>{folder.content}</TabsPanel>
        )}
      </For>
    </Tabs>
  )
}

export { Example }
