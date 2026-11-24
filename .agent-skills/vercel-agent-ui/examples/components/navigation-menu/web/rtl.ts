import "@ui-sdk/web/navigation-menu"
import { ChevronDown, createElement } from "lucide"

const sections = [
  {
    value: "guides",
    label: "الأدلة",
    links: [
      {
        title: "مقدمة",
        href: "#",
        description: "مكونات بلا أنماط بنواة واحدة لكل إطار عمل.",
      },
      {
        title: "التثبيت",
        href: "#",
        description: "أضف الحزمة لإطار عملك واعرض أول جزء.",
      },
      {
        title: "التنسيق",
        href: "#",
        description: "نسّق الأجزاء بسمات البيانات ومتغيرات CSS.",
      },
    ],
  },
  {
    value: "components",
    label: "المكونات",
    links: [
      {
        title: "مربع تنبيه",
        href: "#",
        description: "يطلب قرارًا قبل استخدام أي شيء آخر في الصفحة.",
      },
      {
        title: "بطاقة التمرير",
        href: "#",
        description: "معاينة لما يشير إليه الرابط.",
      },
      {
        title: "علامات التبويب",
        href: "#",
        description: "تعرض لوحة واحدة من المحتوى في كل مرة.",
      },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-navigation-menu aria-label="الرئيسية">
        <ui-navigation-menu-list>
          ${sections
            .map(
              (section) => `
          <ui-navigation-menu-item value="${section.value}">
            <ui-navigation-menu-trigger>
              <button>
                ${section.label}
                ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
              </button>
            </ui-navigation-menu-trigger>
            <ui-navigation-menu-content>
              <ul>
                ${section.links
                  .map(
                    (link) => `
                <li>
                  <ui-navigation-menu-link>
                    <a href="${link.href}">
                      <span>${link.title}</span>
                      <span data-slot="hint">${link.description}</span>
                    </a>
                  </ui-navigation-menu-link>
                </li>`
                  )
                  .join("")}
              </ul>
            </ui-navigation-menu-content>
          </ui-navigation-menu-item>`
            )
            .join("")}
          <ui-navigation-menu-item>
            <ui-navigation-menu-link><a href="#">المستندات</a></ui-navigation-menu-link>
          </ui-navigation-menu-item>
        </ui-navigation-menu-list>
        <ui-navigation-menu-viewport side-offset="8"></ui-navigation-menu-viewport>
      </ui-navigation-menu>
    </div>
  `
}

export { mount }
