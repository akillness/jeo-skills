/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which local product this copy of the app is (../../products.cjs): MRNote
 * Classic or MR Office. One shell runs both; everything a person reads or
 * the system keys on (names, data folder, bundle id, link scheme, ProgIDs,
 * the first page, the update feed's channel) comes from here.
 *
 * A packed app names its product in its package.json (`mraiProduct`,
 * electron-builder.classic.config.cjs); an unpacked run (development,
 * automated checks) may choose one with MRAI_DESKTOP_PRODUCT. A packed app
 * never takes the environment's word: a launcher's variable must not turn
 * MR Office into Classic, or the reverse.
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface DesktopProduct {
  readonly id: "classic" | "office";
  readonly productName: string;
  readonly runtimeName: string;
  readonly displayName: { readonly en: string; readonly zh: string };
  readonly appId: string;
  readonly protocol: string;
  readonly progIdPrefix: string;
  readonly registeredApp: string | null;
  readonly betaChannel: boolean;
  readonly surface: "office" | null;
  readonly homeRoute: string;
  readonly openRoute: string;
  readonly userAgent: string;
  readonly connectApp: string | null;
  readonly aiFolder: string;
  readonly splash: string;
  readonly iconDir: string;
}

interface ProductTable {
  productOf(id: unknown): DesktopProduct;
}

/** The app's root: dist/classic/ is two folders below it, in the archive too. */
const ROOT = path.join(__dirname, "..", "..");

function packedProductId(): string | undefined {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as { mraiProduct?: unknown };
    return typeof metadata.mraiProduct === "string" ? metadata.mraiProduct : undefined;
  } catch {
    return undefined;
  }
}

function load(): DesktopProduct {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const table = require(path.join(ROOT, "products.cjs")) as ProductTable;
  const id = app.isPackaged ? packedProductId() : process.env.MRAI_DESKTOP_PRODUCT || packedProductId();
  return table.productOf(id);
}

export const PRODUCT: DesktopProduct = load();

/** The product's name in the app's language. */
export function productDisplayName(zh: boolean): string {
  return zh ? PRODUCT.displayName.zh : PRODUCT.displayName.en;
}

/**
 * Classic's own words, in MR Office's name: MR Office has no shell texts of
 * its own, so it says what Classic says with the product named as the
 * Office site names it (apps/web/components/ui/OfficeTabTitle: MR Note →
 * MR Office), Classic's own name included.
 */
export function productWords(text: string): string {
  return PRODUCT.surface === "office" ? text.replace(/MR ?Note(?: Classic| 经典版)?/g, "MR Office") : text;
}
