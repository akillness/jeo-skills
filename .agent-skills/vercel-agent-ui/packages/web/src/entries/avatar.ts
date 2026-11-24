// Importing this defines <ui-avatar> and its parts. On the server it does nothing.
import { defineAvatarElements } from "../avatar"

defineAvatarElements()

export type {
  AvatarFallbackProps,
  AvatarLoadingStatus,
  AvatarLoadingStatusChangeReason,
  AvatarOptions,
  AvatarPrimitive,
  AvatarState,
} from "@ui-sdk/core/avatar"
export type { AvatarEvents, UiAvatarElement } from "../events"
