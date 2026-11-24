// Importing this defines <ui-menubar> and its parts. On the server it does nothing.
import { defineMenubarElements } from "../menubar"

defineMenubarElements()

export type {
  MenubarApi,
  MenubarController,
  MenubarMember,
  MenubarOptions,
  MenubarOrientation,
  MenubarPrimitive,
  MenubarState,
} from "@ui-sdk/core/menubar"
export type { UiMenubarElement } from "../events"
export { createMenubarController } from "@ui-sdk/core/menubar"
