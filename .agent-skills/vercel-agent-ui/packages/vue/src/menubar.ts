import {
  menubar as menubarPrimitive,
  type MenubarController,
  type MenubarOrientation,
} from "@ui-sdk/core/menubar"
import { defineComponent, provide, type PropType } from "vue"
import { withElement } from "./create-parts"
import { MenubarKey } from "./menubar-context"
import {
  optionalBoolean,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"

/**
 * A row of menus, like a desktop app's: one tab stop, arrow keys between the
 * triggers and between open menus. Each `Menu` inside joins it.
 * @stable
 */
const Menubar = withElement(
  "div",
  defineComponent({
    name: "Menubar",
    inheritAttrs: false,
    props: {
      orientation: String as PropType<MenubarOrientation>,
      loop: optionalBoolean,
      disabled: optionalBoolean,
      modal: {
        type: [Boolean, String] as PropType<boolean | "pointer">,
        default: undefined,
      },
      controller: Object as PropType<MenubarController>,
      debug: optionalBoolean,
    },
    slots: Object as PartSlots<typeof menubarPrimitive, "root">,
    setup(props) {
      const menubar = usePrimitive(menubarPrimitive, () => ({
        orientation: props.orientation,
        loop: props.loop,
        disabled: props.disabled,
        modal: props.modal,
        controller: props.controller,
        debug: props.debug,
      }))
      // Menus join it through this key, so a menu doesn't bundle the menubar.
      provide(MenubarKey, menubar)
      return usePart(menubar, "root", undefined, undefined, "div")
    },
  })
)

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
