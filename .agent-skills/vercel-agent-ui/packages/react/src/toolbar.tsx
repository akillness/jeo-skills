import {
  toolbar,
  type ToolbarGroupProps,
  type ToolbarGroupState,
  type ToolbarOptions,
  type ToolbarState,
} from "@ui-sdk/core/toolbar"
import * as React from "react"
import { ToolbarContext, ToolbarGroupContext } from "./toolbar-context"
import {
  createParts,
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
function Toolbar({
  orientation,
  loop,
  disabled,
  controller,
  debug,
  ...props
}: ToolbarOptions & PartProps<"div", ToolbarState>) {
  const handle = usePrimitive(toolbar, {
    orientation,
    loop,
    disabled,
    controller,
    debug,
  })
  // In its own context too, so a toggle can join a toolbar without bundling it.
  return (
    <ToolbarContext.Provider value={handle}>
      {usePart(handle, "root", {}, props)}
    </ToolbarContext.Provider>
  )
}

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
function ToolbarGroup({
  disabled,
  children,
  ...props
}: ToolbarGroupProps & Omit<PartProps<"div", ToolbarGroupState>, "disabled">) {
  // Toggles inside read whether the group is disabled from context.
  const content = (state: ToolbarGroupState) => (
    <ToolbarGroupContext.Provider value={state.disabled}>
      {typeof children === "function" ? children(state) : children}
    </ToolbarGroupContext.Provider>
  )
  return usePart(
    toolbar,
    "group",
    { id: React.useId(), disabled },
    { ...props, children: content }
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
