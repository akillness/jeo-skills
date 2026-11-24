import {
  toggle,
  toggleGroup,
  type ToggleGroupController,
  type ToggleGroupOptions,
  type ToggleGroupState,
  type ToggleOptions,
  type ToggleState,
} from "@ui-sdk/core/toggle"
import * as React from "react"
import { useToolbarScope } from "./toolbar-context"
import {
  createParts,
  reading,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(toggle, { root: "button", icon: "span" })

// The group's own context, so a toggle can join a group without bundling it.
const ToggleGroupContext = React.createContext<PrimitiveHandle<
  typeof toggleGroup
> | null>(null)

/**
 * A button that stays pressed. Inside a ToggleGroup, the group decides whether it's pressed.
 * @stable
 */
function Toggle(
  props: ToggleOptions &
    Omit<
      PartProps<"button", ToggleState>,
      "value" | "defaultValue" | "type" | "onChange" | "onSelect"
    >
) {
  const group = React.useContext(ToggleGroupContext)
  const toolbar = useToolbarScope()
  return (
    <parts.Root
      {...props}
      group={group ? reading(group, () => group.api) : undefined}
      toolbar={toolbar}
    />
  )
}

/**
 * An icon inside a toggle. A toggle with only an icon needs an `aria-label`. Screen readers skip
 * it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const ToggleIcon = parts.Icon

/**
 * Toggles that share one value, with one tab stop and arrow keys between them.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function ToggleGroup<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  multiple,
  deselectable,
  disabled,
  orientation,
  loop,
  controller,
  debug,
  ...props
}: ToggleGroupOptions<T> &
  Omit<
    PartProps<"div", ToggleGroupState<T>>,
    "defaultValue" | "onChange" | "onSelect"
  >) {
  const toolbar = useToolbarScope()
  const group = usePrimitive(toggleGroup, {
    value,
    defaultValue,
    onValueChange: onValueChange as ToggleGroupOptions["onValueChange"],
    multiple,
    deselectable,
    disabled,
    orientation,
    loop,
    controller: controller as ToggleGroupController | undefined,
    debug,
    toolbar,
  })
  // The state holds only values of type `T`, which the primitive types as strings.
  return (
    <ToggleGroupContext value={group}>
      {usePart(
        group,
        "group",
        {},
        props as PartProps<"div", ToggleGroupState>,
        "div"
      )}
    </ToggleGroupContext>
  )
}

export {
  createToggleController,
  createToggleGroupController,
} from "@ui-sdk/core/toggle"
export type {
  ToggleApi,
  ToggleChangeOptions,
  ToggleController,
  ToggleGroupApi,
  ToggleGroupChangeOptions,
  ToggleGroupController,
  ToggleGroupOptions,
  ToggleGroupOrientation,
  ToggleGroupPrimitive,
  ToggleGroupState,
  ToggleGroupValueChangeReason,
  ToggleIconProps,
  ToggleIconState,
  ToggleOptions,
  TogglePressedChangeReason,
  TogglePrimitive,
  ToggleState,
} from "@ui-sdk/core/toggle"

export { Toggle, ToggleGroup, ToggleIcon }
