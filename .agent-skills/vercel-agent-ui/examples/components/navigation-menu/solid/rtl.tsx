import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@ui-sdk/solid/navigation-menu"
import { For } from "solid-js"

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

function Example() {
  return (
    <div dir="rtl">
      <NavigationMenu aria-label="الرئيسية">
        <NavigationMenuList>
          <For each={sections}>
            {(section) => (
              <NavigationMenuItem value={section.value}>
                <NavigationMenuTrigger>
                  {section.label}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul>
                    <For each={section.links}>
                      {(link) => (
                        <li>
                          <NavigationMenuLink href={link.href}>
                            <span>{link.title}</span>
                            <span data-slot="hint">{link.description}</span>
                          </NavigationMenuLink>
                        </li>
                      )}
                    </For>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            )}
          </For>
          <NavigationMenuItem>
            <NavigationMenuLink href="#">المستندات</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuViewport sideOffset={8} />
      </NavigationMenu>
    </div>
  )
}

export { Example }
