import { Button } from "@ui-sdk/solid/button"

function Example() {
  return (
    <div data-slot="row">
      <Button render={(props) => <a {...props} href="#installation" />}>
        Get Started
      </Button>
      <Button disabled render={(props) => <a {...props} href="#changelog" />}>
        Changelog
      </Button>
    </div>
  )
}

export { Example }
