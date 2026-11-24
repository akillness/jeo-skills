import { Button } from "@ui-sdk/solid/button"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return <Button onClick={() => log("Pressed")}>Button</Button>
}

export { Example }
