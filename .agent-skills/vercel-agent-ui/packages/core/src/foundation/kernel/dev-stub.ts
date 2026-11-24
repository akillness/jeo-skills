// What production builds get for `#dev`: the same exports, doing nothing, so
// warnings and the devtools hook cost no bytes. See `dev.ts`.
import type { DevEvent } from "./dev"

// Typed as boolean so code behind `if (dev)` type-checks as reachable. Bundlers
// still inline the `false` and drop that code with its arguments.
const dev: boolean = false

function emit(_event: DevEvent) {}

function warn(
  _message: string,
  _from?: { component: string; id?: string },
  _detail?: unknown
) {}

function note(
  _message: string,
  _from?: { component: string; id?: string },
  _detail?: unknown
) {}

function warnMissing<T>(slots: T, _from: { component: string; id?: string }) {
  return slots
}

function exposeShortcuts(_list: () => unknown[]) {}

function checkRoles(
  _slots: Record<string, object>,
  _from: { component: string }
) {}

function checkRole(
  _definition: object,
  _slot: string,
  _own: Record<string, unknown> | undefined,
  _role: unknown,
  _from: { component: string; id?: string },
  _live?: Record<string, unknown>
) {}

function checkFocus(
  _focus: unknown,
  _slot: string,
  _el: HTMLElement,
  _from: { component: string; id?: string }
) {}

function expectControlled(
  _instance: object,
  _info: {
    component: string
    id: string
    key: string
    value: unknown
    reason: string
    source: string
  },
  _current: () => unknown
) {}

function forgetControlled(_instance: object) {}

function heardControlled(_instance: object, _options: object) {}

function measured(read: () => void) {
  read()
}

const isMeasuring = () => false

function checkEvent(
  _reason: string,
  _event: Event | undefined,
  _from: { component: string; id?: string }
) {}

function checkPrevented(
  _name: string,
  _prevented: boolean,
  _details: { event?: Event; canceled: boolean },
  _from: { component: string; id?: string }
) {}

function checkMarks(_elements: Element[], _marks: string[]) {}

function checkControlled(
  _from: { component: string; id: string },
  _keys: string[],
  _options: object
) {}

export {
  checkControlled,
  checkFocus,
  checkRole,
  checkRoles,
  checkEvent,
  checkMarks,
  checkPrevented,
  dev,
  emit,
  expectControlled,
  exposeShortcuts,
  forgetControlled,
  heardControlled,
  isMeasuring,
  measured,
  note,
  warn,
  warnMissing,
}
export type { DevEvent } from "./dev"
