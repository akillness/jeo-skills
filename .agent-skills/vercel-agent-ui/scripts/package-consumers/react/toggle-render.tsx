import { Toggle } from "@ui-sdk/react/toggle"

// `state` has no annotation: under `strict` it fails as an implicit `any`
// unless the packed types give the render function the toggle's state.
function BoldToggle() {
  return (
    <Toggle
      aria-label="Bold"
      defaultPressed
      render={(props, state) => (
        <button {...props} data-on={state.pressed ? "" : undefined} />
      )}
    />
  )
}

export { BoldToggle }
