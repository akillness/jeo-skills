import "@ui-sdk/web/field"
import "@ui-sdk/web/segmented-control"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>View</ui-field-label>
      <ui-segmented-control default-value="list">
        <ui-segmented-control-indicator></ui-segmented-control-indicator>
        <ui-segmented-control-item value="list">List</ui-segmented-control-item>
        <ui-segmented-control-item value="grid">Grid</ui-segmented-control-item>
        <ui-segmented-control-item value="board">Board</ui-segmented-control-item>
      </ui-segmented-control>
    </ui-field>
  `
}

export { mount }
