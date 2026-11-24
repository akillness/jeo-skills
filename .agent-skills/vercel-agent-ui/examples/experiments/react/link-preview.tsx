import * as React from "react"
import { createParts } from "@ui-sdk/react/primitive"
import { linkPreview, type LinkPreviewPage } from "../link-preview"

const parts = createParts(linkPreview, {
  trigger: "a",
  content: "div",
  title: "p",
  description: "p",
  image: "img",
})

const LinkPreview = parts.Root

const LinkPreviewTrigger = parts.Trigger

const LinkPreviewContent = parts.Content

const LinkPreviewTitle = parts.Title

const LinkPreviewDescription = parts.Description

const LinkPreviewImage = parts.Image

const cover = (from: string, to: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="320" height="120" fill="url(#g)"/></svg>`
  )}`

const pages = {
  popups: {
    title: "Popups",
    description:
      "The top layer, placement, presence, dismissal and focus, behind every popup.",
    image: cover("#262626", "#737373"),
  },
  focus: {
    title: "Focus",
    description:
      "Roving focus, focus recovery and keeping focus where people expect it.",
    image: cover("#525252", "#a3a3a3"),
  },
  motion: {
    title: "Motion",
    description:
      "Presence and gesture physics: what animates in, out and with a finger.",
  },
} satisfies Record<string, LinkPreviewPage>

function Example() {
  return (
    <LinkPreview>
      <p>
        Every popup sits on the{" "}
        <LinkPreviewTrigger
          href="/docs/core/behaviors/popups"
          payload={pages.popups}
        >
          popup layer
        </LinkPreviewTrigger>
        , moves{" "}
        <LinkPreviewTrigger
          href="/docs/core/behaviors/focus"
          payload={pages.focus}
        >
          focus
        </LinkPreviewTrigger>{" "}
        in and back, and animates with{" "}
        <LinkPreviewTrigger
          href="/docs/core/behaviors/motion"
          payload={pages.motion}
        >
          motion
        </LinkPreviewTrigger>{" "}
        it shares with the rest of the page.
      </p>
      <LinkPreviewContent sideOffset={6}>
        {(state) => {
          const page = state.payload as LinkPreviewPage | undefined
          return (
            <>
              <LinkPreviewImage />
              <div data-slot="stack">
                <LinkPreviewTitle>{page?.title}</LinkPreviewTitle>
                <LinkPreviewDescription>
                  {page?.description}
                </LinkPreviewDescription>
              </div>
            </>
          )
        }}
      </LinkPreviewContent>
    </LinkPreview>
  )
}

export {
  Example,
  LinkPreview,
  LinkPreviewContent,
  LinkPreviewDescription,
  LinkPreviewImage,
  LinkPreviewTitle,
  LinkPreviewTrigger,
}
