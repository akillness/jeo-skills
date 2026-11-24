import * as React from "react"

// Whether an element of this type is among the children, at any depth the
// markup shows: inside fragments and wrapping elements too. A root that
// renders its own part when the app gives none checks here, so a part placed
// in the markup never renders a second one, not even for a frame.
function hasChild(children: React.ReactNode, type: React.ElementType) {
  for (const child of React.Children.toArray(children)) {
    if (
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      (child.type === type || hasChild(child.props.children, type))
    ) {
      return true
    }
  }
  return false
}

// Where a root's content part says it's there. `hasChild` can't see a part
// inside a component of the app's own, like a styled `SelectContent`, so the
// part tells its root when it mounts, before the page paints.
const PlacedContext = React.createContext<(() => () => void) | null>(null)

/**
 * For a root that renders its own content part when the app places none:
 * whether one is placed, and the value of the provider its children go in.
 * Its own part goes in `<Placed value={null}>`, so it doesn't count. `wanted`
 * is whether the root would render its own part now. Placed parts always
 * count, so a root that gets its items later already knows about them, but
 * only one it renders a part for renders again when they mount or leave.
 */
function usePlacedContent(wanted: boolean) {
  const placed = React.useRef(0)
  const rendersOwn = React.useRef(wanted)
  const [, rerender] = React.useReducer((count: number) => count + 1, 0)
  const seen = placed.current > 0
  // Children's effects run first, so this sees parts placed or removed in the
  // same commit, whose own calls still read the last commit's `rendersOwn`.
  React.useLayoutEffect(() => {
    rendersOwn.current = wanted
    if (wanted && placed.current > 0 !== seen) {
      rerender()
    }
  })
  const register = React.useCallback(() => {
    placed.current += 1
    if (rendersOwn.current) {
      rerender()
    }
    return () => {
      placed.current -= 1
      if (rendersOwn.current && !placed.current) {
        rerender()
      }
    }
  }, [])
  return [seen, register] as const
}

const Placed = PlacedContext.Provider

/** Called by a content part, so its root doesn't render one of its own as well. */
function usePlaceContent() {
  const register = React.useContext(PlacedContext)
  React.useLayoutEffect(() => register?.(), [register])
}

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

/**
 * Tells a listbox the labels of its value from the items among `children`,
 * so the server's markup and the render that hydrates it show the label, not
 * the value, before the items mount. The listbox looks while the items aren't
 * mounted, so a closed list follows a label that changes. An item is any component element with a selected `value`, so a
 * component of your own that takes the value and the label as props counts
 * too: its `label`, or else its text, without hidden parts, parts of the
 * types in `skip`, like its indicator, or parts marked with `notLabel`. Items a component renders from
 * elsewhere, like its own list, aren't found.
 */
function learnLabels(
  internal: {
    keyOf: (value: unknown) => string
    learnLabels: (
      find: (keys: ReadonlySet<string>) => { value: unknown; label: string }[]
    ) => void
  },
  children: React.ReactNode,
  skip: ReadonlySet<unknown>
) {
  internal.learnLabels((keys) => {
    const found: { value: unknown; label: string }[] = []
    // check-code: allow return-type recursive, so TypeScript cannot infer it.
    const text = (node: React.ReactNode): string =>
      typeof node === "string" || typeof node === "number"
        ? String(node)
        : Array.isArray(node)
          ? node.map(text).join("")
          : React.isValidElement<Record<string, unknown>>(node) &&
              !skip.has(node.type) &&
              !(node.type as unknown as Record<symbol, boolean>)[notLabelKey] &&
              !node.props["aria-hidden"]
            ? text(node.props.children as React.ReactNode)
            : ""
    const visit = (node: React.ReactNode) => {
      if (Array.isArray(node)) {
        return node.forEach(visit)
      }
      if (!React.isValidElement<Record<string, unknown>>(node)) {
        return
      }
      const { value, label, children } = node.props
      // An element, like an `<input>` with its own `value`, is never an item.
      if (
        value === undefined ||
        typeof node.type === "string" ||
        !keys.has(internal.keyOf(value))
      ) {
        return visit(children as React.ReactNode)
      }
      // Whitespace collapsed, as an item's label reads once it mounts.
      const shown =
        typeof label === "string"
          ? label
          : text(children as React.ReactNode)
              .replace(/\s+/g, " ")
              .trim()
      if (shown) {
        found.push({ value, label: shown })
      }
    }
    visit(children)
    return found
  })
}

export {
  hasChild,
  learnLabels,
  notLabel,
  Placed,
  usePlaceContent,
  usePlacedContent,
}
