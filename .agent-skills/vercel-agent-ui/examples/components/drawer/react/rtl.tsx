import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer"

const links = ["الرئيسية", "الطلبات", "المنتجات", "العملاء", "الإعدادات"]

export function Example() {
  return (
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
              {links.map((link) => (
                <li key={link}>
                  <a href="https://example.com">{link}</a>
                </li>
              ))}
            </ul>
          </nav>
          <DrawerClose data-variant="solid">إغلاق</DrawerClose>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
