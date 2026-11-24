import {
  toolbar,
  type ToolbarGroupProps,
  type ToolbarGroupState,
  type ToolbarOptions,
  type ToolbarState,
} from "@ui-sdk/core/toolbar"
import type { JSX } from "@solidjs/web"
import { createUniqueId, merge, omit } from "solid-js"
import { ToolbarContext, ToolbarGroupContext } from "./toolbar-context"
import {
  createParts,
  provided,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(toolbar, {
  button: "button",
  link: "a",
  input: "input",
  separator: "div",
})

/**
 * A row of controls with one tab stop and arrow keys between them. Toggles and
 * toggle groups inside join it. Render menu and select triggers through
 * `ToolbarButton`, and fields through `ToolbarInput`.
 * @stable
 */
const Toolbar = /* @__PURE__ */ rootScope(function Toolbar(
  props: ToolbarOptions & PartProps<"div", ToolbarState>
) {
  const handle = usePrimitive(toolbar, () => ({
    orientation: props.orientation,
    loop: props.loop,
    disabled: props.disabled,
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "orientation",
    "loop",
    "disabled",
    "controller",
    "debug"
  )
  return (
    <ToolbarContext value={handle}>
      {usePart(handle, "root", undefined, rest, "div")}
    </ToolbarContext>
  )
})

/**
 * A button in the toolbar. Arrow keys move between it and the toolbar's other items.
 * @stable
 */
const ToolbarButton = parts.Button

/**
 * A link in the toolbar. Arrow keys move between it and the toolbar's other items.
 * @stable
 */
const ToolbarLink = parts.Link

/**
 * A text field. Arrows move its caret, and leave it only from the end they point at.
 * @stable
 */
const ToolbarInput = parts.Input

/**
 * A group of related items in the toolbar. `disabled` disables every item in it.
 * @stable
 */
function ToolbarGroup(
  props: ToolbarGroupProps &
    Omit<PartProps<"div", ToolbarGroupState>, "disabled">
) {
  const id = createUniqueId()
  // Toggles and toggle groups inside read whether the group is disabled from
  // context, in document order on the server, so its first item can claim the
  // tab stop before the items after it.
  const rest = merge(omit(props, "disabled"), {
    get children() {
      return (state: ToolbarGroupState) =>
        provided(
          <ToolbarGroupContext value={() => state.disabled}>
            {typeof props.children === "function" && props.children.length > 0
              ? props.children(state)
              : // A function that takes nothing is a child's accessor, which Solid renders.
                (props.children as JSX.Element)}
          </ToolbarGroupContext>
        )
    },
  })
  return usePart(
    toolbar,
    "group",
    () => ({ id, disabled: props.disabled }),
    rest,
    "div"
  )
}

/**
 * A line between groups of items.
 * @stable
 */
const ToolbarSeparator = parts.Separator

export { createToolbarController } from "@ui-sdk/core/toolbar"
export type {
  ToolbarApi,
  ToolbarButtonProps,
  ToolbarButtonState,
  ToolbarController,
  ToolbarGroupProps,
  ToolbarGroupState,
  ToolbarInputProps,
  ToolbarInputState,
  ToolbarLinkState,
  ToolbarOptions,
  ToolbarOrientation,
  ToolbarPrimitive,
  ToolbarState,
  ToolbarSeparatorState,
} from "@ui-sdk/core/toolbar"

export {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarInput,
  ToolbarLink,
  ToolbarSeparator,
}
