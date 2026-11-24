import {
  tree as treePrimitive,
  type ListHighlightDetails,
  type TreeActionDetails,
  type TreeAnnouncement,
  type TreeCheckStrategy,
  type TreeCheckedChangeReason,
  type TreeController,
  type TreeExpandedChangeReason,
  type TreeItemData,
  type TreeMode,
  type TreeValueChangeReason,
} from "@ui-sdk/core/tree"
import type { ChangeDetails } from "@ui-sdk/core"
import { defineComponent, h, type PropType, type VNode } from "vue"
import { hasChild, slotContent } from "./children"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  provideProps,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"

// The parts inside an item take its `value` from it.
const parts = createParts(treePrimitive, {
  label: "span",
  indicator: "span",
  checkbox: "span",
  group: "div",
})

type Value = string | string[] | null

/**
 * A tree of items that expand and collapse, with one tab stop and arrow keys between its items.
 * @stable
 */
const Tree = withElement(
  "div",
  defineComponent({
    name: "Tree",
    inheritAttrs: false,
    props: {
      items: Array as PropType<TreeItemData[]>,
      paths: Array as PropType<string[]>,
      mode: String as PropType<TreeMode>,
      value: { type: null as unknown as PropType<Value>, default: undefined },
      modelValue: {
        type: null as unknown as PropType<Value>,
        default: undefined,
      },
      defaultValue: {
        type: null as unknown as PropType<Value>,
        default: undefined,
      },
      activation: String as PropType<"automatic" | "manual">,
      expanded: { type: Array as PropType<string[]>, default: undefined },
      defaultExpanded: {
        type: Array as PropType<string[]>,
        default: undefined,
      },
      expandOnPress: optionalBoolean,
      checkable: optionalBoolean,
      checked: { type: Array as PropType<string[]>, default: undefined },
      defaultChecked: { type: Array as PropType<string[]>, default: undefined },
      checkStrategy: String as PropType<TreeCheckStrategy>,
      // A function prop beside the emit, so a returned Promise marks the item pending.
      onAction: Function as PropType<
        (value: string, details: TreeActionDetails) => unknown
      >,
      pendingAnnouncement: String,
      loadChildren: Function as PropType<
        (
          value: string,
          details: { signal: AbortSignal }
        ) => void | Promise<unknown>
      >,
      current: { type: String as PropType<string | null>, default: undefined },
      disabled: optionalBoolean,
      focusableWhenDisabled: optionalBoolean,
      keepMounted: optionalBoolean,
      hiddenUntilFound: optionalBoolean,
      announcement: Function as PropType<
        (change: TreeAnnouncement) => string | null | undefined
      >,
      controller: Object as PropType<TreeController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: Value) => true,
      "update:modelValue": (_value: Value) => true,
      valueChange: (
        _value: Value,
        _details: ChangeDetails<TreeValueChangeReason>
      ) => true,
      "update:expanded": (_expanded: string[]) => true,
      expandedChange: (
        _expanded: string[],
        _details: ChangeDetails<TreeExpandedChangeReason>
      ) => true,
      "update:checked": (_checked: string[]) => true,
      checkedChange: (
        _checked: string[],
        _details: ChangeDetails<TreeCheckedChangeReason>
      ) => true,
      highlight: (_value: string, _details: ListHighlightDetails) => true,
    },
    slots: Object as PartSlots<typeof treePrimitive, "root">,
    setup(props, { slots, emit }) {
      const tree = usePrimitive(treePrimitive, () => ({
        ...props,
        value: orModel(props.value, props.modelValue),
        onValueChange: (
          value: Value,
          details: ChangeDetails<TreeValueChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onExpandedChange: (
          expanded: string[],
          details: ChangeDetails<TreeExpandedChangeReason>
        ) => {
          emit("expandedChange", expanded, details)
          if (!details.canceled) {
            emit("update:expanded", expanded)
          }
        },
        onCheckedChange: (
          checked: string[],
          details: ChangeDetails<TreeCheckedChangeReason>
        ) => {
          emit("checkedChange", checked, details)
          if (!details.canceled) {
            emit("update:checked", checked)
          }
        },
        onHighlight: (value: string, details: ListHighlightDetails) =>
          emit("highlight", value, details),
      }))
      return usePart(tree, "root", undefined, undefined, {
        tag: "div",
        // Without content, a data tree renders its items.
        children: (state) => {
          const data = tree.api.internal.items()
          return (
            slotContent(slots.default, { state }) ??
            (data && h(TreeItems, { items: data }))
          )
        },
      })
    },
  })
)

/**
 * An item. Put its text in a `TreeItemLabel` and its children in a
 * `TreeGroup`, which makes it a branch. Set `branch` for one whose children
 * load later, or whose group is inside a component of your own.
 * @stable
 */
const TreeItem = withElement(
  "div",
  defineComponent({
    name: "TreeItem",
    inheritAttrs: false,
    props: {
      value: { type: String, required: true },
      branch: optionalBoolean,
      disabled: optionalBoolean,
      label: String,
    },
    slots: Object as PartSlots<typeof treePrimitive, "item">,
    setup(props, { slots }) {
      // Its parent is the item it's inside, or null at the top.
      const parent = useScope(treePrimitive)?.around.item
      provideProps(treePrimitive, "item", () => ({ value: props.value }))
      const parentValue = () => {
        const value = parent?.().value
        return typeof value === "string" ? value : null
      }
      // Whether the item's content has a group, seen as it renders.
      let grouped: boolean | undefined
      let children: VNode[] | undefined
      const item = () => ({
        value: props.value,
        parent: parentValue(),
        branch: props.branch ?? grouped,
        disabled: props.disabled,
        label: props.label,
      })
      const part = usePart(treePrimitive, "item", item, undefined, {
        tag: "div",
        children: () => children,
      })
      return () => {
        children = slots.default?.({ state: part.state })
        grouped = hasChild(children, TreeGroup) || undefined
        return part()
      }
    },
  })
)

/**
 * The item's text, which names it. Render it as a link to make the item one.
 * @stable
 */
const TreeItemLabel = parts.Label
/**
 * The arrow that expands and collapses a branch. Alt or Option expands everything in it.
 * @stable
 */
const TreeItemIndicator = parts.Indicator
/**
 * The item's checkbox, with `checkable`. Screen readers hear the item's checked state instead.
 * @stable
 */
const TreeItemCheckbox = parts.Checkbox

/**
 * A branch's children. Rendered while the branch is expanded or animating closed.
 * @stable
 */
const TreeGroup = parts.Group

/**
 * Renders data items. Used by data trees, and available for custom layouts.
 * @stable
 */
const TreeItems = defineComponent({
  name: "TreeItems",
  props: {
    items: { type: Array as PropType<TreeItemData[]>, required: true },
  },
  setup(props) {
    // Only for the root's state, which tracks just the keys it reads.
    const root = usePart(useHandle(treePrimitive), "root").state
    // check-code: allow return-type recursive, so TypeScript cannot infer it.
    const render = (items: TreeItemData[]): VNode[] =>
      items.map((item) =>
        h(
          TreeItem,
          {
            key: item.value,
            value: item.value,
            branch: item.children !== undefined,
            disabled: item.disabled,
          },
          () => [
            root.checkable && h(TreeItemCheckbox),
            h(
              TreeItemLabel,
              { href: item.href },
              item.href
                ? {
                    render: ({ props }: { props: Record<string, unknown> }) =>
                      h("a", props, item.label),
                  }
                : () => item.label
            ),
            item.children && h(TreeGroup, null, () => render(item.children!)),
          ]
        )
      )
    return () => render(props.items)
  },
})

export {
  createTreeController,
  toggleTreeChecked,
  treeCheckedStates,
  treeFromPaths,
  visibleTreeRows,
} from "@ui-sdk/core/tree"

export {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemCheckbox,
  TreeItemIndicator,
  TreeItemLabel,
  TreeItems,
}

export type {
  ListHighlightDetails,
  TreeActionDetails,
  TreeAnnouncement,
  TreeApi,
  TreeChangeOptions,
  TreeCheckStrategy,
  TreeCheckedChangeReason,
  TreeCheckedState,
  TreeCollection,
  TreeCollectionNode,
  TreeController,
  TreeExpandedChangeReason,
  TreeGroupProps,
  TreeGroupState,
  TreeItemData,
  TreeItemPartProps,
  TreeItemProps,
  TreeItemState,
  TreeOptions,
  TreePrimitive,
  TreeState,
  TreeRow,
  TreeMode,
  TreeValue,
  TreeValueChangeReason,
} from "@ui-sdk/core/tree"
