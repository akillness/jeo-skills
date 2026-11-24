import { Button } from "@ui-sdk/react/button"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return <Button onClick={() => log("Pressed")}>Button</Button>
}

export { Example }
