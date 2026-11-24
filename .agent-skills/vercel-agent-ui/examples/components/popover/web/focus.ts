import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <ui-popover>
        <ui-popover-trigger>
          <button>Rename</button>
        </ui-popover-trigger>
        <ui-popover-content>
          <ui-popover-title>Rename file</ui-popover-title>
          <ui-popover-description>Focus starts in the first field.</ui-popover-description>
          <ui-field>
            <ui-field-label>Name</ui-field-label>
            <ui-input>
              <input value="Q3 roadmap.pdf" />
            </ui-input>
          </ui-field>
          <div data-slot="row">
            <ui-popover-close>
              <button>Cancel</button>
            </ui-popover-close>
            <ui-popover-close>
              <button data-variant="solid">Save</button>
            </ui-popover-close>
          </div>
        </ui-popover-content>
      </ui-popover>
      <ui-popover>
        <ui-popover-trigger>
          <button>Publish</button>
        </ui-popover-trigger>
        <ui-popover-content initial-focus="[data-autofocus]">
          <ui-popover-title>Publish changes?</ui-popover-title>
          <ui-popover-description>Focus starts on Publish, not Cancel.</ui-popover-description>
          <div data-slot="row">
            <ui-popover-close>
              <button>Cancel</button>
            </ui-popover-close>
            <ui-popover-close>
              <button data-autofocus data-variant="solid">Publish</button>
            </ui-popover-close>
          </div>
        </ui-popover-content>
      </ui-popover>
      <ui-popover>
        <ui-popover-trigger>
          <button>Status</button>
        </ui-popover-trigger>
        <ui-popover-content initial-focus="none" final-focus="none">
          <ui-popover-title>All systems normal</ui-popover-title>
          <ui-popover-description>Focus stays on the trigger.</ui-popover-description>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
}

export { mount }
