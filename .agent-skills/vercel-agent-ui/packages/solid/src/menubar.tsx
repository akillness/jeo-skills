import {
  menubar as menubarPrimitive,
  type MenubarOptions,
  type MenubarState,
} from "@ui-sdk/core/menubar"
import { omit } from "solid-js"
import { MenubarContext } from "./menubar-context"
import {
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

/**
 * A row of menus, like a desktop app's: one tab stop, arrow keys between the
 * triggers and between open menus. Each `Menu` inside joins it.
 * @stable
 */
const Menubar = /* @__PURE__ */ rootScope(function Menubar(
  props: MenubarOptions & PartProps<"div", MenubarState>
) {
  const menubar = usePrimitive(menubarPrimitive, () => ({
    orientation: props.orientation,
    loop: props.loop,
    disabled: props.disabled,
    modal: props.modal,
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "orientation",
    "loop",
    "disabled",
    "modal",
    "controller",
    "debug"
  )
  return (
    <MenubarContext value={menubar}>
      {usePart(menubar, "root", undefined, rest, "div")}
    </MenubarContext>
  )
})

export { createMenubarController } from "@ui-sdk/core/menubar"
export type {
  MenubarApi,
  MenubarController,
  MenubarMember,
  MenubarOptions,
  MenubarOrientation,
  MenubarPrimitive,
  MenubarState,
} from "@ui-sdk/core/menubar"

export { Menubar }
