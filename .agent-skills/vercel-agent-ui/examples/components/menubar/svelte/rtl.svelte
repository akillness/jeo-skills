<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import {
    Menu,
    MenuContent,
    MenuItem,
    MenuSub,
    MenuSubContent,
    MenuSubTrigger,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { Menubar } from "@ui-sdk/svelte/menubar"
</script>

<div dir="rtl">
  <Menubar>
    <Menu>
      <MenuTrigger>ملف</MenuTrigger>
      <MenuContent>
        <MenuItem>علامة تبويب جديدة</MenuItem>
        <MenuSub>
          <MenuSubTrigger>
            مشاركة
            <ChevronRightIcon />
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
