import "@ui-sdk/web/tabs"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls">
        <button type="button">Show Sent Mail</button>
      </div>
      <ui-tabs default-value="inbox">
        <ui-tabs-list aria-label="Mail">
          <ui-tabs-tab value="inbox">
            <button type="button">Inbox</button>
          </ui-tabs-tab>
          <ui-tabs-tab value="drafts">
            <button type="button">Drafts</button>
          </ui-tabs-tab>
          <ui-tabs-tab value="sent">
            <button type="button">Sent</button>
          </ui-tabs-tab>
          <ui-tabs-indicator></ui-tabs-indicator>
        </ui-tabs-list>
        <ui-tabs-panel value="inbox">3 unread messages from Hollis Grant and Inès Moreau.</ui-tabs-panel>
        <ui-tabs-panel value="drafts">2 drafts, the last one edited yesterday at 4:12 PM.</ui-tabs-panel>
        <ui-tabs-panel value="sent">12 messages sent this week, all delivered.</ui-tabs-panel>
      </ui-tabs>
    </div>
  `
  const tabs = root.querySelector("ui-tabs")!
  tabs.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(root, `value: ${value} (${reason})`)
  })
  root
    .querySelector('[data-slot="controls"] button')!
    .addEventListener("click", () => tabs.api.select("sent"))
}

export { mount }
