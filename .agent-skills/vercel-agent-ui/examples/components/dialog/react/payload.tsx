"use client"

import * as React from "react"
import {
  createDialogController,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import { useLog } from "../../../shared/react/log"

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

function Example() {
  const [reminder] = React.useState(() =>
    createDialogController<Invoice, "send">()
  )
  const log = useLog()

  async function remindFromCode() {
    const { reason, returnValue } = await reminder.open({
      payload: invoices[2],
    })
    log(
      returnValue === "send" ? "Reminder sent from code" : `Closed (${reason})`
    )
  }

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={remindFromCode}>
          Open from Code
        </button>
      </div>
      <ul data-slot="list">
        {invoices.map((invoice) => (
          <li data-slot="row" key={invoice.id}>
            {invoice.customer}
            <span data-slot="hint">
              {invoice.amount} · {invoice.status}
            </span>
            <DialogTrigger
              controller={reminder}
              payload={invoice}
              disabled={invoice.status === "Paid"}
              aria-label={`Remind ${invoice.customer}`}
            >
              Remind
            </DialogTrigger>
          </li>
        ))}
      </ul>
      <Dialog
        controller={reminder}
        onOpenChange={(open, details) => {
          if (!open && details.returnValue === "send") {
            log("Reminder sent")
          }
        }}
      >
        <DialogBackdrop />
        <DialogContent<Invoice>>
          {(state) => {
            const invoice = state.payload
            return (
              <>
                <div data-slot="stack">
                  <DialogTitle>Remind {invoice?.customer}</DialogTitle>
                  <DialogDescription>
                    {invoice?.id} for {invoice?.amount} is due. We'll email the
                    billing contact.
                  </DialogDescription>
                </div>
                <div data-slot="row">
                  <DialogClose>Cancel</DialogClose>
                  <DialogClose data-variant="solid" value="send">
                    Send reminder
                  </DialogClose>
                </div>
              </>
            )
          }}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
