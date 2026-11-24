import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Date (en-GB)</ui-field-label>
        <ui-date-input locale="en-GB" default-value="2026-11-02"></ui-date-input>
      </ui-field>
      <ui-field>
        <ui-field-label>Datum (de-DE)</ui-field-label>
        <ui-date-input locale="de-DE" default-value="2026-11-02"></ui-date-input>
      </ui-field>
      <ui-field>
        <ui-field-label>日付 (ja-JP)</ui-field-label>
        <ui-date-input locale="ja-JP" default-value="2026-11-02"></ui-date-input>
      </ui-field>
    </div>
  `
}

export { mount }
