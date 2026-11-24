import { resizable, type ResizableApi } from "@ui-sdk/core/resizable"
import { createParts } from "./define-element"

// <ui-resizable> and its parts. Markup:
//
// <ui-resizable orientation="horizontal" auto-save-id="editor">
//   <ui-resizable-panel id="sidebar" default-size="25" min-size="15" collapsible>…</ui-resizable-panel>
//   <ui-resizable-handle aria-label="Resize sidebar"></ui-resizable-handle>
//   <ui-resizable-panel id="main">…</ui-resizable-panel>
// </ui-resizable>
//
// Groups nest inside panels. Set `storage` and `controller` as properties.
function defineResizableElements() {
  createParts(resizable, {
    root: {
      tag: "ui-resizable",
      display: "block",
      // `layout` is live: setting the property or the attribute resizes the
      // panels, like the controller, and fires `layoutchange`. A layout can't be
      // cleared, so removing the attribute leaves the panels where they are.
      state: {
        layout: {
          get: (api: ResizableApi) => api.getLayout(),
          set: (api: ResizableApi, layout: number[] | null | undefined) => {
            if (Array.isArray(layout)) {
              api.setLayout(layout)
            }
          },
        },
      },
      api: [
        "getLayout",
        "setLayout",
        "collapse",
        "expand",
        "resize",
        "isCollapsed",
      ],
    },
    panel: {
      tag: "ui-resizable-panel",
      display: "block",
      // Its `id` keys its size in a saved layout.
      kinds: { id: "string" },
    },
    handle: { tag: "ui-resizable-handle", display: "block" },
  })
}

export { defineResizableElements }
