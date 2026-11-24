import "@ui-sdk/web/field"
import "@ui-sdk/web/segmented-control"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Vertical alignment</ui-field-label>
      <ui-segmented-control orientation="vertical" default-value="middle">
        <ui-segmented-control-indicator></ui-segmented-control-indicator>
        <ui-segmented-control-item value="top">Top</ui-segmented-control-item>
        <ui-segmented-control-item value="middle">Middle</ui-segmented-control-item>
        <ui-segmented-control-item value="bottom">Bottom</ui-segmented-control-item>
      </ui-segmented-control>
    </ui-field>
  `
}

export { mount }
