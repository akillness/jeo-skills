import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"
import "@ui-sdk/web/tabs"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="reply">
      <ui-tabs-list aria-label="Comment">
        <ui-tabs-tab value="reply">
          <button type="button">Reply</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="formatting">
          <button type="button">Formatting</button>
        </ui-tabs-tab>
        <ui-tabs-indicator></ui-tabs-indicator>
      </ui-tabs-list>
      <ui-tabs-panel value="reply" keep-mounted>
        <ui-field>
          <ui-field-label>Message</ui-field-label>
          <ui-textarea>
            <textarea rows="3" placeholder="Write a reply…"></textarea>
          </ui-textarea>
        </ui-field>
      </ui-tabs-panel>
      <ui-tabs-panel value="formatting">
        <p>Use **bold**, _italics_ and \`code\` to format your reply.</p>
        <p>Paste a link on its own line to show a preview.</p>
      </ui-tabs-panel>
    </ui-tabs>
  `
}

export { mount }
