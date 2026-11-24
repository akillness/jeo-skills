import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/react/tabs"

export function Example() {
  return (
    <div dir="rtl">
      <Tabs defaultValue="account">
        <TabsList aria-label="الإعدادات">
          <TabsTab value="account">الحساب</TabsTab>
          <TabsTab value="password">كلمة المرور</TabsTab>
          <TabsTab value="notifications">الإشعارات</TabsTab>
          <TabsIndicator />
        </TabsList>
        <TabsPanel value="account">
          عدّل اسمك وبريدك الإلكتروني وصورتك.
        </TabsPanel>
        <TabsPanel value="password">
          غيّر كلمة المرور وفعّل التحقق بخطوتين.
        </TabsPanel>
        <TabsPanel value="notifications">اختر ما نرسله إليك بالبريد.</TabsPanel>
      </Tabs>
    </div>
  )
}
