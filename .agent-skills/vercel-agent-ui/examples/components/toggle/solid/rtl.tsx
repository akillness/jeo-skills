import { Toggle, ToggleIcon } from "@ui-sdk/solid/toggle"

export function Example() {
  return (
    <div dir="rtl">
      <Toggle>
        <ToggleIcon data-variant="fill">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" />
          </svg>
        </ToggleIcon>
        إشارة مرجعية
      </Toggle>
    </div>
  )
}
