import "@ui-sdk/web/dialog"
import type { UiDialogElement } from "@ui-sdk/web/dialog"
import { log } from "../../../shared/web/log"

type Invoice = {
  id: string
  customer: string
  amount: string
  status: "Paid" | "Due"
}

const invoices: Invoice[] = [
  { id: "INV-001", customer: "Acme", amount: "$250.00", status: "Paid" },
  { id: "INV-002", customer: "Globex", amount: "$150.00", status: "Due" },
  { id: "INV-003", customer: "Initech", amount: "$350.00", status: "Due" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Open from Code</button>
      </div>
      <ul data-slot="list"></ul>
      <ui-dialog id="invoice-reminder">
        <ui-dialog-backdrop hidden></ui-dialog-backdrop>
        <ui-dialog-content hidden>
          <div data-slot="stack">
            <ui-dialog-title></ui-dialog-title>
            <ui-dialog-description></ui-dialog-description>
          </div>
          <div data-slot="row">
            <ui-dialog-close>
              <button>Cancel</button>
            </ui-dialog-close>
            <ui-dialog-close value="send">
              <button data-variant="solid">Send reminder</button>
            </ui-dialog-close>
          </div>
        </ui-dialog-content>
      </ui-dialog>
    </div>
  `
  const list = root.querySelector("ul")!
  const dialog = root.querySelector<UiDialogElement<Invoice>>("ui-dialog")!
  for (const invoice of invoices) {
    const row = document.createElement("li")
    row.dataset.slot = "row"
    row.innerHTML = `${invoice.customer}<span data-slot="hint">${invoice.amount} · ${invoice.status}</span>`
    const trigger = Object.assign(document.createElement("ui-dialog-trigger"), {
      payload: invoice,
    })
    trigger.setAttribute("for", "invoice-reminder")
    if (invoice.status === "Paid") {
      trigger.setAttribute("disabled", "")
    }
    trigger.innerHTML = `<button aria-label="Remind ${invoice.customer}">Remind</button>`
    row.append(trigger)
    list.append(row)
  }
  dialog.addEventListener("payloadchange", (event) => {
    const invoice = event.detail.value
    root.querySelector("ui-dialog-title")!.textContent =
      `Remind ${invoice?.customer}`
    root.querySelector("ui-dialog-description")!.textContent =
      `${invoice?.id} for ${invoice?.amount} is due. We'll email the billing contact.`
  })
  dialog.addEventListener("openchange", (event) => {
    if (!event.detail.value && event.detail.returnValue === "send") {
      log(root, "Reminder sent")
    }
  })
  root
    .querySelector("[data-slot=controls] button")!
    .addEventListener("click", async () => {
      const { reason, returnValue } = await dialog.api.open({
        payload: invoices[2],
      })
      log(
        root,
        returnValue === "send"
          ? "Reminder sent from code"
          : `Closed (${reason})`
      )
    })
}

export { mount }
