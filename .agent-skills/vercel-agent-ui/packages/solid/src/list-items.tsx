import type { ListData, ListGroup, ListItem } from "@ui-sdk/core/select"
import type { JSX } from "@solidjs/web"
import { For, untrack } from "solid-js"

type Part = (props: any) => JSX.Element

// The parts a list renders its data with, which every list component has.
type ListParts = {
  Item: Part
  Group: Part
  GroupLabel: Part
  Separator: Part
}

// Renders a list's data with its parts: an option per item, groups with their
// labels, and separators. The `For` callback doesn't track, so an entry's
// fields are read in JSX, where a store entry changing in place, like its
// label or `disabled`, updates its own row.
function ListItems(props: {
  items: readonly ListData<any>[number][]
  parts: ListParts
}) {
  const { Item, Group, GroupLabel, Separator } = props.parts
  return (
    <For each={props.items}>
      {(entry) => {
        if (typeof entry === "string") {
          return <Item value={entry}>{entry}</Item>
        }
        // Rows are keyed by entry, so its kind is read once.
        const kind = untrack(() => ("type" in entry ? entry.type : undefined))
        if (kind === "separator") {
          return <Separator />
        }
        if (kind === "group") {
          const group = entry as ListGroup<any>
          return (
            <Group>
              {group.label && <GroupLabel>{group.label}</GroupLabel>}
              <ListItems items={group.items} parts={props.parts} />
            </Group>
          )
        }
        const item = entry as ListItem<any>
        return (
          <Item
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            keywords={item.keywords}
          >
            {item.label}
          </Item>
        )
      }}
    </For>
  )
}

export { ListItems, type ListParts }
