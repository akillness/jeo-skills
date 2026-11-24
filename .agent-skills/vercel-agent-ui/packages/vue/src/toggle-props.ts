import { optionalBoolean } from "./use-primitive"

// Props a checkbox and a switch share.
const toggleProps = {
  disabled: optionalBoolean,
  readOnly: optionalBoolean,
  required: optionalBoolean,
  name: String,
  value: String,
  form: String,
  debug: optionalBoolean,
}

export { toggleProps }
