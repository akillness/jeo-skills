import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover>
      <ui-popover-trigger shortcut="mod+u">
        <button>
          <span data-hide="open">Show Updates</span>
          <span data-show="open">Hide Updates</span>
          <ui-popover-shortcut></ui-popover-shortcut>
        </button>
      </ui-popover-trigger>
      <ui-popover-content>
        <ui-popover-title as-child><h3>Updates</h3></ui-popover-title>
        <ui-popover-description>Version 2.4 adds threaded comments.</ui-popover-description>
        <ui-popover-close>
          <a href="#">Read the Changelog</a>
        </ui-popover-close>
      </ui-popover-content>
    </ui-popover>
  `
}

export { mount }
