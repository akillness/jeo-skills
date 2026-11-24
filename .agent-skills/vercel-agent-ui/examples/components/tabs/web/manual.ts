import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/tabs"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="preview" activation="manual">
      <ui-tabs-list aria-label="Snippet">
        <ui-tabs-tab value="preview">
          <button type="button">Preview</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="code">
          <button type="button">Code</button>
        </ui-tabs-tab>
      </ui-tabs-list>
      <ui-tabs-panel value="preview">Welcome back, Hollis. You have 3 unread messages.</ui-tabs-panel>
      <ui-tabs-panel value="code">
        <ui-field>
          <ui-field-label>Source</ui-field-label>
          <ui-input>
            <input value='&lt;Welcome name="Hollis" unread={3} /&gt;' />
          </ui-input>
        </ui-field>
      </ui-tabs-panel>
    </ui-tabs>
  `
}

export { mount }
