/** Props a checkbox and a switch share. */
type ToggleProps = {
  /** Disables it like a native control: it can't be focused or changed, and isn't submitted. */
  disabled?: boolean
  /** Keeps it focusable and submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission until it's checked, with the browser's own message. */
  required?: boolean
  /** The name it submits under. Without one, it submits nothing. */
  name?: string
  /** What it submits while checked. */
  value?: string
  /** The id of a form to belong to, when it isn't inside that form. */
  form?: string
  /** Logs every state change with its reason. */
  debug?: boolean
}

export { type ToggleProps }
