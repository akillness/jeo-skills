import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { Menubar } from "@ui-sdk/solid/menubar"

export function Example() {
  return (
    <div dir="rtl">
      <Menubar>
        <Menu>
          <MenuTrigger>ملف</MenuTrigger>
          <MenuContent>
            <MenuItem>علامة تبويب جديدة</MenuItem>
            <MenuSub>
              <MenuSubTrigger>
                مشاركة
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
              </MenuSubTrigger>
              <MenuSubContent>
                <MenuItem>البريد الإلكتروني</MenuItem>
                <MenuItem>الرسائل</MenuItem>
              </MenuSubContent>
            </MenuSub>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger>تحرير</MenuTrigger>
          <MenuContent>
            <MenuItem>تراجع</MenuItem>
            <MenuItem>إعادة</MenuItem>
          </MenuContent>
        </Menu>
      </Menubar>
    </div>
  )
}
