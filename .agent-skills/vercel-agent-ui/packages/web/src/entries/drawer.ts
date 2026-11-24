// Importing this defines <ui-drawer> and its parts. On the server it does nothing.
import { defineDrawerElements } from "../drawer"

defineDrawerElements()

export type {
  DrawerApi,
  DrawerBackdropState,
  DrawerContentProps,
  DrawerContentState,
  DrawerController,
  DrawerDismissAttemptDetails,
  DrawerDismissReason,
  DrawerDriver,
  DrawerHandleState,
  DrawerKeyframes,
  DrawerOpenChangeReason,
  DrawerOptions,
  DrawerOutletProps,
  DrawerOutletState,
  DrawerPayloadChangeReason,
  DrawerPrimitive,
  DrawerSide,
  DrawerSnapPointChangeReason,
  DrawerTriggerProps,
  SheetPhysics,
  SnapPoint,
} from "@ui-sdk/core/drawer"
export type { DrawerEvents, UiDrawerElement } from "../events"
export { createDrawerController, sheetPhysics } from "@ui-sdk/core/drawer"
