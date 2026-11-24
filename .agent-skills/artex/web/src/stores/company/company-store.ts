"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// The sidebar's company switcher; null means "all companies". Pages pass the
// id to the server, which filters: findings (list, groups, asset tree, stat
// cards) and tasks take `company`, assets take `company_id`, traffic takes
// `company`.
type CompanyState = {
  companyId: number | null;
  companyName: string;
  setCompany: (id: number | null, name?: string) => void;
};

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      companyId: null,
      companyName: "",
      setCompany: (id, name = "") => set({ companyId: id, companyName: id === null ? "" : name }),
    }),
    { name: "artex-active-company" },
  ),
);

// useActiveCompany returns the active company id as the `company` query value,
// or undefined when every company is in view.
export function useActiveCompany(): string | undefined {
  const companyId = useCompanyStore((s) => s.companyId);
  return companyId === null ? undefined : String(companyId);
}

// useActiveCompanyID is the numeric id, for filters that take an id.
export function useActiveCompanyID(): number | null {
  return useCompanyStore((s) => s.companyId);
}
