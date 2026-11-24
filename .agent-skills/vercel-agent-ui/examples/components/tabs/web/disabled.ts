import "@ui-sdk/web/tabs"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="overview">
      <ui-tabs-list aria-label="Dashboard">
        <ui-tabs-tab value="overview">
          <button type="button">Overview</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="analytics">
          <button type="button">Analytics</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="reports" disabled>
          <button type="button">Reports</button>
        </ui-tabs-tab>
      </ui-tabs-list>
      <ui-tabs-panel value="overview">Revenue, visitors and sign-ups for the last 30 days.</ui-tabs-panel>
      <ui-tabs-panel value="analytics">Where your visitors come from and the pages they read most.</ui-tabs-panel>
      <ui-tabs-panel value="reports">Monthly reports are available on the Pro plan.</ui-tabs-panel>
    </ui-tabs>
  `
}

export { mount }
