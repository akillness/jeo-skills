import "@ui-sdk/web/dialog"

const paragraphs = [
  "These terms govern your use of the service. By creating an account, you agree to them and to the privacy policy that explains how we handle your data.",
  "You're responsible for the content you upload and for keeping your password safe. Tell us right away if you think someone else has used your account.",
  "We may change the service, and these terms, as the product grows. When a change affects you, we'll let you know by email at least 30 days before it takes effect.",
  "You can stop using the service at any time. We'll keep your data for 30 days after you close your account, so you can export it, and then delete it.",
  "The service is provided as is. To the extent the law allows, we aren't liable for indirect damages, lost profits or lost data.",
  "If you have questions about these terms, write to us. We read every message and reply within two working days.",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger>
        <button>Scrollable Content</button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content initial-focus="content" hidden>
        <div data-slot="stack">
          <ui-dialog-title>Terms of service</ui-dialog-title>
          <ui-dialog-description>Please read before you continue.</ui-dialog-description>
        </div>
        <div data-slot="scroll">
          ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        </div>
        <div data-slot="row">
          <ui-dialog-close>
            <button>Decline</button>
          </ui-dialog-close>
          <ui-dialog-close value="accept">
            <button data-variant="solid">Accept</button>
          </ui-dialog-close>
        </div>
      </ui-dialog-content>
    </ui-dialog>
  `
}

export { mount }
