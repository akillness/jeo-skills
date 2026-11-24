import "@ui-sdk/web/tabs"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="overview">
      <ui-tabs-list aria-label="Dashboard">
        <ui-tabs-tab value="overview">
          <button>Overview</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="analytics">
          <button>Analytics</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="reports">
          <button>Reports</button>
        </ui-tabs-tab>
        <ui-tabs-indicator></ui-tabs-indicator>
      </ui-tabs-list>
      <ui-tabs-panel value="overview">Revenue, visitors and sign-ups for the last 30 days.</ui-tabs-panel>
      <ui-tabs-panel value="analytics">Where visitors come from and what they do.</ui-tabs-panel>
      <ui-tabs-panel value="reports">Monthly reports, ready to download.</ui-tabs-panel>
    </ui-tabs>
  `
}
