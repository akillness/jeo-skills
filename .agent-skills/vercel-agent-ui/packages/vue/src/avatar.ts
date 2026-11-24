import { avatar } from "@ui-sdk/core/avatar"
import { defineComponent } from "vue"
import { createParts, withElement } from "./create-parts"
import { usePart, type PartSlots } from "./use-primitive"

const parts = createParts(avatar, { root: "span", fallback: "span" })

/**
 * The root: a box for the image and its fallback.
 * @stable
 */
const Avatar = parts.Root

/**
 * A real <img>, hidden until it loads. Every image attribute passes through,
 * like `crossorigin`, `referrerpolicy`, `srcset` and `sizes`.
 * @stable
 */
const AvatarImage = withElement(
  "img",
  defineComponent({
    name: "AvatarImage",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof avatar, "image">,
    setup(_, { attrs }) {
      // Attributes apply in order, and WebKit starts fetching as soon as `src`
      // is set, so the sources go last, after `referrerpolicy` and `crossorigin`.
      const sourcesLast = () => {
        const { src, srcset, ...rest } = attrs
        return { ...rest, srcset, src }
      }
      return usePart(avatar, "image", undefined, sourcesLast, "img")
    },
  })
)

/**
 * Shown while there's no loaded image, after its `delay`.
 * @stable
 */
const AvatarFallback = parts.Fallback

export { Avatar, AvatarFallback, AvatarImage }

export type {
  AvatarFallbackProps,
  AvatarLoadingStatus,
  AvatarLoadingStatusChangeReason,
  AvatarOptions,
  AvatarPrimitive,
  AvatarState,
} from "@ui-sdk/core/avatar"
