/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The MR Office Editors package: the shell (dist/), the open-source editors'
// build (apps/playground/dist, built at the repository's root), and, when
// apps/desktop/component holds an unpacked MR Office component, that
// component too (then the package is the whole MR Office desktop app).
//
//   npm run package   the app, unpacked, in release/
//   npm run dist      the installers: .dmg and .zip (macOS), NSIS (Windows)
//
// Unsigned: no certificate and no notarization (macOS gets the ad-hoc
// signature Apple silicon needs to run any app), and no update feed
// (`publish: null`). Its own identity (products.cjs): another bundle id,
// name, data folder, link scheme and ProgIDs than the MR Office app.

const fs = require("node:fs");
const path = require("node:path");
const { PRESENTATION_EXTENSIONS, macImportedTypeDeclarations, macPresentationDocumentType } = require("./document-types.cjs");
const { productOf } = require("./products.cjs");

const product = productOf();
const editors = path.join(__dirname, "..", "playground", "dist");
if (!fs.existsSync(path.join(editors, "index.html"))) {
  throw new Error(`The editors are not built (${editors}): run "npm run build" at the repository's root first`);
}
const component = path.join(__dirname, "component");
const withComponent = fs.existsSync(path.join(component, "component.json"));

/** The documents the system may open with the app: the MR Office app's own
 * (src/files.ts). Without the component, Word, Excel and PowerPoint files say
 * where to get it; PDF, Markdown and CSV open in the open-source editors. */
const prog = product.progIdPrefix;
const fileAssociations = [
  { ext: ["docx", "docm"], name: `${prog}Document`, description: "Word Document" },
  { ext: ["xlsx", "xls"], name: `${prog}Workbook`, description: "Excel Workbook" },
  { ext: [...PRESENTATION_EXTENSIONS], name: `${prog}Presentation`, description: "PowerPoint Presentation" },
  { ext: ["pdf"], name: `${prog}PDF`, description: "PDF Document" },
  { ext: ["md", "markdown"], name: `${prog}Markdown`, description: "Markdown Document" },
  { ext: ["csv", "tsv"], name: `${prog}CSV`, description: "CSV Table" },
].map((association) => ({ ...association, role: "Editor", rank: "Alternate" }));
const deckProgId = `${prog}Presentation`;

module.exports = {
  appId: product.appId,
  productName: product.productName,
  copyright: product.copyright,
  directories: { output: "release", buildResources: "build" },
  files: [
    "dist/**/*.js",
    "assets/*.html",
    "products.cjs",
    "document-types.cjs",
    "editor-extensions.generated.cjs",
    "component-contract.json",
    "package.json",
  ],
  asar: true,
  extraMetadata: { main: "dist/entry.js", mraiProduct: "office" },
  extraResources: [
    { from: editors, to: "editors" },
    { from: path.join(__dirname, "..", "..", "LICENSE"), to: "LICENSE" },
    { from: path.join(__dirname, "..", "..", "NOTICE.md"), to: "NOTICE.md" },
    ...(withComponent ? [{ from: component, to: "component" }] : []),
  ],
  // the sign-in comes back from the browser on the app's own scheme
  protocols: [{ name: product.productName, schemes: [product.protocol] }],
  publish: null,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  mac: {
    category: "public.app-category.productivity",
    target: ["dmg", "zip"],
    identity: "-",
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false,
    // The types are declared here without an icon of their own (with one,
    // every PDF and Office file in Finder would wear the app's icon once it
    // became their default).
    extendInfo: {
      CFBundleDocumentTypes: fileAssociations.map((association) =>
        association.name === deckProgId
          ? macPresentationDocumentType(association.name)
          : {
              CFBundleTypeName: association.name,
              CFBundleTypeExtensions: association.ext,
              CFBundleTypeRole: association.role,
              LSHandlerRank: association.rank,
            },
      ),
      UTImportedTypeDeclarations: macImportedTypeDeclarations(),
      NSMicrophoneUsageDescription: `${product.productName} uses the microphone for dictation and recordings you start.`,
      NSCameraUsageDescription: `${product.productName} uses the camera for recordings and video you start.`,
    },
  },
  dmg: { sign: false },
  win: { target: ["nsis"], fileAssociations },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: product.productName,
  },
};
