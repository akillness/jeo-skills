import { Button } from "@ui-sdk/react/button"

function Example() {
  return (
    <div data-slot="row">
      <Button render={<a href="#installation" />}>Get Started</Button>
      <Button disabled render={<a href="#changelog" />}>
        Changelog
      </Button>
    </div>
  )
}

export { Example }
