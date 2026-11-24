import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createConfirm,
  type ConfirmOptions,
} from "@ui-sdk/solid/alert-dialog"
import { OverlayHost, createOverlays } from "@ui-sdk/solid/overlays"
import { Toast, ToastTitle, createToaster } from "@ui-sdk/solid/toast"
import { createSignal, For, onCleanup, Show } from "solid-js"

function Example() {
  const overlays = createOverlays()
  const toast = createToaster({ overlays })
  const confirm = createConfirm({ overlays })
  const [projects, setProjects] = createSignal(["Acme", "Globex", "Initech"])
  let reset: HTMLButtonElement | undefined
  onCleanup(() => {
    toast.dismiss()
  })

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
    ;(next ?? reset)?.focus()
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
        <For each={projects()}>
          {(name) => (
            <li data-slot="row">
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
          )}
        </For>
        <Show when={projects().length === 0}>
          <li data-slot="row">All projects deleted.</li>
        </Show>
      </ul>
      <OverlayHost
        overlays={overlays}
        toast={{
          children: () => (
            <Toast>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                data-show="success"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m16 9-5.5 5.5L8 12" />
              </svg>
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
