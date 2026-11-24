// Checked by svelte-check, not run: a part's own props replace the element's
// attributes of the same name, and the element's other attributes keep their types.
import type { ComponentProps } from "svelte"
import { Button } from "../../src/button"
import { DatePickerPreset } from "../../src/date-picker"

const preset: ComponentProps<typeof DatePickerPreset> = {
  value: ["2026-01-01", "2026-01-07"],
  // @ts-expect-error A preset's `disabled` is the button's boolean.
  disabled: "x",
}

const button: ComponentProps<typeof Button> = {
  // @ts-expect-error Button's `onclick` hands its handler the press's details second.
  onclick: (_event: MouseEvent, details: string) => details,
}

export { button, preset }
