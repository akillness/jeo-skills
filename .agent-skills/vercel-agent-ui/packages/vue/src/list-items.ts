import type { ListData } from "@ui-sdk/core/select"
import {
  defineComponent,
  Fragment,
  h,
  type Component,
  type PropType,
  type VNode,
} from "vue"

// The parts a list renders its data with, which every list component has.
type ListParts = {
  Item: Component
  Group: Component
  GroupLabel: Component
  Separator: Component
}

// Renders a list's data with its parts: an option per item, groups with their
// labels, and separators. Keyed by each item's key, and each group by its
// label and how many groups before it share that label, so a filtered list
// keeps its options.
const ListItems = defineComponent({
  name: "ListItems",
  props: {
    items: {
      type: Array as PropType<readonly ListData<any>[number][]>,
      required: true,
    },
    parts: { type: Object as PropType<ListParts>, required: true },
    keyOf: {
      type: Function as PropType<(value: unknown) => string>,
      required: true,
    },
  },
  setup(props) {
    // check-code: allow return-type recursive, so TypeScript cannot infer it.
    const render = (items: readonly ListData<any>[number][]): VNode[] => {
      const groupsByLabel = new Map<string, number>()
      return items.map((entry, index) => {
        const { Item, Group, GroupLabel, Separator } = props.parts
        if (typeof entry === "string") {
          return h(Item, { key: entry, value: entry }, () => entry)
        }
        if ("type" in entry && entry.type === "separator") {
          return h(Separator, { key: `separator-${index}` })
        }
        if ("type" in entry && entry.type === "group") {
          const label = entry.label ?? ""
          const before = groupsByLabel.get(label) ?? 0
          groupsByLabel.set(label, before + 1)
          return h(Group, { key: `group-${label}-${before}` }, () => [
            entry.label && h(GroupLabel, null, () => entry.label),
            ...render(entry.items),
          ])
        }
        const { value, label, disabled, keywords } = entry as {
          value: unknown
          label: string
          disabled?: boolean
          keywords?: string[]
        }
        return h(
          Item,
          {
            key: props.keyOf(value),
            value,
            label,
            disabled,
            ...(keywords && { keywords }),
          },
          () => label
        )
      })
    }
    return () => h(Fragment, render(props.items))
  },
})

export { ListItems, type ListParts }
