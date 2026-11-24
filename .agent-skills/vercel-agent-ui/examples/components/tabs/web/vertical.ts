import "@ui-sdk/web/tabs"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="general" orientation="vertical">
      <ui-tabs-list aria-label="Preferences">
        <ui-tabs-tab value="general">
          <button type="button">General</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="security">
          <button type="button">Security</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="integrations">
          <button type="button">Integrations</button>
        </ui-tabs-tab>
      </ui-tabs-list>
      <ui-tabs-panel value="general">Choose your language, time zone and the page you start on.</ui-tabs-panel>
      <ui-tabs-panel value="security">Manage passkeys, signed-in sessions and recovery codes.</ui-tabs-panel>
      <ui-tabs-panel value="integrations">Connect your calendar and chat apps to get reminders.</ui-tabs-panel>
    </ui-tabs>
  `
}

export { mount }
