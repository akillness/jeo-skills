// The element a label names and activates: a control of this package, or the
// first native one. A radio is the control of a label for it alone. A label
// for its whole group finds the group first, since it comes first in the page.
const controlSelector =
  '[data-slot="slider"],[data-slot="color-picker"],[data-slot="date-input"],[data-slot="time-input"],input:not([type="hidden"]):not([aria-hidden="true"]),select,textarea,[data-slot="checkbox-group"],[role="checkbox"],[role="switch"],[role="radiogroup"],[role="radio"],[role="combobox"],[role="slider"],[role="spinbutton"],[role="textbox"],[role="listbox"],[data-slot="file-input-trigger"]'

// A slider with several thumbs is a group the label names, ahead of its
// thumbs. One thumb is the control itself. Checked here rather than with
// `:has()`, which would make the whole selector throw where it's unsupported.
const isSingleSlider = (el: HTMLElement) =>
  el.matches('[data-slot="slider"]') &&
  !el.querySelector('[data-slot="slider-thumb"][data-index="1"]')

const isControl = (el: HTMLElement) =>
  el.matches(controlSelector) && !isSingleSlider(el)

/**
 * The control at or inside `root` that a label names: `root` itself when it's
 * one, else a ui-sdk control inside it, or its first native one. `accepts`
 * skips controls that belong to something else, like a nested field.
 */
function findControl(
  root: HTMLElement,
  accepts: (el: HTMLElement) => boolean = () => true
) {
  if (isControl(root)) {
    return root
  }
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>(controlSelector)
  )) {
    if (accepts(el) && !isSingleSlider(el)) {
      return el
    }
  }
}

/** Activates a control the way a native label does, and prevents the press's own default. */
function activateControl(control: HTMLElement, event?: Event) {
  const role = control.getAttribute("role")
  const checkable =
    role === "checkbox" ||
    role === "switch" ||
    role === "radio" ||
    (control instanceof HTMLInputElement &&
      (control.type === "checkbox" || control.type === "radio"))
  // A native label clicks a plain button it names, like a FileInputTrigger's.
  const plainButton = control instanceof HTMLButtonElement && !role
  if (checkable || plainButton || role === "radiogroup") {
    control.click()
  }
  // A group, like a range slider, focuses its first control.
  else if (role === "group") {
    ;(
      control.querySelector<HTMLElement>("input:not([type='hidden'])") ??
      control.querySelector<HTMLElement>('[tabindex="0"]')
    )?.focus()
  } else {
    control.focus()
  }
  event?.preventDefault()
}

export { activateControl, findControl }
