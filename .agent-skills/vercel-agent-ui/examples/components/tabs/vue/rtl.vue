<script setup lang="ts">
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/vue/tabs"
</script>

<template>
  <div dir="rtl">
    <Tabs default-value="account">
      <TabsList aria-label="الإعدادات">
        <TabsTab value="account">الحساب</TabsTab>
        <TabsTab value="password">كلمة المرور</TabsTab>
        <TabsTab value="notifications">الإشعارات</TabsTab>
        <TabsIndicator />
      </TabsList>
      <TabsPanel value="account">عدّل اسمك وبريدك الإلكتروني وصورتك.</TabsPanel>
      <TabsPanel value="password"
        >غيّر كلمة المرور وفعّل التحقق بخطوتين.</TabsPanel
      >
      <TabsPanel value="notifications">اختر ما نرسله إليك بالبريد.</TabsPanel>
    </Tabs>
  </div>
</template>
