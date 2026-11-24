"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { X } from "./icons/houseIcons";

import {
  officeDialogClassName,
  officeDialogParts,
  useOfficeDialogChrome,
} from "./officeDialogChrome";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { isMacPlatform } from "../../lib/mac-platform";
import { cn } from "../../lib/utils";

export type OfficeCommandSearchItem = Readonly<{
  controlId: string;
  label: string;
  group: string;
  keywords: readonly string[];
  shortcut?: string;
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
}>;

/** A match of the query in the document itself, listed under the commands
 * (Office's Search box lists the document's own hits beside its commands). */
export type OfficeCommandSearchDocumentResult = Readonly<{
  id: string;
  label: string;
  detail?: string;
}>;

export type OfficeCommandSearchDocumentSearch = Readonly<{
  /** The section's heading (「文档中」). */
  heading: string;
  /** The matches of `query`. A long document may report the matches of the
   * part it has read so far (`partial`, as often as it likes) before the
   * promise gives them all; `signal` aborts when the query changes. */
  search: (
    query: string,
    partial: (results: readonly OfficeCommandSearchDocumentResult[]) => void,
    signal: AbortSignal,
  ) => Promise<readonly OfficeCommandSearchDocumentResult[]>;
  /** Shows the result picked; runs once the palette has let the focus go. */
  onSelect: (id: string, query: string) => unknown;
}>;

/** How many of the document's matches the palette lists. */
const DOCUMENT_RESULTS_SHOWN = 50;

type OfficeCommandSearchProps = Readonly<{
  /** The i18n key prefix of the palette's own strings (`<prefix>.title`,
   * `.placeholder`, `.results`, `.empty`, `.description`). The worksheet keeps
   * its own sentences; every other editor reads `toolbar.commandSearch`. */
  stringPrefix?: string;
  /** The test id prefix of the palette's parts (`<prefix>-input`, `-results`,
   * `-item-<controlId>`, `-dialog`, `-close`). */
  testIdPrefix?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExecute: (controlId: string) => unknown;
  items: readonly OfficeCommandSearchItem[];
  translate: (key: string) => string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  ownerRef?: RefObject<HTMLElement | null>;
  /** The editor's own search of its document, listed under the commands. */
  documentSearch?: OfficeCommandSearchDocumentSearch;
}>;

/**
 * The command search's shortcut on this platform, as the button shows it
 * (`label`) and announces it (`aria`, for aria-keyshortcuts). On a Mac,
 * Option+Q types "œ" in a text field, so there it is Control+Option+Q,
 * which works everywhere; elsewhere Alt+Q.
 */
export function officeCommandSearchShortcut(
  mac: boolean = isMacPlatform(),
): { label: string; aria: string } {
  return mac
    ? { label: "⌃⌥Q", aria: "Control+Alt+Q" }
    : { label: "Alt+Q", aria: "Alt+Q" };
}

/**
 * A translated "Search commands (Alt+Q)" with this platform's shortcut, or
 * with `shortcut` where an editor opens its search with another chord.
 */
export function withOfficeCommandSearchShortcut(
  label: string,
  mac: boolean = isMacPlatform(),
  shortcut: string = officeCommandSearchShortcut(mac).label,
): string {
  return label.replace("Alt+Q", shortcut);
}

/**
 * The title bar's command search (Office's Search box, Alt+Q), shared by every
 * editor. It is a discovery surface only: it never owns a mutation or a
 * shortcut writer; selecting an enabled row delegates the exact control id
 * to the editor's existing command authority. Disabled rows remain visible
 * with the same reason the Ribbon reports.
 */
export function OfficeCommandSearch({
  stringPrefix = "spreadsheet.commandSearch",
  testIdPrefix = "spreadsheet-command-search",
  open,
  onOpenChange,
  onExecute,
  items,
  translate,
  triggerRef,
  ownerRef,
  documentSearch,
}: OfficeCommandSearchProps) {
  const visibleItems = items.filter((item) => item.visible);
  const groups = Array.from(new Set(visibleItems.map((item) => item.group)));
  const wasOpenRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // The row the user chose runs once the dialog has let the focus go (its
  // close-auto-focus hook): while the modal palette stands, its focus trap
  // would pull the focus straight back from the Find box the command opened
  
  // the focus nowhere still gets the trigger back; a cancel returns it as
  // the dialog does.
  const pendingRef = useRef<{ run: () => unknown; returnTarget: HTMLElement | null } | null>(null);
  // Radix reads the close-auto-focus handler through a callback ref, so the
  // handler of the latest render (and its onExecute) is the one that runs.
  const handleCloseAutoFocus = (event: Event) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    event.preventDefault();
    void pending.run();
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      const commandTookFocus =
        active instanceof HTMLElement && active !== document.body && active !== pending.returnTarget;
      if (!commandTookFocus) pending.returnTarget?.focus({ preventScroll: true });
    });
  };
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Under the editor's chrome provider the palette wears the same Office
  // dialog card as every other command dialog of the workbook: title row with
  // the round close control, a framed search field, a framed result list.
  const chromeTone = useOfficeDialogChrome();

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const target =
        event.target instanceof HTMLElement
          ? event.target
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      if (ownerRef) {
        const owner = ownerRef.current;
        if (!owner?.isConnected || owner.closest("[inert]")) return;
        const window = owner.closest('.wm-window[data-window-id]');
        if (window) {
          if (window.getAttribute("data-focused") !== "true") return;
        } else if (!owner.contains(target) && !owner.contains(document.activeElement)) return;
      }
      const editing = Boolean(
        target?.closest(
          'input, textarea, select, [contenteditable="true"], .ProseMirror',
        ),
      ) &&
        // A worksheet cell holds the keyboard while merely selected; only a
        // cell in edit mode is text entry, so Alt+Q opens the search as in
        // Excel.
        !target?.matches('[data-testid="spreadsheet-cell"]:not([data-editing="true"])');
      const isSearchShortcut =
        event.code === "KeyQ" &&
        event.altKey &&
        !event.shiftKey &&
        !event.metaKey &&
        (isMacPlatform()
          ? // Option+Q types "œ" in a Mac text field: there Control+Option+Q
            // opens the search, and plain Option+Q is left to the typing.
            !editing || event.ctrlKey
          : // Alt+Q types nothing on Windows; Ctrl+Alt is AltGr on many
            // keyboards (AltGr+Q types "@"), which is typing, never the search.
            !event.ctrlKey);
      if (!isSearchShortcut || event.repeat) return;
      event.preventDefault();
      onOpenChange(true);
    };
    document.addEventListener("keydown", handleSearchShortcut);
    return () => document.removeEventListener("keydown", handleSearchShortcut);
  }, [onOpenChange, ownerRef]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      returnFocusRef.current =
        triggerRef?.current ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
    } else if (!open && wasOpenRef.current) {
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      // A chosen row's close is the command's (handleCloseAutoFocus).
      if (pendingRef.current) {
        wasOpenRef.current = open;
        return;
      }
      const frame = window.requestAnimationFrame(() =>
        returnTarget?.focus({ preventScroll: true }),
      );
      wasOpenRef.current = open;
      return () => window.cancelAnimationFrame(frame);
    }
    wasOpenRef.current = open;
  }, [open, triggerRef]);

  // The query, for the document's own search: asked a beat after the last
  // key, the latest answer kept.
  const [query, setQuery] = useState("");
  const [documentResults, setDocumentResults] =
    useState<readonly OfficeCommandSearchDocumentResult[]>([]);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDocumentResults([]);
    }
  }, [open]);
  useEffect(() => {
    if (!documentSearch || !open) return;
    const term = query.trim();
    if (!term) {
      setDocumentResults([]);
      return;
    }
    let current = true;
    const abort = new AbortController();
    const show = (found: readonly OfficeCommandSearchDocumentResult[]) => {
      if (current) setDocumentResults(found.slice(0, DOCUMENT_RESULTS_SHOWN));
    };
    const timer = window.setTimeout(() => {
      void documentSearch.search(term, show, abort.signal).then(
        show,
        () => { if (current) setDocumentResults([]); },
      );
    }, 200);
    return () => {
      current = false;
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [documentSearch, open, query]);

  const results = (
    <>
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        aria-label={translate(`${stringPrefix}.title`)}
        data-testid={`${testIdPrefix}-input`}
        placeholder={translate(`${stringPrefix}.placeholder`)}
      />
      <CommandList
        aria-label={translate(`${stringPrefix}.results`)}
        data-testid={`${testIdPrefix}-results`}
      >
        <CommandEmpty>
          {translate(`${stringPrefix}.empty`)}
        </CommandEmpty>
        {groups.map((group, groupIndex) => (
          <Fragment key={group}>
            <CommandGroup heading={group}>
              {visibleItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const accessibleLabel =
                    !item.enabled && item.disabledReason
                      ? `${item.label}: ${item.disabledReason}`
                      : item.label;
                  return (
                    <CommandItem
                      key={item.controlId}
                      aria-label={accessibleLabel}
                      aria-disabled={!item.enabled}
                      data-control-id={item.controlId}
                      data-disabled-reason={
                        !item.enabled ? item.disabledReason : undefined
                      }
                      data-testid={`${testIdPrefix}-item-${item.controlId}`}
                      disabled={!item.enabled}
                      onSelect={() => {
                        if (!item.enabled) return;
                        pendingRef.current = {
                          run: () => onExecute(item.controlId),
                          returnTarget: returnFocusRef.current,
                        };
                        onOpenChange(false);
                      }}
                      value={`${item.label} ${item.keywords.join(" ")}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {item.label}
                        </span>
                        {!item.enabled && item.disabledReason ? (
                          <span
                            className={cn(
                              "mt-0.5 block text-xs leading-4 text-muted-foreground",
                              chromeTone && "office-dialog__command-reason",
                            )}
                          >
                            {item.disabledReason}
                          </span>
                        ) : null}
                      </span>
                      {item.shortcut ? (
                        <CommandShortcut>{item.shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
            {!chromeTone && groupIndex < groups.length - 1 ? (
              <div aria-hidden className="mx-3 h-px bg-border" />
            ) : null}
          </Fragment>
        ))}
        {documentSearch && documentResults.length > 0 ? (
          <CommandGroup heading={documentSearch.heading} data-testid={`${testIdPrefix}-document`}>
            {documentResults.map((result) => (
              <CommandItem
                key={result.id}
                data-testid={`${testIdPrefix}-document-${result.id}`}
                onSelect={() => {
                  const term = query.trim();
                  pendingRef.current = {
                    run: () => documentSearch.onSelect(result.id, term),
                    returnTarget: returnFocusRef.current,
                  };
                  onOpenChange(false);
                }}
                // The query in the value keeps the row through the palette's
                // own filter: the document's search already chose it.
                value={`${query} ${result.label} ${result.detail ?? ""} ${result.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{result.label}</span>
                  {result.detail ? (
                    <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
                      {result.detail}
                    </span>
                  ) : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </>
  );

  if (chromeTone) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          skin="none"
          showCloseButton={false}
          tabIndex={-1}
          data-testid={`${testIdPrefix}-dialog`}
          // Searching reads: a read-only window keeps it (PageReadOnlyShield).
          data-collaboration-readonly-allowed="true"
          className={cn(
            officeDialogClassName({ tone: chromeTone }),
            "office-dialog--command-search sm:max-w-[560px]",
          )}
          onOpenAutoFocus={(event) => {
            // The search field takes the keyboard, not the title row's X.
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <div className={officeDialogParts.header}>
            <DialogTitle className={officeDialogParts.title}>
              {translate(`${stringPrefix}.title`)}
            </DialogTitle>
            <button
              type="button"
              className={officeDialogParts.close}
              aria-label={translate("common.close")}
              data-testid={`${testIdPrefix}-close`}
              onClick={() => onOpenChange(false)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <DialogDescription
            skin="none"
            className={officeDialogParts.description}
          >
            {translate(`${stringPrefix}.description`)}
          </DialogDescription>
          <Command
            className="office-dialog__command"
            label={translate(`${stringPrefix}.title`)}
          >
            {results}
          </Command>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <CommandDialog
      commandProps={{ label: translate(`${stringPrefix}.title`) }}
      onCloseAutoFocus={handleCloseAutoFocus}
      open={open}
      onOpenChange={onOpenChange}
      title={translate(`${stringPrefix}.title`)}
      description={
        translate(`${stringPrefix}.description`)
      }
    >
      {results}
    </CommandDialog>
  );
}
