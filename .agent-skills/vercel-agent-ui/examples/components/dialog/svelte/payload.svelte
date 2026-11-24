<script lang="ts">
  import {
    createDialogController,
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    type DialogContentState,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { useLog } from "../../../shared/svelte/log"

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

  const reminder = createDialogController<Invoice, "send">()
  const log = useLog()

  async function remindFromCode() {
    const { reason, returnValue } = await reminder.open({
      payload: invoices[2],
    })
    log(
      returnValue === "send" ? "Reminder sent from code" : `Closed (${reason})`
    )
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={remindFromCode}>Open from Code</button>
  </div>
  <ul data-slot="list">
    {#each invoices as invoice (invoice.id)}
      <li data-slot="row">
        {invoice.customer}
        <span data-slot="hint">{invoice.amount} · {invoice.status}</span>
        <DialogTrigger
          controller={reminder}
          payload={invoice}
          disabled={invoice.status === "Paid"}
          aria-label={`Remind ${invoice.customer}`}
        >
          Remind
        </DialogTrigger>
      </li>
    {/each}
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
    <DialogContent>
      {#snippet children(state: DialogContentState<Invoice>)}
        <div data-slot="stack">
          <DialogTitle>Remind {state.payload?.customer}</DialogTitle>
          <DialogDescription>
            {state.payload?.id} for {state.payload?.amount} is due. We'll email the
            billing contact.
          </DialogDescription>
        </div>
        <div data-slot="row">
          <DialogClose>Cancel</DialogClose>
          <DialogClose data-variant="solid" value="send"
            >Send reminder</DialogClose
          >
        </div>
      {/snippet}
    </DialogContent>
  </Dialog>
</div>
