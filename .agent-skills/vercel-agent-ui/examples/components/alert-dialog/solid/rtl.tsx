import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/solid/alert-dialog"

export function Example() {
  return (
    <div dir="rtl">
      <AlertDialog>
        <AlertDialogTrigger>حذف الحساب</AlertDialogTrigger>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <div data-slot="stack">
            <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء. سيؤدي إلى حذف حسابك نهائيًا.
            </AlertDialogDescription>
          </div>
          <div data-slot="row">
            <AlertDialogClose>إلغاء</AlertDialogClose>
            <AlertDialogClose data-variant="solid" value="confirm">
              متابعة
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
