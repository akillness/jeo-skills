import { redirect } from "next/navigation";

import { t } from "@/i18n";

export default function Home() {
  redirect("/function/tasks");
  return <>{t("Coming Soon")}</>;
}
