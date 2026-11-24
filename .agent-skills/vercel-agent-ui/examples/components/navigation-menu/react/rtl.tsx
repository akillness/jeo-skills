"use client"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@ui-sdk/react/navigation-menu"
import { ChevronDownIcon } from "lucide-react"

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
          {sections.map((section) => (
            <NavigationMenuItem key={section.value} value={section.value}>
              <NavigationMenuTrigger>
                {section.label}
                <ChevronDownIcon />
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul>
                  {section.links.map((link) => (
                    <li key={link.title}>
                      <NavigationMenuLink href={link.href}>
                        <span>{link.title}</span>
                        <span data-slot="hint">{link.description}</span>
                      </NavigationMenuLink>
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          ))}
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
