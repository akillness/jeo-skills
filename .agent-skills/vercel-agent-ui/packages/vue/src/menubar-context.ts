import type { menubar } from "@ui-sdk/core/menubar"
import type { InjectionKey } from "vue"
import type { PrimitiveHandle } from "./use-primitive"

// The menubar's injection key, apart from the menubar, so a menu can join one
// without bundling it. Menus provide null below them.
const MenubarKey: InjectionKey<PrimitiveHandle<typeof menubar> | null> =
  Symbol("menubar")

export { MenubarKey }
