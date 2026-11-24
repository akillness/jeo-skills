import { Separator } from "@ui-sdk/solid/separator"

function Example() {
  return (
    <div data-slot="stack">
      <div data-slot="stack">
        <h3>Hollis Grant</h3>
        <p data-slot="hint">hollis@example.com</p>
      </div>
      <Separator />
      <p>
        Designs the billing and onboarding flows, and reviews every new pricing
        page.
      </p>
    </div>
  )
}

export { Example }
