// Defines Dialog and Alert Dialog on the api and parts they share. What
// only Dialog has, its presentation, comes in as an extension, so an alert
// dialog doesn't carry it.
import { initialApple } from "../../foundation/platform/platform"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PropSchema,
  SlotFactory,
} from "../../foundation/kernel/primitive-types"
import type { Store } from "../../foundation/kernel/store"
import type {
  AlertDialogController,
  DialogController,
  DialogSharedOptions,
} from "./dialog"
import {
  dialogApi,
  type DialogApi,
  type DialogRules,
  type DialogState,
} from "./dialog-api"
import { dialogSlots } from "./dialog-parts"

function defineDialog<
  Options extends DialogSharedOptions & {
    modal?: boolean | "trap-focus"
    controller?: DialogController<any, any> | AlertDialogController<any, any>
  },
  Extra extends object = {},
>(
  name: string,
  alert: boolean,
  // The schema of the options beyond the shared ones.
  options: PropSchema<Omit<Options, keyof DialogSharedOptions>>,
  extension?: {
    /** Behavior beyond the shared api. */
    rules: (store: Store<DialogState>, options: () => Options) => DialogRules
    /** Parts beyond the shared ones. */
    slots: (slot: SlotFactory<DialogState, DialogApi>) => Extra
  }
) {
  return definePrimitive({
    name,
    // Spread from the shared and own schemas, which TypeScript can't check
    // against `Options` while it's generic. Each half `satisfies` its type.
    options: {
      container: "value",
      open: "boolean",
      defaultOpen: "boolean",
      onOpenChangeComplete: "callback",
      dismissible: "boolean",
      onDismissAttempt: "callback",
      persistentElements: "list",
      pendingAnnouncement: "string",
      ...options,
    } as PropSchema<Options>,
    state: (options: Options): DialogState => ({
      open: options.defaultOpen ?? false,
      mounted: options.open ?? options.defaultOpen ?? false,
      // Unknown until the parts bind: the server names an open dialog by its title.
      titled: null,
      described: false,
      trigger: null,
      payload: undefined,
      modal: true,
      nested: false,
      stack: 0,
      pending: null,
      errors: {},
      apple: initialApple(),
      presentation: "dialog",
    }),
    sync: (options) => ({
      ...(options.open !== undefined && { open: options.open }),
      // An alert dialog is always modal.
      modal: alert ? true : (options.modal ?? true),
    }),
    api: (context) =>
      dialogApi(
        context,
        alert,
        extension?.rules(context.store, context.options)
      ),
    // Without an extension there are no extra parts, and spreading undefined adds none.
    slots: (slot) => ({
      ...dialogSlots(slot, { name }),
      ...(extension?.slots(slot) as Extra),
    }),
    agent: { actions: ["setOpen"] },
  })
}

export { defineDialog }
