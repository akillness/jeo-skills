import "@ui-sdk/web/drawer"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/textarea"

const messages = [
  { from: "Inès", text: "The proofs are back from the printer." },
  { from: "Kofi", text: "Lunch on Thursday?" },
  { from: "Wren", text: "Pushed the fix for the release build." },
  { from: "Tomasz", text: "Can you review the launch checklist?" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-drawer>
      <div>
        <ui-drawer-outlet>
          <div data-slot="row">
            <span>Inbox</span>
            <ui-drawer-trigger><button data-variant="solid">Compose</button></ui-drawer-trigger>
          </div>
          <ul data-slot="list">
            ${messages
              .map(
                (message) => `<li>
                  <div>${message.from}</div>
                  <div data-slot="hint">${message.text}</div>
                </li>`
              )
              .join("")}
          </ul>
        </ui-drawer-outlet>
      </div>
      <ui-drawer-backdrop hidden></ui-drawer-backdrop>
      <ui-drawer-content hidden>
        <div data-slot="grip" aria-hidden="true"></div>
        <div data-slot="stack">
          <ui-drawer-title>New message</ui-drawer-title>
          <ui-drawer-description>Write a quick note to the team.</ui-drawer-description>
        </div>
        <ui-field>
          <ui-field-label>To</ui-field-label>
          <ui-input>
            <input value="Design team" />
          </ui-input>
        </ui-field>
        <ui-field>
          <ui-field-label>Message</ui-field-label>
          <ui-textarea>
            <textarea placeholder="What's new?"></textarea>
          </ui-textarea>
        </ui-field>
        <div data-slot="stack">
          <ui-drawer-close value="send"><button data-variant="solid">Send</button></ui-drawer-close>
        </div>
      </ui-drawer-content>
    </ui-drawer>
  `
  root.querySelector("ui-drawer-outlet")!.keyframes = {
    scale: [1, 0.94],
    borderRadius: ["0px", "24px"],
  }
}

export { mount }
