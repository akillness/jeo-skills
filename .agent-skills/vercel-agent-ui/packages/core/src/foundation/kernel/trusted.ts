// Whether a person caused an event. A DOM made for tests can't mark the events
// it dispatches as trusted, so the testing kit swaps this check for one that
// also trusts the events it sends. Apps never call the swap, so they bundle
// only the plain check.
let trusted = (event: Event) => event.isTrusted

// Trusts the events in `sent` too, for the testing kit.
function trustSent(sent: WeakSet<Event>) {
  trusted = (event) => event.isTrusted || sent.has(event)
}

export { trusted, trustSent }
