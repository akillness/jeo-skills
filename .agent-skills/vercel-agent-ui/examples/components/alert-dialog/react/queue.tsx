"use client"

import * as React from "react"
import { useLog } from "../../../shared/react/log"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createConfirm,
} from "@ui-sdk/react/alert-dialog"

function Example() {
  const [confirm] = React.useState(() => createConfirm<{ name: string }>())
  const log = useLog()

  async function review() {
    const acme = confirm({ name: "Acme" })
    const globex = confirm({ name: "Globex" })
    const [first, second] = await Promise.all([acme, globex])
    log(`Acme: ${first ? "confirmed" : "canceled"}`)
    log(`Globex: ${second ? "confirmed" : "canceled"}`)
  }

  return (
    <div data-slot="stack">
      <button type="button" onClick={review}>
        Review Two Projects
      </button>
      <AlertDialog controller={confirm.controller}>
        <AlertDialogBackdrop />
        <AlertDialogContent<{
          name: string
        }>>
          {(state) => (
            <>
              <div data-slot="stack">
                <AlertDialogTitle>
                  Archive {state.payload?.name}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Archived projects leave the active list. You can restore them
                  later.
                </AlertDialogDescription>
              </div>
              <div data-slot="row">
                <AlertDialogClose>Cancel</AlertDialogClose>
                <AlertDialogClose data-variant="solid" value="confirm">
                  Archive
                </AlertDialogClose>
              </div>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { Example }
