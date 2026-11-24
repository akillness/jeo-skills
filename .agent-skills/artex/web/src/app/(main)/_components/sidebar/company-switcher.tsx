"use client";

import * as React from "react";

import Link from "next/link";

import { BuildingIcon, CheckIcon, ChevronsUpDown, LayersIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCompanyStore } from "@/stores/company/company-store";

// The active company narrows every page that reads assets. "All companies" is
// the default and the way back out; it is never persisted as a sentinel, the
// store holds null for it.
export function CompanySwitcher() {
  const { isMobile, setOpenMobile } = useSidebar();
  const companyId = useCompanyStore((s) => s.companyId);
  const companyName = useCompanyStore((s) => s.companyName);
  const setCompany = useCompanyStore((s) => s.setCompany);

  const [open, setOpen] = React.useState(false);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Loaded on mount for the trigger label, and again on open and after a switch
  // so a company created on the assets page shows up without a reload. open and
  // companyId are triggers here, hence the voids.
  React.useEffect(() => {
    void open;
    void companyId;
    let disposed = false;
    api
      .companies()
      .then((rows) => {
        if (disposed) return;
        setCompanies(rows);
        setError(null);
      })
      .catch((e) => {
        if (disposed) return;
        setError(String((e as Error)?.message ?? e));
      });
    return () => {
      disposed = true;
    };
  }, [open, companyId]);

  const active = companyId === null ? null : (companies.find((c) => c.id === companyId) ?? null);

  const select = (id: number | null, name = "") => {
    setCompany(id, name);
    setOpen(false);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={t("Switch company")}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {active ? (
                <Avatar className="size-8 shrink-0 rounded-md">
                  {active.logo ? <AvatarImage src={active.logo} alt={active.name} /> : null}
                  <AvatarFallback className="rounded-md text-xs">
                    {(active.name.trim()[0] ?? "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
                  <LayersIcon className="size-4" />
                </div>
              )}
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium text-sm">{companyName || t("All companies")}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {companyId === null
                    ? t("Every target in view")
                    : active
                      ? t("{count} assets", { count: active.asset_count })
                      : t("Company")}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder={t("Search company…")} />
              <CommandList>
                <CommandEmpty>{error ? t("Failed to load companies") : t("No company found")}</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="__all__ all companies" onSelect={() => select(null)}>
                    <LayersIcon className="size-4" />
                    <span className="flex-1 truncate">{t("All companies")}</span>
                    <CheckIcon className={cn("size-4", companyId === null ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                </CommandGroup>
                {companies.length > 0 ? (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading={t("Companies")}>
                      {companies.map((company) => (
                        <CommandItem
                          key={company.id}
                          value={`${company.name} ${company.id}`}
                          onSelect={() => select(company.id, company.name)}
                        >
                          <BuildingIcon className="size-4 shrink-0" />
                          <span className="flex-1 truncate">{company.name}</span>
                          <span className="text-muted-foreground text-xs tabular-nums">{company.asset_count}</span>
                          <CheckIcon className={cn("size-4", companyId === company.id ? "opacity-100" : "opacity-0")} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}
              </CommandList>
            </Command>
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
                <Link prefetch={false} href="/function/assets">
                  {t("Manage companies")}
                </Link>
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
