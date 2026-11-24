import "@ui-sdk/web/command"

const commands = [
  { value: "calendar", label: "التقويم" },
  { value: "search", label: "البحث" },
  { value: "settings", label: "الإعدادات" },
  { value: "profile", label: "الملف الشخصي" },
]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl" data-slot="stack">
      <ui-command>
        <ui-command-input>
          <input aria-label="ابحث عن أمر" placeholder="ابحث…" />
        </ui-command-input>
        <ui-command-empty>لا توجد نتائج.</ui-command-empty>
        <ui-command-list>
          ${commands
            .map(
              (item) =>
                `<ui-command-item value="${item.value}" label="${item.label}">${item.label}</ui-command-item>`
            )
            .join("")}
        </ui-command-list>
      </ui-command>
    </div>
  `
}
