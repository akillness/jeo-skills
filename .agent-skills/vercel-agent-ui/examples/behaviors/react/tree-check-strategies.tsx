import * as React from "react"
import {
  createTreeCollection,
  definePrimitive,
  toggleTreeChecked,
  treeCheckedStates,
  treeDataNodes,
  type TreeCheckStrategy,
  type TreeItemData,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

const items: TreeItemData[] = [
  {
    value: "photos",
    label: "Photos",
    children: [
      { value: "beach.jpg", label: "beach.jpg" },
      { value: "city.jpg", label: "city.jpg" },
      { value: "locked.jpg", label: "locked.jpg", disabled: true },
    ],
  },
  { value: "notes.txt", label: "notes.txt" },
]

const nodes = treeDataNodes(items)
const tree = createTreeCollection(nodes)
const itemOf = new Map(nodes.map((node) => [node.key, node.item]))

type BackupOptions = {
  strategy: TreeCheckStrategy
  onCheckedChange?: (checked: string[]) => void
}

type BackupState = { checked: string[]; strategy: TreeCheckStrategy }

const backup = definePrimitive({
  name: "backup",
  options: { strategy: "string", onCheckedChange: "callback" },
  state: (options: BackupOptions): BackupState => ({
    checked: [],
    strategy: options.strategy,
  }),
  sync: (options) => ({ strategy: options.strategy }),
  api: (context) => {
    const { store } = context
    return {
      toggle(key: string) {
        const { checked, strategy } = store.get()
        const next = toggleTreeChecked(tree, checked, key, {
          strategy,
          checkable: (node) => !itemOf.get(node)?.disabled,
        })
        store.set({ checked: next })
        context.options().onCheckedChange?.(next)
      },
    }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "group" }) }),
    item: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => {
        const checked = treeCheckedStates(
          tree,
          state.checked,
          state.strategy
        )(key)
        return {
          type: "button",
          role: "checkbox",
          "aria-checked":
            checked === "indeterminate" ? "mixed" : String(checked),
          "aria-disabled": itemOf.get(key)?.disabled ? "true" : undefined,
          style: `padding-inline-start:${(tree.level(key) - 1) * 20}px`,
        }
      },
      press: ({ api, key }) => api.toggle(key),
    }),
  }),
})

const parts = createParts(backup, { root: "div", item: "button" })

const Backup = parts.Root

const BackupItem = parts.Item

const strategies: TreeCheckStrategy[] = [
  "leaf",
  "trunk",
  "branch",
  "independent",
]

function Example() {
  const log = useLog()
  const [strategy, setStrategy] = React.useState<TreeCheckStrategy>("leaf")
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <div
          role="radiogroup"
          aria-label="Strategy"
          data-slot="tree-behavior-strategies"
        >
          {strategies.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={strategy === option}
              data-size="sm"
              onClick={() => setStrategy(option)}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <Backup
        strategy={strategy}
        aria-label="Backup"
        onCheckedChange={(checked: string[]) =>
          log(`Value: ${checked.join(", ") || "none"}`)
        }
      >
        {tree.keys().map((key) => (
          <BackupItem key={key} value={key} aria-label={itemOf.get(key)!.label}>
            <span data-slot="tree-behavior-checkbox">
              <span data-show="checked">✓</span>
              <span data-show="mixed">–</span>
            </span>
            {itemOf.get(key)!.label}
          </BackupItem>
        ))}
      </Backup>
    </div>
  )
}

export {
  backup,
  Backup,
  BackupItem,
  type BackupOptions,
  type BackupState,
  Example,
}
