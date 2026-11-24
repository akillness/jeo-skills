// A microtask, since Vue binds mid-hydration and a write then leaves a part with the
// server's attributes. React runs them at the end of its commit (`runBindWrites`), so
// a mount inside `act()` leaves no update behind.
const pending = new Set<() => void>()

function afterBind(write: () => void) {
  pending.add(write)
  queueMicrotask(() => {
    if (pending.delete(write)) {
      write()
    }
  })
}

function runBindWrites() {
  for (const write of pending) {
    pending.delete(write)
    write()
  }
}

export { afterBind, runBindWrites }
