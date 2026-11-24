// Compiled by `pnpm typecheck`, never run. An element's type has the
// properties and `api` it has at runtime.
import "../src/entries/radio"
import "../src/entries/toast"

const radio = document.createElement("ui-radio")
radio.value = "pro"
radio.disabled = true

const region = document.createElement("ui-toast-region")
region.api.pause("review")
region.api.resume("review")
region.api.focus()
