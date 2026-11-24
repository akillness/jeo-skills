import "@ui-sdk/web/drawer"

const sides = [
  {
    side: "top",
    label: "Top",
    title: "Notifications",
    description: "You're all caught up.",
  },
  {
    side: "right",
    label: "Right",
    title: "Cart",
    description: "2 items, $84.00.",
  },
  {
    side: "bottom",
    label: "Bottom",
    title: "Share",
    description: "Send this page to your team.",
  },
  {
    side: "left",
    label: "Left",
    title: "Menu",
    description: "Jump to a section of the docs.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      ${sides
        .map(
          ({
            side,
            label,
            title,
            description,
          }) => `<ui-drawer side="${side}" ${side === "left" || side === "right" ? "prevent-edge-swipe" : ""}>
            <ui-drawer-trigger><button>${label}</button></ui-drawer-trigger>
            <ui-drawer-backdrop hidden></ui-drawer-backdrop>
            <ui-drawer-content hidden>
              <div data-slot="stack">
                <ui-drawer-title>${title}</ui-drawer-title>
                <ui-drawer-description>${description}</ui-drawer-description>
              </div>
              <ui-drawer-close><button data-variant="solid">Close</button></ui-drawer-close>
            </ui-drawer-content>
          </ui-drawer>`
        )
        .join("")}
    </div>
  `
}

export { mount }
