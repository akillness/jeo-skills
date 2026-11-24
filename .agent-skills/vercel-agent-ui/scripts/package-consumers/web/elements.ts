import "@ui-sdk/web/checkbox"
import type { UiAvatarElement } from "@ui-sdk/web/avatar"
import type { UiNumberInputElement } from "@ui-sdk/web/number-input"
import type { UiOTPInputElement } from "@ui-sdk/web/otp-input"
import type { UiGaugeElement } from "@ui-sdk/web/progress"
import type { UiSeparatorElement } from "@ui-sdk/web/separator"
import type { UiSliderElement } from "@ui-sdk/web/slider"

// True only when the two are the same type, so neither `any` nor a wider type passes.
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

// Each tag gives its element type to `querySelector` and `createElement`.
const tags: [
  Same<HTMLElementTagNameMap["ui-slider"], UiSliderElement>,
  Same<HTMLElementTagNameMap["ui-number-input"], UiNumberInputElement>,
  Same<HTMLElementTagNameMap["ui-progress"], UiGaugeElement>,
  Same<HTMLElementTagNameMap["ui-otp-input"], UiOTPInputElement>,
  Same<HTMLElementTagNameMap["ui-avatar"], UiAvatarElement>,
  Same<HTMLElementTagNameMap["ui-separator"], UiSeparatorElement>,
] = [true, true, true, true, true, true]

// A checkbox is form-associated, so it has an input's form members: `form`
// is the form itself, though the attribute names one by id.
const checkbox = document.querySelector("ui-checkbox")!
const form: Same<typeof checkbox.form, HTMLFormElement | null> = true
const valid: boolean = checkbox.checkValidity()

export { form, tags, valid }
