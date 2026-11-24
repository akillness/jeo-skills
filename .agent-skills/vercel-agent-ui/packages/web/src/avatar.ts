import { avatar } from "@ui-sdk/core/avatar"
import { createParts } from "./define-element"

// <ui-avatar> holds a native <img>, hidden until it loads, and a fallback
// shown until then or when it can't. Markup:
//
// <ui-avatar>
//   <img src="/ada.png" alt="Ada Lovelace" />
//   <ui-avatar-fallback delay="600">AL</ui-avatar-fallback>
// </ui-avatar>
//
// The image's own attributes, like `crossorigin` and `referrerpolicy`, apply
// as written. `loadingstatuschange` fires with each status.
function defineAvatarElements() {
  createParts(avatar, {
    root: {
      tag: "ui-avatar",
      children: { image: (el) => el.querySelector(":scope > img") },
      // The fallback may upgrade after the avatar binds, so its delay comes from markup.
      options: (el) => ({
        fallbackDelay:
          Number(
            el
              .querySelector(":scope > ui-avatar-fallback")
              ?.getAttribute("delay")
          ) || 0,
      }),
      optionalChildren: ["image"],
      kinds: { fallbackDelay: null },
    },
    fallback: {
      tag: "ui-avatar-fallback",
      // Also brings in the rule that keeps a hidden part hidden whatever display a class gives it.
      display: "block",
    },
  })
}

export { defineAvatarElements }
