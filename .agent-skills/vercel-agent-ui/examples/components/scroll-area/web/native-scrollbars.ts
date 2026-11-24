import "@ui-sdk/web/scroll-area"

const messages = [
  { from: "Hollis Grant", subject: "Launch checklist for Thursday" },
  { from: "Inès Moreau", subject: "Updated pricing page copy" },
  { from: "Kofi Mensah", subject: "Design review notes" },
  { from: "Wren Takahashi", subject: "Q4 roadmap draft" },
  { from: "Tomasz Wójcik", subject: "Re: Staging deploy failed" },
  { from: "Hollis Grant", subject: "Invoices for October" },
  { from: "Inès Moreau", subject: "Customer interview recordings" },
  { from: "Kofi Mensah", subject: "New icons for the dashboard" },
  { from: "Wren Takahashi", subject: "Offsite agenda" },
  { from: "Tomasz Wójcik", subject: "Database migration plan" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-scroll-area>
      <ui-scroll-area-viewport role="region" aria-label="Inbox">
        <ui-scroll-area-content>
          <ul>
            ${messages
              .map(
                (message) => `
                  <li>
                    ${message.from}
                    <span data-slot="hint">${message.subject}</span>
                  </li>`
              )
              .join("")}
          </ul>
        </ui-scroll-area-content>
      </ui-scroll-area-viewport>
    </ui-scroll-area>
  `
}

export { mount }
