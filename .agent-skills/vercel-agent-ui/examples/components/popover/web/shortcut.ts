import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover>
      <ui-popover-trigger shortcut="mod+i">
        <button>
          Invite
          <ui-popover-shortcut></ui-popover-shortcut>
        </button>
      </ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title>Invite people</ui-popover-title>
        <ui-popover-description>They'll get an email with a link to join.</ui-popover-description>
        <ui-field>
          <ui-field-label>Email</ui-field-label>
          <ui-input>
            <input type="email" placeholder="wren@example.com" />
          </ui-input>
        </ui-field>
        <div data-slot="row">
          <ui-popover-close>
            <button>Cancel</button>
          </ui-popover-close>
          <ui-popover-close>
            <button data-variant="solid">Send Invite</button>
          </ui-popover-close>
        </div>
      </ui-popover-content>
    </ui-popover>
  `
}

export { mount }
