import "@ui-sdk/web/tooltip"

const sides = [
  { side: "right", label: "يمين" },
  { side: "top", label: "أعلى" },
  { side: "bottom", label: "أسفل" },
  { side: "left", label: "يسار" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl" data-slot="row">
      ${sides
        .map(
          ({ side, label }) => `
        <ui-tooltip>
          <ui-tooltip-trigger><button>${label}</button></ui-tooltip-trigger>
          <ui-tooltip-content side="${side}" align="start" side-offset="8">
            <ui-tooltip-arrow></ui-tooltip-arrow>
            أضف إلى المكتبة
          </ui-tooltip-content>
        </ui-tooltip>`
        )
        .join("")}
    </div>
  `
}

export { mount }
