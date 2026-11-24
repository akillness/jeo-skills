import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * Which way the line runs.
 * @stable
 */
type SeparatorOrientation = "horizontal" | "vertical"

/**
 * The options `separator` takes. A component takes them as props.
 * @stable
 */
type SeparatorOptions = {
  /**
   * Which way the line runs. A vertical separator divides items in a row.
   * @defaultValue "horizontal"
   */
  orientation?: SeparatorOrientation
  /**
   * Hides the separator from assistive technology with `role="none"`, for a
   * line that's only visual. Leave it off when the separator divides content
   * a screen reader should hear as separate, like groups of menu items.
   * @defaultValue false
   */
  decorative?: boolean
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type SeparatorState = {
  /** Which way the line runs. */
  orientation: SeparatorOrientation
}

// Every key follows the options. A custom element passes `orientation` as
// written, so anything but "vertical" is the default rather than an invalid
// ARIA value.
function settings(options: SeparatorOptions) {
  const orientation: SeparatorOrientation =
    options.orientation === "vertical" ? "vertical" : "horizontal"
  return { orientation, decorative: !!options.decorative }
}

const separatorPrimitive = /* @__PURE__ */ definePrimitive({
  name: "separator",
  options: { orientation: "string", decorative: "boolean" },
  state: settings,
  sync: settings,
  api: () => ({}),
  slots: (slot) => ({
    root: slot<{}, SeparatorState>({
      // A separator is structure, so it's never focusable. One that resizes
      // panels is a splitter, which needs a value and is another part.
      role: (state) => (state.decorative ? "none" : "separator"),
      roles: ["none", "separator"],
      state: (state) => ({ orientation: state.orientation }),
      attrs: (state) => ({
        "aria-orientation": state.decorative ? undefined : state.orientation,
        "data-orientation": state.orientation,
      }),
    }),
  }),
  // Agents never list it: it has nothing to read or change.
  agent: { shown: () => false },
})

/**
 * The type of `separator`.
 * @stable
 */
interface SeparatorPrimitive extends Named<typeof separatorPrimitive> {}

/**
 * The separator primitive, with the slot `root`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const separator: SeparatorPrimitive = separatorPrimitive

export {
  separator,
  type SeparatorOptions,
  type SeparatorOrientation,
  type SeparatorPrimitive,
  type SeparatorState,
}
