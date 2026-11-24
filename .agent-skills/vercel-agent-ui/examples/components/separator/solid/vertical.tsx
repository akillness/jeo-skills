import { Separator } from "@ui-sdk/solid/separator"

function Example() {
  return (
    <nav aria-label="Legal" data-slot="row">
      <a href="#">Privacy</a>
      <Separator orientation="vertical" />
      <a href="#">Terms</a>
      <Separator orientation="vertical" />
      <a href="#">Cookies</a>
    </nav>
  )
}

export { Example }
