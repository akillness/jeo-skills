import "@ui-sdk/web/segmented-control"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-segmented-control aria-label="Theme" default-value="system" disabled>
        <ui-segmented-control-indicator></ui-segmented-control-indicator>
        <ui-segmented-control-item value="light">Light</ui-segmented-control-item>
        <ui-segmented-control-item value="dark">Dark</ui-segmented-control-item>
        <ui-segmented-control-item value="system">System</ui-segmented-control-item>
      </ui-segmented-control>
      <ui-segmented-control aria-label="Billing period" default-value="monthly">
        <ui-segmented-control-indicator></ui-segmented-control-indicator>
        <ui-segmented-control-item value="monthly">Monthly</ui-segmented-control-item>
        <ui-segmented-control-item value="yearly">Yearly</ui-segmented-control-item>
        <ui-segmented-control-item value="lifetime" disabled>Lifetime</ui-segmented-control-item>
      </ui-segmented-control>
    </div>
  `
}

export { mount }
