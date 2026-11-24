import "@ui-sdk/web/drawer"

const links = ["الرئيسية", "الطلبات", "المنتجات", "العملاء", "الإعدادات"]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-drawer side="start">
        <ui-drawer-trigger><button>القائمة</button></ui-drawer-trigger>
        <ui-drawer-backdrop hidden></ui-drawer-backdrop>
        <ui-drawer-content hidden>
          <div data-slot="stack">
            <ui-drawer-title>القائمة</ui-drawer-title>
            <ui-drawer-description>اسحبها نحو حافتها لإغلاقها.</ui-drawer-description>
          </div>
          <nav aria-label="الأقسام">
            <ul>
              ${links.map((link) => `<li><a href="https://example.com">${link}</a></li>`).join("")}
            </ul>
          </nav>
          <ui-drawer-close><button data-variant="solid">إغلاق</button></ui-drawer-close>
        </ui-drawer-content>
      </ui-drawer>
    </div>
  `
}
