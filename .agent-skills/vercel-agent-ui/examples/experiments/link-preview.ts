import {
  createPopup,
  definePrimitive,
  popupState,
  popupSlots,
  type ChangeDetails,
} from "@ui-sdk/core"
import { hoverCardPreset } from "@ui-sdk/core/hover-card"

type LinkPreviewOpenChangeReason =
  | "trigger-hover"
  | "trigger-focus"
  | "escape-key"
  | "outside-press"
  | "focus-out"
  | "window-blur"
  | "close-press"
  | "imperative"

type LinkPreviewPayloadChangeReason =
  "trigger-hover" | "trigger-focus" | "imperative"

type LinkPreviewPage = {
  title: string
  description: string
  image?: string
}

type LinkPreviewOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<LinkPreviewOpenChangeReason>
  ) => void
  onPayloadChange?: (
    page: unknown,
    details: ChangeDetails<LinkPreviewPayloadChangeReason>
  ) => void
  delay?: number
  closeDelay?: number
}

type LinkPreviewImageState = { open: boolean }

const pageOf = (state: { payload: unknown }) =>
  state.payload as LinkPreviewPage | undefined

const linkPreview = /* @__PURE__ */ definePrimitive({
  name: "link-preview",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onPayloadChange: "callback",
    delay: "number",
    closeDelay: "number",
  },
  state: (options: LinkPreviewOptions) => popupState(options),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => createPopup(context, { preset: hoverCardPreset }),
  slots: (slot) => ({
    ...popupSlots(slot),
    image: slot<{}, LinkPreviewImageState>({
      present: (state) => !!pageOf(state)?.image,
      state: (state) => ({ open: state.open }),
      attrs: (state) => ({
        src: pageOf(state)?.image,
        alt: "",
        loading: "lazy",
      }),
    }),
  }),
})

export {
  linkPreview,
  type LinkPreviewImageState,
  type LinkPreviewOpenChangeReason,
  type LinkPreviewOptions,
  type LinkPreviewPage,
  type LinkPreviewPayloadChangeReason,
}
