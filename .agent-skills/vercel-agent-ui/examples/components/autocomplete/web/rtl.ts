import "@ui-sdk/web/autocomplete"

const cities = ["القاهرة", "القدس", "الرباط", "الرياض", "بيروت", "دبي", "عمّان"]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-autocomplete inline-complete>
        <div data-slot="stack">
          <ui-autocomplete-label>المدينة</ui-autocomplete-label>
          <ui-autocomplete-input>
            <input placeholder="مثلاً: دبي" />
          </ui-autocomplete-input>
        </div>
        <ui-autocomplete-content>
          <ui-autocomplete-list>
            ${cities.map((city) => `<ui-autocomplete-item value="${city}">${city}</ui-autocomplete-item>`).join("")}
          </ui-autocomplete-list>
        </ui-autocomplete-content>
      </ui-autocomplete>
    </div>
  `
}
