import { Button } from "@ui-sdk/solid/button"

export function Example() {
  return (
    <div data-slot="row" dir="rtl">
      <Button>
        متابعة
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Button>
      <Button>إلغاء</Button>
    </div>
  )
}
