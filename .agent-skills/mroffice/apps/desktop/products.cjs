/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// This build's product (src/classic/product.ts reads it): MR Office Editors,
// the open-source build of the MR Office desktop app. With the MR Office
// component installed (src/component.ts) it runs as MR Office does, on the
// web app's office surface; everything the system keys on is its own, so it
// never meets the MR Office app downloaded from Releases: bundle id and
// AppUserModelId, data folder, single-instance lock, sign-in link scheme,
// Windows ProgIDs. It has no update feed.
//
// A fork that ships its own builds changes these values (and src/editors/brand.ts,
// package.json, electron-builder.config.cjs with them).

const OPEN_BUILD = Object.freeze({
  // the office surface's behaviour (src/classic/surface.ts, main.ts)
  id: "office",
  productName: "MR Office Editors",
  runtimeName: "MR Office Editors",
  displayName: Object.freeze({ en: "MR Office Editors", zh: "MR Office Editors" }),
  appId: "ai.mroffice.editors.oss",
  packageName: "mroffice-editors-desktop",
  // the sign-in comes back on this scheme; the site hands it a code only for
  // the app named connectApp (its own entry beside MR Office's)
  protocol: "mroffice-oss",
  connectApp: "office-oss",
  progIdPrefix: "MROfficeEditors.",
  registeredApp: "MR Office Editors",
  artifactPrefix: "MR-Office-Editors",
  iconDir: "build",
  splash: "assets/classic-splash.html",
  defaultFeed: "",
  feedEnv: "",
  betaChannel: false,
  store: false,
  takesDefaults: false,
  surface: "office",
  homeRoute: "/app/recent",
  openRoute: "/open?source=desktop",
  // what the local web app recognises the desktop app by
  userAgent: "MROffice",
  aiFolder: "MR Office Editors AI",
  copyright: "Copyright (C) 2026 MRNote. Free software under the GNU AGPL-3.0 with the terms in NOTICE.md; the MR Office component is under its own license.",
});

const PRODUCTS = Object.freeze({ office: OPEN_BUILD });
const PRODUCT_IDS = Object.freeze(Object.keys(PRODUCTS));

/** This build has one product, whatever is asked for. */
function productOf() {
  return OPEN_BUILD;
}

module.exports = { PRODUCTS, PRODUCT_IDS, productOf };
