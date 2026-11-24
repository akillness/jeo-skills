/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

import { PRODUCT } from "./product";



export const CLASSIC_PROTOCOL = PRODUCT.protocol;

export interface AiAccount {
  readonly token: string;
  readonly email: string;
  readonly displayName: string;
  readonly plan: string;
}

const tokenFile = () => path.join(app.getPath("userData"), "data", "ai-account.bin");

function base64url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function challengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier, "ascii").digest());
}

export function newVerifier(): string {
  return base64url(randomBytes(48));
}

export function connectUrl(cloud: string, challenge: string): string {
  const url = new URL("/app/desktop-connect", cloud);
  url.searchParams.set("challenge", challenge);
  // The page names the app asking, and the code comes back on its scheme
  // (apps/api/app/routers/desktop_cloud.py approve_connect). Classic's link
  // stays as it always was.
  if (PRODUCT.connectApp) url.searchParams.set("app", PRODUCT.connectApp);
  return url.toString();
}

 
export function codeFromLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== `${CLASSIC_PROTOCOL}:`) return null;
    
    
    const target = (url.host || url.pathname.replace(/^\/+/, "")).toLowerCase();
    if (target !== "connect") return null;
    const code = url.searchParams.get("code") ?? "";
    return /^[A-Za-z0-9_-]{20,128}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function linksFromArgv(argv: readonly string[]): string[] {
  return argv.filter((arg) => arg.startsWith(`${CLASSIC_PROTOCOL}:`));
}

export function readAccount(): AiAccount | null {
  try {
    const raw = fs.readFileSync(tokenFile());
    if (!safeStorage.isEncryptionAvailable()) return null;
    const value = JSON.parse(safeStorage.decryptString(raw)) as AiAccount;
    return typeof value.token === "string" && value.token.length >= 16 ? value : null;
  } catch {
    return null;
  }
}

export function saveAccount(account: AiAccount): void {
  // Never written in the clear: without the keychain (unavailable, or the
  // person refused this app its key) the sign-in lasts until the app quits.
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const sealed = safeStorage.encryptString(JSON.stringify(account));
    fs.mkdirSync(path.dirname(tokenFile()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tokenFile(), sealed, { mode: 0o600 });
  } catch (error) {
    console.warn(`[classic] the sign-in is kept for this session only: ${error instanceof Error ? error.message : error}`);
  }
}

export function forgetAccount(): void {
  try {
    fs.unlinkSync(tokenFile());
  } catch {
    // Not signed in.
  }
}

export async function redeem(cloud: string, code: string, verifier: string): Promise<AiAccount> {
  const response = await fetch(new URL("/api/v1/desktop/connect/redeem", cloud), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      verifier,
      label: `${PRODUCT.displayName.en} ${app.getVersion()} (${process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : process.platform})`,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`redeem refused (${response.status})`);
  const body = (await response.json()) as { token: string; email: string; display_name: string; plan: string };
  return { token: body.token, email: body.email, displayName: body.display_name, plan: body.plan };
}

/** Who the token belongs to now; null when it no longer works. */
export async function refreshAccount(cloud: string, account: AiAccount): Promise<AiAccount | null | "offline"> {
  try {
    const response = await fetch(new URL("/api/v1/desktop/connect/account", cloud), {
      headers: { "x-mrai-desktop-token": account.token },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401) return null;
    if (!response.ok) return "offline";
    const body = (await response.json()) as { email: string; display_name: string; plan: string };
    return { ...account, email: body.email, displayName: body.display_name, plan: body.plan };
  } catch {
    return "offline";
  }
}

export async function revoke(cloud: string, account: AiAccount): Promise<void> {
  try {
    await fetch(new URL("/api/v1/desktop/connect/revoke", cloud), {
      method: "POST",
      headers: { "x-mrai-desktop-token": account.token },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Offline: the token is deleted here regardless; it can also be
    // revoked from the account's settings on the site.
  }
}

/** The hosted settings the local API applies (app/desktop/profile.py). */
export async function fetchProfile(cloud: string, account: AiAccount | null): Promise<unknown | null> {
  try {
    const response = await fetch(new URL("/api/v1/desktop/profile", cloud), {
      // In the app's own names (app/desktop/lane_vocab.py): its package
      // carries no supplier's name, and neither does what it is sent.
      // "families": this app draws with the picture model families; an app
      // that does not say so is given GPT Image 2.5 (app/desktop/relay.py).
      headers: {
        "x-mrai-desktop-names": "lanes",
        "x-mrai-desktop-images": "families",
        ...(account ? { "x-mrai-desktop-token": account.token } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
