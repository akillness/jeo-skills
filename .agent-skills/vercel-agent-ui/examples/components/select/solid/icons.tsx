import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIcon,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
  SelectValueIcon,
} from "@ui-sdk/solid/select"

function Example() {
  return (
    <Field>
      <FieldLabel>Text alignment</FieldLabel>
      <Select defaultValue="start">
        <SelectTrigger>
          <SelectValueIcon />
          <SelectValue />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="start">
            <SelectItemIcon mirror>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 5H3" />
                <path d="M15 12H3" />
                <path d="M17 19H3" />
              </svg>
            </SelectItemIcon>
            Start
            <SelectItemIndicator>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
          <SelectItem value="center">
            <SelectItemIcon>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 5H3" />
                <path d="M17 12H7" />
                <path d="M19 19H5" />
              </svg>
            </SelectItemIcon>
            Center
            <SelectItemIndicator>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
          <SelectItem value="end">
            <SelectItemIcon mirror>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 5H3" />
                <path d="M21 12H9" />
                <path d="M21 19H7" />
              </svg>
            </SelectItemIcon>
            End
            <SelectItemIndicator>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
