import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="popover-frame">
      <div data-slot="popover-corner">
        <ui-popover>
          <ui-popover-trigger>
            <button>Feedback</button>
          </ui-popover-trigger>
          <ui-popover-content inline hidden>
            <ui-popover-title>Send feedback</ui-popover-title>
            <ui-popover-description>The panel sits in the corner box, above its trigger.</ui-popover-description>
            <div data-slot="row">
              <ui-popover-close>
                <button>Close</button>
              </ui-popover-close>
            </div>
          </ui-popover-content>
        </ui-popover>
      </div>
    </div>
  `
}

export { mount }
