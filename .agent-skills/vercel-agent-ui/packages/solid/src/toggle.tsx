import {
  toggle,
  toggleGroup as toggleGroupPrimitive,
  type ToggleGroupController,
  type ToggleGroupOptions,
  type ToggleGroupState,
  type ToggleOptions,
  type ToggleState,
} from "@ui-sdk/core/toggle"
import { createContext, omit, useContext } from "solid-js"
import { useToolbarScope } from "./toolbar-context"
import {
  createParts,
  provided,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(toggle, { icon: "span" })

// The group's own context, so a toggle can join a group without bundling it.
const ToggleGroupContext = createContext<PrimitiveHandle<
  typeof toggleGroupPrimitive
> | null>(null)

/**
 * A button that stays pressed. Inside a ToggleGroup, the group decides whether it's pressed.
 * @stable
 */
const Toggle = /* @__PURE__ */ rootScope(function Toggle(
  props: ToggleOptions &
    Omit<
      PartProps<"button", ToggleState>,
      "value" | "defaultValue" | "type" | "onChange" | "onSelect"
    >
) {
  const group = useContext(ToggleGroupContext)
  const toolbar = useToolbarScope()
  const handle = usePrimitive(toggle, () => ({
    pressed: props.pressed,
    defaultPressed: props.defaultPressed,
    onPressedChange: props.onPressedChange,
    value: props.value,
    disabled: props.disabled,
    focusableWhenDisabled: props.focusableWhenDisabled,
    group: group ? () => group.api : undefined,
    toolbar: toolbar?.(),
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "pressed",
    "defaultPressed",
    "onPressedChange",
    "value",
    "disabled",
    "focusableWhenDisabled",
    "controller",
    "debug"
  )
  return usePart(handle, "root", undefined, rest, "button")
})

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
const ToggleGroup = /* @__PURE__ */ rootScope(function ToggleGroup<
  T extends string = string,
>(
  props: ToggleGroupOptions<T> &
    Omit<
      PartProps<"div", ToggleGroupState<T>>,
      "defaultValue" | "onChange" | "onSelect"
    >
) {
  const toolbar = useToolbarScope()
  const group = usePrimitive(toggleGroupPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange as ToggleGroupOptions["onValueChange"],
    multiple: props.multiple,
    deselectable: props.deselectable,
    disabled: props.disabled,
    orientation: props.orientation,
    loop: props.loop,
    controller: props.controller as ToggleGroupController | undefined,
    debug: props.debug,
    toolbar: toolbar?.(),
  }))
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "multiple",
    "deselectable",
    "disabled",
    "orientation",
    "loop",
    "controller",
    "debug"
  )
  return provided(
    <ToggleGroupContext value={group}>
      {usePart(group, "group", undefined, rest, "div")}
    </ToggleGroupContext>
  )
})

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
