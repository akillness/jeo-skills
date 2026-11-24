import "@ui-sdk/web/listbox"

const views = [
  { value: "day", label: "יום" },
  { value: "week", label: "שבוע" },
  { value: "month", label: "חודש" },
]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-listbox orientation="horizontal" default-value="day" aria-label="תצוגה">
        ${views
          .map(
            (view) => `
              <ui-listbox-item value="${view.value}">${view.label}</ui-listbox-item>`
          )
          .join("")}
      </ui-listbox>
    </div>
  `
}
