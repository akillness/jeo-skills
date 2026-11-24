import { avatar } from "@ui-sdk/core/avatar"
import { createParts } from "./use-primitive"

const parts = createParts(avatar, {
  root: "span",
  image: "img",
  fallback: "span",
})

/**
 * The root: a box for the image and its fallback.
 * @stable
 */
const Avatar = parts.Root

/**
 * A real <img>, hidden until it loads. Every image attribute passes through,
 * like `crossOrigin`, `referrerPolicy`, `srcSet` and `sizes`.
 * @stable
 */
const AvatarImage = parts.Image

/**
 * Shown while there's no loaded image, after its `delay`.
 * @stable
 */
const AvatarFallback = parts.Fallback

export type {
  AvatarFallbackProps,
  AvatarLoadingStatus,
  AvatarLoadingStatusChangeReason,
  AvatarOptions,
  AvatarPrimitive,
  AvatarState,
} from "@ui-sdk/core/avatar"

export { Avatar, AvatarFallback, AvatarImage }
