import {
  Comment,
  defineComponent,
  Fragment,
  inject,
  isVNode,
  onBeforeUnmount,
  onMounted,
  provide,
  shallowRef,
  type Component,
  type InjectionKey,
  type Slots,
  type VNode,
  type VNodeArrayChildren,
} from "vue"

const notLabelKey = Symbol.for("ui-sdk.not-label")

/**
 * Marks a part inside an item that isn't its label, like an icon, so
 * `learnLabels` skips its text. A pure call, so a page that never renders the
 * part still drops it, which a set of parts in the root couldn't do.
 */
function notLabel<Part extends object>(part: Part) {
  ;(part as Record<symbol, boolean>)[notLabelKey] = true
  return part
}

// Where a root's content part says it's there. `hasChild` can't see a part
// inside a component of the app's own, like a styled `SelectContent`, so the
// part tells its root when it mounts.
const placedKey: InjectionKey<(() => () => void) | null> =
  Symbol("ui-sdk.placed")

/**
 * For a root that renders its own content part when the app places none:
 * whether one is placed. Render the root's own part inside `NotPlaced`, so it
 * doesn't count.
 */
function usePlacedContent() {
  const count = shallowRef(0)
  provide(placedKey, () => {
    count.value++
    return () => count.value--
  })
  return () => count.value > 0
}

/** Called by a content part, so its root doesn't render one of its own as well. */
function usePlaceContent() {
  const register = inject(placedKey, null)
  if (!register) {
    return
  }
  let unregister: (() => void) | undefined
  onMounted(() => (unregister = register()))
  onBeforeUnmount(() => unregister?.())
}

/** Renders a root's own content part without counting it as placed. */
const NotPlaced = defineComponent({
  name: "NotPlaced",
  setup(_, { slots }) {
    provide(placedKey, null)
    return () => slots.default?.()
  },
})

// Whether a vnode of this component is among the children, at any depth the
// markup shows: inside fragments and wrapping elements too. A root that
// renders its own part when the app gives none checks here, so a part placed
// in the markup never renders a second one, not even for a frame.
function hasChild(children: unknown, type: Component) {
  if (!Array.isArray(children)) {
    return false
  }
  for (const child of children as VNodeArrayChildren) {
    if (
      Array.isArray(child)
        ? hasChild(child, type)
        : isVNode(child) &&
          (child.type === type || hasChild(child.children, type))
    ) {
      return true
    }
  }
  return false
}

/**
 * The labels of the items among `nodes` whose key is in `keys`, for a value
 * whose items haven't mounted, like on the server: an item's `label`, or else
 * its text, without hidden parts or parts of the components in `skip`, like
 * its indicator. An item is any component vnode with a `value` among `keys`,
 * so a component of your own that takes the value and the label as props
 * counts too. Components' default slots are rendered to look inside them, and a
 * slot that needs props it isn't given is passed over.
 */
function labelsAmong(
  nodes: VNodeArrayChildren,
  {
    keys,
    keyOf,
    skip,
  }: {
    keys: ReadonlySet<string>
    keyOf: (value: unknown) => string
    skip: ReadonlySet<unknown>
  }
) {
  const found: { value: unknown; label: string }[] = []
  const visit = (node: VNodeArrayChildren[number]) => {
    if (Array.isArray(node)) {
      return node.forEach(visit)
    }
    if (!isVNode(node)) {
      return
    }
    const { value, label } = (node.props ?? {}) as {
      value?: unknown
      label?: unknown
    }
    // An element, like an `<input>` with its own `value`, is never an item.
    if (
      value === undefined ||
      typeof node.type === "string" ||
      !keys.has(keyOf(value))
    ) {
      return childrenOf(node).forEach(visit)
    }
    const text =
      typeof label === "string" ? label : visibleText(childrenOf(node), skip)
    if (text) {
      found.push({ value, label: text })
    }
  }
  nodes.forEach(visit)
  return found
}

// A vnode's children: an element's, or what a component's default slot renders.
// check-code: allow return-type Array.isArray narrows the children to any[].
function childrenOf(node: VNode): VNodeArrayChildren {
  const { children } = node
  if (typeof children === "string") {
    return [children]
  }
  if (Array.isArray(children)) {
    return children
  }
  return slotNodes((children as Slots | null)?.default)
}

// What a slot renders, as a list, or nothing for one that needs props it isn't given.
// check-code: allow return-type Array.isArray narrows the nodes to any[].
function slotNodes(slot: Slots[string]): VNodeArrayChildren {
  try {
    const nodes: unknown = slot?.()
    return Array.isArray(nodes)
      ? nodes
      : nodes == null
        ? []
        : [nodes as VNodeArrayChildren[number]]
  } catch {
    return []
  }
}

// The text a user sees, with whitespace collapsed, as an item's label reads once it mounts.
function visibleText(nodes: VNodeArrayChildren, skip: ReadonlySet<unknown>) {
  // check-code: allow return-type recursive, so TypeScript cannot infer it.
  const text = (node: VNodeArrayChildren[number]): string => {
    if (typeof node === "string" || typeof node === "number") {
      return String(node)
    }
    if (Array.isArray(node)) {
      return node.map(text).join("")
    }
    if (
      !isVNode(node) ||
      node.type === Comment ||
      skip.has(node.type) ||
      (node.type as Record<symbol, boolean>)[notLabelKey] ||
      node.props?.["aria-hidden"]
    ) {
      return ""
    }
    return childrenOf(node).map(text).join("")
  }
  return nodes.map(text).join("").replace(/\s+/g, " ").trim()
}

/**
 * Tells a listbox the labels of its value from the items among the root's
 * `children`, so the server's markup and the render that hydrates it show the
 * label, not the value, before the items mount. The listbox looks while the
 * items aren't mounted, so a closed list follows a label that changes. Call it in the render, since a slot called in setup warns.
 */
function learnLabels(
  internal: {
    keyOf: (value: unknown) => string
    learnLabels: (
      find: (keys: ReadonlySet<string>) => { value: unknown; label: string }[]
    ) => void
  },
  children: VNodeArrayChildren,
  skip: ReadonlySet<unknown>
) {
  internal.learnLabels((keys) =>
    labelsAmong(children, { keys, keyOf: internal.keyOf, skip })
  )
}

// Whether nodes render anything, as Vue's `<slot>` decides before it shows its
// fallback: comments, like a `v-if` left out, and empty fragments don't. A
// fragment with no children at all, like `h(Fragment)` or JSX's `<></>`, has null.
// check-code: allow return-type recursive, so TypeScript cannot infer it.
function rendersSomething(nodes: VNodeArrayChildren): boolean {
  return nodes.some(
    (node) =>
      !isVNode(node) ||
      (node.type !== Comment &&
        (node.type !== Fragment ||
          (Array.isArray(node.children)
            ? rendersSomething(node.children)
            : !!node.children)))
  )
}

/**
 * What a slot renders, or undefined when it renders nothing, so the part shows
 * its own content in its place, the way Vue's `<slot>` shows its fallback.
 */
function slotContent<Props>(
  slot: ((props: Props) => VNode[]) | undefined,
  props: Props
) {
  const nodes = slot?.(props)
  return nodes && rendersSomething(nodes) ? nodes : undefined
}

export {
  hasChild,
  learnLabels,
  notLabel,
  NotPlaced,
  slotContent,
  usePlaceContent,
  usePlacedContent,
}
