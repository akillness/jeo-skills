import "@ui-sdk/web/menubar"
import "@ui-sdk/web/menu"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menubar orientation="vertical">
      ${["Inbox", "Drafts", "Archive"]
        .map(
          (label) => `
            <ui-menu>
              <ui-menu-trigger>
                <button>${label}</button>
              </ui-menu-trigger>
              <ui-menu-content>
                <ui-menu-item>Open ${label}</ui-menu-item>
                <ui-menu-item>Mark all as read</ui-menu-item>
              </ui-menu-content>
            </ui-menu>
          `
        )
        .join("")}
    </ui-menubar>
  `
}

export { mount }
