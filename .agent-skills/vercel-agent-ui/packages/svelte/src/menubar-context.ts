import type { menubar } from "@ui-sdk/core/menubar"
import type { PrimitiveHandle } from "./use-primitive.svelte"

// The menubar's context key, apart from the menubar, so a menu can join one
// without bundling it. Menus set null below them.
const MenubarKey = Symbol("menubar")

type MenubarContext = PrimitiveHandle<typeof menubar> | null

export { type MenubarContext, MenubarKey }
