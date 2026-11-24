import type { ListData } from "@ui-sdk/core/select"
import type * as React from "react"

type Part = React.ComponentType<any>

// The parts a list renders its data with, which every list component has.
type ListParts = {
  Item: Part
  Group: Part
  GroupLabel: Part
  Separator: Part
}

// Renders a list's data with its parts: an option per item, groups with their
// labels, and separators. Keyed by each item's key, and each group by its
// label, so a filtered list keeps its options.
function ListItems({
  items,
  parts,
  keyOf,
}: {
  items: readonly ListData<any>[number][]
  parts: ListParts
  keyOf: (value: unknown) => string
}) {
  const { Item, Group, GroupLabel, Separator } = parts
  return items.map((entry, index) => {
    if (typeof entry === "string") {
      return (
        <Item key={entry} value={entry}>
          {entry}
        </Item>
      )
    }
    if ("type" in entry && entry.type === "separator") {
      return <Separator key={`separator-${index}`} />
    }
    if ("type" in entry && entry.type === "group") {
      return (
        <Group key={`group-${entry.label ?? index}`}>
          {entry.label && <GroupLabel>{entry.label}</GroupLabel>}
          <ListItems items={entry.items} parts={parts} keyOf={keyOf} />
        </Group>
      )
    }
    const { value, label, disabled, keywords } = entry as {
      value: unknown
      label: string
      disabled?: boolean
      keywords?: string[]
    }
    return (
      <Item
        key={keyOf(value)}
        value={value}
        label={label}
        disabled={disabled}
        {...(keywords && { keywords })}
      >
        {label}
      </Item>
    )
  })
}

export { ListItems, type ListParts }
