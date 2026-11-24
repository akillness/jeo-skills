import type { menubar } from "@ui-sdk/core/menubar"
import { createContext } from "solid-js"
import type { PrimitiveHandle } from "./use-primitive"

// The menubar's context, apart from the menubar, so a menu can join one
// without bundling it.
const MenubarContext = createContext<PrimitiveHandle<typeof menubar> | null>(
  null
)

export { MenubarContext }
