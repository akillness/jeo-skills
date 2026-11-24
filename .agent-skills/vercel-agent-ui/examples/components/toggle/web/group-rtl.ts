import "@ui-sdk/web/toggle"

const views = [
  { value: "list", label: "قائمة" },
  { value: "grid", label: "شبكة" },
  { value: "cards", label: "بطاقات" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-toggle-group default-value="list" aria-label="العرض">
        ${views
          .map(
            (item) => `
              <ui-toggle value="${item.value}">
                <button>${item.label}</button>
              </ui-toggle>
            `
          )
          .join("")}
      </ui-toggle-group>
    </div>
  `
}

export { mount }
