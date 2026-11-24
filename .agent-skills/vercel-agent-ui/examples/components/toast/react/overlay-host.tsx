import * as React from "react"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createConfirm,
  type ConfirmOptions,
} from "@ui-sdk/react/alert-dialog"
import { OverlayHost, createOverlays } from "@ui-sdk/react/overlays"
import { Toast, ToastTitle, createToaster } from "@ui-sdk/react/toast"
import { CircleCheckIcon } from "lucide-react"

function Example() {
  const [overlays] = React.useState(() => createOverlays())
  const [toast] = React.useState(() => createToaster({ overlays }))
  const [confirm] = React.useState(() => createConfirm({ overlays }))
  const [projects, setProjects] = React.useState(["Acme", "Globex", "Initech"])
  const reset = React.useRef<HTMLButtonElement>(null)
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

  async function remove(name: string, button: HTMLButtonElement) {
    const confirmed = await confirm({
      title: `Delete ${name}?`,
      description:
        "The project and its files will be deleted for everyone on your team.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    })
    if (!confirmed) {
      return
    }
    const row = button.closest("li")
    const next = (
      row?.nextElementSibling ?? row?.previousElementSibling
    )?.querySelector("button")
    ;(next ?? reset.current)?.focus()
    setProjects((list) => list.filter((project) => project !== name))
    toast.success(`${name} deleted`, { priority: "assertive" })
  }

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          ref={reset}
          type="button"
          onClick={() => setProjects(["Acme", "Globex", "Initech"])}
        >
          Reset Projects
        </button>
      </div>
      <ul data-slot="list" aria-label="Projects">
        {projects.map((name) => (
          <li data-slot="row" key={name}>
            {name}
            <button
              type="button"
              data-size="sm"
              aria-label={`Delete ${name}`}
              onClick={(event) => remove(name, event.currentTarget)}
            >
              Delete
            </button>
          </li>
        ))}
        {projects.length === 0 && (
          <li data-slot="row">All projects deleted.</li>
        )}
      </ul>
      <OverlayHost
        overlays={overlays}
        toast={{
          children: () => (
            <Toast>
              <CircleCheckIcon data-show="success" aria-hidden="true" />
              <ToastTitle />
            </Toast>
          ),
        }}
      />
      <AlertDialog controller={confirm.controller}>
        <AlertDialogBackdrop />
        <AlertDialogContent<ConfirmOptions>>
          {(state) => (
            <>
              <div data-slot="stack">
                <AlertDialogTitle>{state.payload?.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {state.payload?.description}
                </AlertDialogDescription>
              </div>
              <div data-slot="row">
                <AlertDialogClose>
                  {state.payload?.cancelLabel}
                </AlertDialogClose>
                <AlertDialogClose data-variant="solid" value="confirm">
                  {state.payload?.confirmLabel}
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
