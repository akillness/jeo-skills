import "@ui-sdk/web/popover"

const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      ${aligns
        .map(
          (align) => `
            <ui-popover>
              <ui-popover-trigger>
                <button>${align.label}</button>
              </ui-popover-trigger>
              <ui-popover-content align="${align.value}" side-offset="8">
                <ui-popover-title>Delivery window</ui-popover-title>
                <ui-popover-description>Arrives Tuesday between 9 AM and noon.</ui-popover-description>
              </ui-popover-content>
            </ui-popover>
          `
        )
        .join("")}
    </div>
  `
}

export { mount }
