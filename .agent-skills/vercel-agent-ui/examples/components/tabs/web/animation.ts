import "@ui-sdk/web/tabs"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="overview">
      <ui-tabs-list aria-label="Project">
        <ui-tabs-tab value="overview">
          <button type="button">Overview</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="activity">
          <button type="button">Activity</button>
        </ui-tabs-tab>
        <ui-tabs-tab value="settings">
          <button type="button">Settings</button>
        </ui-tabs-tab>
        <ui-tabs-indicator></ui-tabs-indicator>
      </ui-tabs-list>
      <div data-slot="stack">
        <ui-tabs-panel value="overview">The launch is on track for Friday, with 4 of 6 tasks done.</ui-tabs-panel>
        <ui-tabs-panel value="activity">Inès Moreau deployed to production and Kofi Mensah left a review.</ui-tabs-panel>
        <ui-tabs-panel value="settings">Rename the project, transfer it to another team or archive it.</ui-tabs-panel>
      </div>
    </ui-tabs>
  `
}

export { mount }
