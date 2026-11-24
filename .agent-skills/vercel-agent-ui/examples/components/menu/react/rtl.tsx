import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  LinkIcon,
  MailIcon,
  ShareIcon,
  TrashIcon,
} from "lucide-react"
import * as React from "react"

export function Example() {
  const [action, setAction] = React.useState("")

  return (
    <div dir="rtl" data-slot="stack">
      <Menu onAction={setAction}>
        <MenuTrigger>ملف</MenuTrigger>
        <MenuContent>
          <MenuItem value="new" shortcut="mod+n">
            <FileIcon />
            جديد
          </MenuItem>
          <MenuItem value="open" shortcut="mod+o">
            <FolderIcon />
            فتح…
          </MenuItem>
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger>
              <ShareIcon />
              مشاركة
              <ChevronRightIcon />
            </MenuSubTrigger>
            <MenuSubContent>
              <MenuItem value="email">
                <MailIcon />
                البريد الإلكتروني
              </MenuItem>
              <MenuItem value="copy-link">
                <LinkIcon />
                نسخ الرابط
              </MenuItem>
            </MenuSubContent>
          </MenuSub>
          <MenuSeparator />
          <MenuItem value="delete">
            <TrashIcon />
            حذف
          </MenuItem>
        </MenuContent>
      </Menu>
      <output data-slot="output">
        {action ? `نُفّذ: ${action}` : "اختر عنصرًا"}
      </output>
    </div>
  )
}
