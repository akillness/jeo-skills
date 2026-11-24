import { Button } from "@ui-sdk/react/button"
import { ChevronRightIcon } from "lucide-react"

export function Example() {
  return (
    <div data-slot="row" dir="rtl">
      <Button>
        متابعة
        <ChevronRightIcon />
      </Button>
      <Button>إلغاء</Button>
    </div>
  )
}
