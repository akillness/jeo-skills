/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which web permissions the app grants, and to whom (no Electron here; it is
 * unit-tested in test/permissions.test.mjs).
 *
 * Only a page whose top frame is the site gets anything. The site itself
 * (its own origin) gets what its editors use: the clipboard, the camera and
 * microphone (dictation, voice, recording), screen capture (screenshots,
 * PDF screen recording), notifications, local fonts (the font picker),
 * fullscreen and pointer lock (slide shows), persistent storage.
 * Notifications stay off until the page asks for them (a request, which the
 * site makes from the person's click) and then stay on
 * (`notificationsAllowed`): nothing notifies, and macOS never asks about
 * notifications, before the person chose to. Electron has no "not asked yet"
 * state, so until then the page reads "denied" (the site's own banner that
 * offers notifications, shown only for "default", does not appear). A frame of
 * another origin inside a site page (an AI window's sandbox, the code editor's, an embed) gets
 * only what Chrome grants any page without asking: fullscreen, pointer lock
 * and writing to the clipboard. Everything else (location, USB, serial, HID,
 * MIDI, ...) is refused.
 */

const SITE_ONLY = new Set([
  "clipboard-read",
  "media",
  "display-capture",
  "notifications",
  "local-fonts",
  "persistent-storage",
]);

const ANY_FRAME_OF_A_SITE_PAGE = new Set(["clipboard-sanitized-write", "fullscreen", "pointerLock"]);

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/** "check": the page reads the state (Notification.permission); "request": it asks. */
export type PermissionKind = "check" | "request";

export interface PermissionQuery {
  readonly permission: string;
  /** The URL (or origin) of the frame asking. */
  readonly requesting: string | null | undefined;
  /** The URL of the page's top frame. */
  readonly topLevel: string | null | undefined;
  /** For "media": the kinds asked for. */
  readonly mediaTypes?: readonly string[];
  /** For "openExternal": the link being opened. */
  readonly externalUrl?: string;
  /** A check or a request (default: request). */
  readonly kind?: PermissionKind;
  /** Whether the person has turned notifications on before. */
  readonly notificationsAllowed?: boolean;
}

export function allowPermission(query: PermissionQuery, siteOrigin: string): boolean {
  const site = originOf(siteOrigin);
  if (!site || originOf(query.topLevel) !== site) return false;
  const fromSite = originOf(query.requesting) === site;
  if (query.permission === "openExternal") {
    // Chromium hands mailto:/tel: links of a page to the system this way.
    try {
      return fromSite && ["mailto:", "tel:"].includes(new URL(query.externalUrl ?? "").protocol);
    } catch {
      return false;
    }
  }
  if (query.permission === "media") {
    const kinds = query.mediaTypes ?? [];
    return fromSite && kinds.every((kind) => kind === "audio" || kind === "video");
  }
  if (query.permission === "notifications" && query.kind === "check") {
    return fromSite && query.notificationsAllowed === true;
  }
  if (SITE_ONLY.has(query.permission)) return fromSite;
  return ANY_FRAME_OF_A_SITE_PAGE.has(query.permission);
}
