/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The host adapter: what an application embedding the editors provides. MR
// Note's own workspace, accounts, collaboration and AI are not part of the
// open-source editors; an editor that would reach them reaches the host
// instead, and a feature the host does not provide is simply absent.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { IntlProvider } from "use-intl";

import { MESSAGE_LOADERS } from "../messages/index";

export interface EditorHostFile {
  readonly name: string;
  readonly type: string;
  readonly data: Blob;
}

export interface EditorHost {
  /** Hands a file the editor produced (a download, an export) to the user. */
  saveFile(file: EditorHostFile): void | Promise<void>;
  /** A short message for the user (the editors' toasts go here too). A
   * message about a feature of the MR Office desktop app carries the link to
   * offer first (`action`) and a second one (`secondary`). */
  notify?(message: {
    title?: string;
    description?: string;
    tone?: "info" | "error";
    action?: { label: string; href: string };
    secondary?: { label: string; href: string };
  }): void;
}

export const browserDownloadHost: EditorHost = {
  saveFile({ name, data }) {
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

let currentHost: EditorHost = browserDownloadHost;
/** The host for code outside React (download helpers, toasts). */
export function editorHost(): EditorHost {
  return currentHost;
}

const HostContext = createContext<EditorHost>(browserDownloadHost);
export function useEditorHost(): EditorHost {
  return useContext(HostContext);
}

type Catalogs = Record<string, Record<string, unknown>>;

function expand(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const path = key.split(".");
    let cursor = out;
    for (const segment of path.slice(0, -1)) {
      if (typeof cursor[segment] !== "object" || cursor[segment] === null) cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    const leaf = path[path.length - 1];
    if (typeof cursor[leaf] === "object" && cursor[leaf] !== null && typeof value === "object") Object.assign(cursor[leaf] as object, value);
    else cursor[leaf] = value;
  }
  return out;
}

function merge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (existing && typeof existing === "object" && value && typeof value === "object") merge(existing as Record<string, unknown>, value as Record<string, unknown>);
    else target[key] = value;
  }
  return target;
}

/** en, then the language, then the locale: the most specific text wins. */
function chain(locale: string): string[] {
  const steps = ["en"];
  const base = locale.split("-")[0];
  if (base !== "en" && MESSAGE_LOADERS[base]) steps.push(base);
  if (locale !== base && MESSAGE_LOADERS[locale]) steps.push(locale);
  if (locale === "en-GB" && MESSAGE_LOADERS["en-GB"] && !steps.includes("en-GB")) steps.push("en-GB");
  return steps;
}

async function loadMessages(locale: string): Promise<Catalogs> {
  const out: Catalogs = {};
  for (const step of chain(locale)) {
    const catalogs = await MESSAGE_LOADERS[step]?.();
    for (const [ns, flat] of Object.entries(catalogs ?? {})) out[ns] = merge(out[ns] ?? {}, expand(flat as Record<string, unknown>));
  }
  return out;
}

export const EDITOR_LOCALES = Object.keys(MESSAGE_LOADERS);

export function EditorHostProvider({
  host = browserDownloadHost,
  locale = "en",
  children,
  fallback = null,
}: {
  host?: EditorHost;
  locale?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [messages, setMessages] = useState<{ locale: string; catalogs: Catalogs } | null>(null);
  useEffect(() => {
    let live = true;
    void loadMessages(locale).then((catalogs) => {
      if (live) setMessages({ locale, catalogs });
    });
    return () => {
      live = false;
    };
  }, [locale]);
  currentHost = host;
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  if (!messages) return <>{fallback}</>;
  return (
    <HostContext.Provider value={host}>
      <IntlProvider
        locale={messages.locale}
        messages={messages.catalogs}
        timeZone={timeZone}
        onError={() => {}}
        getMessageFallback={({ key }) => key.split(".").pop() ?? key}
      >
        {children}
      </IntlProvider>
    </HostContext.Provider>
  );
}
