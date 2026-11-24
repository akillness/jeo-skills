import {
  menubar as menubarPrimitive,
  type MenubarOptions,
  type MenubarState,
} from "@ui-sdk/core/menubar"
import { MenubarContext } from "./menubar-context"
import { usePart, usePrimitive, type PartProps } from "./use-primitive"

/**
 * A row of menus, like a desktop app's: one tab stop, arrow keys between the
 * triggers and between open menus. Each `Menu` inside joins it.
 * @stable
 */
function Menubar({
  orientation,
  loop,
  disabled,
  modal,
  controller,
  debug,
  ...props
}: MenubarOptions & PartProps<"div", MenubarState>) {
  const menubar = usePrimitive(menubarPrimitive, {
    orientation,
    loop,
    disabled,
    modal,
    controller,
    debug,
  })
  // In its own context, so a menu can join a menubar without bundling it.
  return (
    <MenubarContext.Provider value={menubar}>
      {usePart(menubar, "root", {}, props)}
    </MenubarContext.Provider>
  )
}

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
