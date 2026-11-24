import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"

export function Example() {
  return (
    <div data-slot="stack" dir="rtl">
      <label data-slot="label">
        <Checkbox>
          <CheckboxIndicator>
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
          </CheckboxIndicator>
        </Checkbox>
        قبول الشروط والأحكام
      </label>
      <label data-slot="label">
        <Checkbox defaultChecked>
          <CheckboxIndicator>
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
          </CheckboxIndicator>
        </Checkbox>
        تفعيل الإشعارات
      </label>
    </div>
  )
}
