import "@ui-sdk/web/drawer"

const paragraphs = [
  "The drawer rises from any edge, rests on snap points and follows your finger with the same spring as a system sheet.",
  "Snap points take fractions of the screen, pixels, rem, percentages or the content's own size. Points that land within a pixel of each other merge into one.",
  "Dragging a list scrolls it until it reaches the top, and then the same gesture moves the drawer, so closing a long sheet never needs two tries.",
  "The handle steps through the snap points with a press, the arrow keys, Home and End. Screen readers on phones adjust it like a slider.",
  "Below a snap point you choose, the page behind stays usable and undimmed, like a map with a sheet of results.",
  "Drawers opened from inside each other stack, and the one beneath steps back while the new one rises.",
  "The on-screen keyboard pushes the drawer up, and the focused field scrolls into view inside it, never the page.",
  "With reduced motion, drawers fade in and out instead of sliding.",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-drawer>
      <ui-drawer-trigger><button>Scrollable Content</button></ui-drawer-trigger>
      <ui-drawer-backdrop hidden></ui-drawer-backdrop>
      <ui-drawer-content initial-focus="content" hidden>
        <div data-slot="grip" aria-hidden="true"></div>
        <div data-slot="stack">
          <ui-drawer-title>Release notes</ui-drawer-title>
          <ui-drawer-description>Everything new in the drawer.</ui-drawer-description>
        </div>
        <div data-slot="scroll">
          ${[...paragraphs, ...paragraphs].map((paragraph) => `<p data-slot="hint">${paragraph}</p>`).join("")}
        </div>
        <div data-slot="stack">
          <ui-drawer-close><button data-variant="solid">Got It</button></ui-drawer-close>
        </div>
      </ui-drawer-content>
    </ui-drawer>
  `
}

export { mount }
