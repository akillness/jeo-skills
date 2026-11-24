import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"

const toast = createToaster()

export function Example() {
  return (
    <>
      <button
        onClick={() =>
          toast({
            title: "Event has been created",
            description: "Monday, January 3rd at 6:00pm",
          })
        }
      >
        Show toast
      </button>
      <ToastRegion toaster={toast}>
        {(item) => (
          <Toast>
            <div data-slot="stack">
              <ToastTitle />
              <ToastDescription />
            </div>
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}
