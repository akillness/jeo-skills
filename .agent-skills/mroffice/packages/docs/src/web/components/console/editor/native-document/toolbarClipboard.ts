/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Permission-aware system clipboard bridge for the Docs Home ribbon.
 *
 * Keyboard paste remains owned by the browser/ProseMirror. This module is only
 * for the explicit toolbar button, whose trusted pointer/keyboard activation is
 * allowed to call the asynchronous Clipboard API. The read result is converted
 * back into a synthetic paste event so the editor's existing paste pipeline
 * still owns sanitization, Paste Special modes, tables, images and history.
 */

export type ToolbarClipboardFailureReason =
  | "unavailable"
  | "permission-denied"
  | "empty"
  | "format-unavailable"
  | "failed";

/** Paste Special formats the browser editor can execute without pretending OLE. */
export type ToolbarPasteSpecialFormat =
  "formatted-text" | "unformatted-text" | "picture";

export class ToolbarClipboardError extends Error {
  readonly reason: ToolbarClipboardFailureReason;

  constructor(reason: ToolbarClipboardFailureReason, cause?: unknown) {
    super(`Toolbar clipboard read failed: ${reason}`, { cause });
    this.name = "ToolbarClipboardError";
    this.reason = reason;
  }
}

export interface ToolbarClipboardPayload {
  plainText: string;
  html: string;
  imageFiles: File[];
}

const toolbarPasteSpecialEvents = new WeakMap<
  ClipboardEvent,
  ToolbarPasteSpecialFormat
>();

/**
 * Return only the clipboard flavor requested by Paste Special. This is
 * deliberately fail-closed: choosing Picture with a text-only clipboard (or
 * Formatted Text when the browser exposes only text/plain) never silently
 * degrades to another format.
 */
export function selectToolbarPasteSpecialPayload(
  payload: ToolbarClipboardPayload,
  format: ToolbarPasteSpecialFormat,
): ToolbarClipboardPayload {
  if (format === "formatted-text") {
    if (!payload.html) throw new ToolbarClipboardError("format-unavailable");
    return {
      plainText: payload.plainText,
      html: payload.html,
      imageFiles: [],
    };
  }
  if (format === "unformatted-text") {
    if (!payload.plainText) {
      throw new ToolbarClipboardError("format-unavailable");
    }
    return { plainText: payload.plainText, html: "", imageFiles: [] };
  }
  if (payload.imageFiles.length === 0) {
    throw new ToolbarClipboardError("format-unavailable");
  }
  return { plainText: "", html: "", imageFiles: payload.imageFiles };
}

/** Read the explicit Paste Special intent attached to a toolbar paste event. */
export function toolbarPasteSpecialFormatForEvent(
  event: ClipboardEvent,
): ToolbarPasteSpecialFormat | null {
  return toolbarPasteSpecialEvents.get(event) ?? null;
}

function deniedClipboardError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "NotAllowedError" || error.name === "SecurityError";
}

async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Clipboard blob could not be read"));
    reader.readAsText(blob);
  });
}

async function clipboardPermissionDenied(
  permissions: Permissions | undefined,
): Promise<boolean> {
  if (!permissions || typeof permissions.query !== "function") return false;
  try {
    // Chromium exposes clipboard-read here; Safari/Firefox may reject the
    // descriptor even though a user-activated read() is supported. A rejected
    // query therefore means "unknown", never "denied".
    const status = await permissions.query({
      name: "clipboard-read" as PermissionName,
    });
    return status.state === "denied";
  } catch {
    return false;
  }
}

function fileExtension(mediaType: string): string {
  const subtype = mediaType.split("/", 2)[1] ?? "png";
  return subtype.replace(/[^a-z0-9]/gi, "") || "png";
}

/** Read all pasteable flavors exposed by the system Clipboard API. */
export async function readToolbarClipboard(
  browserNavigator: Navigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<ToolbarClipboardPayload> {
  const clipboard = browserNavigator?.clipboard;
  if (!clipboard) {
    throw new ToolbarClipboardError("unavailable");
  }
  if (await clipboardPermissionDenied(browserNavigator.permissions)) {
    throw new ToolbarClipboardError("permission-denied");
  }

  try {
    if (typeof clipboard.read === "function") {
      const items = await clipboard.read();
      let plainText = "";
      let html = "";
      const imageFiles: File[] = [];

      for (const [itemIndex, item] of Array.from(items).entries()) {
        const types = Array.from(item.types ?? []);
        if (!html && types.includes("text/html")) {
          html = await blobText(await item.getType("text/html"));
        }
        if (!plainText && types.includes("text/plain")) {
          plainText = await blobText(await item.getType("text/plain"));
        }
        for (const mediaType of types.filter((type) =>
          type.startsWith("image/"),
        )) {
          const blob = await item.getType(mediaType);
          imageFiles.push(
            new File(
              [blob],
              `clipboard-image-${itemIndex + 1}.${fileExtension(mediaType)}`,
              { type: mediaType, lastModified: Date.now() },
            ),
          );
        }
      }

      if (!plainText && !html && imageFiles.length === 0) {
        throw new ToolbarClipboardError("empty");
      }
      return { plainText, html, imageFiles };
    }

    if (typeof clipboard.readText === "function") {
      const plainText = await clipboard.readText();
      if (!plainText) throw new ToolbarClipboardError("empty");
      return { plainText, html: "", imageFiles: [] };
    }

    throw new ToolbarClipboardError("unavailable");
  } catch (error) {
    if (error instanceof ToolbarClipboardError) throw error;
    throw new ToolbarClipboardError(
      deniedClipboardError(error) ? "permission-denied" : "failed",
      error,
    );
  }
}

/**
 * Dispatch the read clipboard through the editor's normal paste event path.
 * Returns true only when an editor handler prevented the synthetic default,
 * which proves the content was accepted (or an async image import was begun).
 */
export function dispatchToolbarPaste(
  target: HTMLElement,
  payload: ToolbarClipboardPayload,
  specialFormat?: ToolbarPasteSpecialFormat,
): boolean {
  const types: string[] = [];
  if (payload.html) types.push("text/html");
  if (payload.plainText) types.push("text/plain");
  for (const file of payload.imageFiles) {
    if (!types.includes(file.type)) types.push(file.type);
  }

  const clipboardData = {
    files: payload.imageFiles,
    items: payload.imageFiles.map((file) => ({
      kind: "file" as const,
      type: file.type,
      getAsFile: () => file,
      getAsString: () => undefined,
    })),
    types,
    getData: (type: string) => {
      if (type === "text/html") return payload.html;
      if (type === "text/plain" || type === "Text") {
        return payload.plainText;
      }
      return "";
    },
  } as unknown as DataTransfer;

  const event = new Event("paste", {
    bubbles: true,
    cancelable: true,
    composed: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    enumerable: true,
    value: clipboardData,
  });
  if (specialFormat) {
    toolbarPasteSpecialEvents.set(event, specialFormat);
  }
  target.dispatchEvent(event);
  return event.defaultPrevented;
}
