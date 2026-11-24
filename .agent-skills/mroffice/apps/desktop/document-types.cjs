/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The presentation files the desktop apps open as a deck, for the packages'
// file associations (electron-builder.config.cjs, electron-builder.classic.config.cjs,
// build/installer.nsh, build/classic/installer.nsh). src/files.ts lists the
// same extensions (test/builder-config.test.mjs holds them together). The
// page imports each by its name: .pptx/.pptm/.potx/.potm/.ppsx/.ppsm as the
// deck it holds, the others through the server's conversion.
//
// macOS (Apple, "Defining file and data types for your app"; Launch
// Services keys): a document type names its files by Uniform Type
// Identifier. Where macOS declares one (CoreTypes.bundle) it is used as it
// is; .fodp takes the identifier LibreOffice exports for it, and the WPS
// Presentation files, which no system or vendor identifier on record names,
// take one of this app's, each declared as an imported type (the app reads
// these types, it does not own them). The rank is Alternate: the app is a
// secondary editor, as TextEdit is for Word documents, so an installed
// PowerPoint, Keynote, LibreOffice or WPS stays the default and MR Note
// opens the file by default only where nothing else claims it.
//
// Windows (Microsoft Learn, "File Types": OpenWithProgids "contains a list
// of alternate ProgIDs for this file type. The programs for these ProgIDs
// appear in the Open with menu"): the installer adds the deck ProgID under
// each extension's OpenWithProgids and takes the extension's default only
// when no program has it.

/** @typedef {{ ext: string, uti: string, mime: string, imported?: { conformsTo: string[], description: string } }} PresentationType */

/** @type {readonly PresentationType[]} */
const PRESENTATION_TYPES = Object.freeze([
  { ext: "pptx", uti: "org.openxmlformats.presentationml.presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  { ext: "pptm", uti: "org.openxmlformats.presentationml.presentation.macroenabled", mime: "application/vnd.ms-powerpoint.presentation.macroenabled.12" },
  { ext: "potx", uti: "org.openxmlformats.presentationml.template", mime: "application/vnd.openxmlformats-officedocument.presentationml.template" },
  { ext: "potm", uti: "org.openxmlformats.presentationml.template.macroenabled", mime: "application/vnd.ms-powerpoint.template.macroenabled.12" },
  { ext: "ppsx", uti: "org.openxmlformats.presentationml.slideshow", mime: "application/vnd.openxmlformats-officedocument.presentationml.slideshow" },
  { ext: "ppsm", uti: "org.openxmlformats.presentationml.slideshow.macroenabled", mime: "application/vnd.ms-powerpoint.slideshow.macroenabled.12" },
  { ext: "ppt", uti: "com.microsoft.powerpoint.ppt", mime: "application/vnd.ms-powerpoint" },
  { ext: "pps", uti: "com.microsoft.powerpoint.pps", mime: "application/vnd.ms-powerpoint" },
  { ext: "pot", uti: "com.microsoft.powerpoint.pot", mime: "application/vnd.ms-powerpoint" },
  { ext: "odp", uti: "org.oasis-open.opendocument.presentation", mime: "application/vnd.oasis.opendocument.presentation" },
  { ext: "otp", uti: "org.oasis-open.opendocument.presentation-template", mime: "application/vnd.oasis.opendocument.presentation-template" },
  { ext: "sxi", uti: "org.openoffice.presentation", mime: "application/vnd.sun.xml.impress" },
  {
    ext: "fodp",
    uti: "vnd.oasis.opendocument.presentation-flat-xml",
    mime: "application/vnd.oasis.opendocument.presentation-flat-xml",
    imported: { conformsTo: ["public.xml", "public.presentation"], description: "Flat OpenDocument Presentation" },
  },
  {
    ext: "dps",
    uti: "ai.mroffice.editors.oss.wps-presentation",
    mime: "application/wps-office.dps",
    imported: { conformsTo: ["public.data", "public.presentation"], description: "WPS Presentation" },
  },
  {
    ext: "dpt",
    uti: "ai.mroffice.editors.oss.wps-presentation-template",
    mime: "application/wps-office.dpt",
    imported: { conformsTo: ["public.data", "public.presentation"], description: "WPS Presentation Template" },
  },
]);

const PRESENTATION_EXTENSIONS = Object.freeze(PRESENTATION_TYPES.map((type) => type.ext));

/** The macOS document type for the decks (CFBundleDocumentTypes entry),
 * leaving out the extensions another entry of the app already claims. */
function macPresentationDocumentType(name, { except = [] } = {}) {
  const types = PRESENTATION_TYPES.filter((type) => !except.includes(type.ext));
  return {
    CFBundleTypeName: name,
    CFBundleTypeRole: "Editor",
    LSHandlerRank: "Alternate",
    LSItemContentTypes: types.map((type) => type.uti),
    // Read only where a type is not declared anywhere (Launch Services
    // prefers LSItemContentTypes).
    CFBundleTypeExtensions: types.map((type) => type.ext),
  };
}

/** UTImportedTypeDeclarations for the types macOS itself does not declare. */
function macImportedTypeDeclarations() {
  return PRESENTATION_TYPES.filter((type) => type.imported).map((type) => ({
    UTTypeIdentifier: type.uti,
    UTTypeDescription: type.imported.description,
    UTTypeConformsTo: [...type.imported.conformsTo],
    UTTypeTagSpecification: { "public.filename-extension": [type.ext], "public.mime-type": [type.mime] },
  }));
}

module.exports = { PRESENTATION_TYPES, PRESENTATION_EXTENSIONS, macPresentationDocumentType, macImportedTypeDeclarations };
