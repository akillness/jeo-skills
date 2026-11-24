<script lang="ts">
  import {
    Drawer,
    DrawerBackdrop,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
    DrawerTrigger,
  } from "@ui-sdk/svelte/drawer"

  const links = ["الرئيسية", "الطلبات", "المنتجات", "العملاء", "الإعدادات"]
</script>

<div dir="rtl">
  <Drawer side="start">
    <DrawerTrigger>القائمة</DrawerTrigger>
    <DrawerBackdrop />
    <DrawerContent>
      <div data-slot="stack">
        <DrawerTitle>القائمة</DrawerTitle>
        <DrawerDescription>اسحبها نحو حافتها لإغلاقها.</DrawerDescription>
      </div>
      <nav aria-label="الأقسام">
        <ul>
          {#each links as link (link)}
            <li>
              <a href="https://example.com">
                {link}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
      <DrawerClose data-variant="solid">إغلاق</DrawerClose>
    </DrawerContent>
  </Drawer>
</div>
