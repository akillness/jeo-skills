/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The README of each npm package (scripts/npm/pack.mjs).

const REPO = "https://github.com/XinaTian/MROffice";
const EMBED = "https://mroffice.ai/developers";

const officeFiles = `## Word, Excel and PowerPoint files

These packages are the open-source editors: they open and save their own formats (and HTML, Markdown, CSV, PDF). To open and save **.docx, .xlsx and .pptx** with full fidelity in your site, use the hosted MR Office editor: [mroffice.ai/developers](${EMBED}) and the npm package [\`mroffice-embed\`](https://www.npmjs.com/package/mroffice-embed). The free [desktop app](${REPO}/releases) opens them on a computer.`;

function assetsSection(config, version) {
  const assets = config.assets.name;
  return `## Assets (fonts, PDF worker, dictionaries)

The installed packages hold the code and the stylesheet. The heavy files the editors fetch as they need them (the fonts that stand in for Office's, the PDF worker and its data, spelling dictionaries, the code runners' WebAssembly, the interface text in languages other than English) are the package [\`${assets}\`](https://www.npmjs.com/package/${assets}), fetched by default from jsDelivr: \`https://cdn.jsdelivr.net/npm/${assets}@${version}/\`. Nothing to configure.

To serve them from your own site instead:

\`\`\`sh
npm i -D ${assets}@${version}
cp -R node_modules/${assets} public/mroffice-assets
\`\`\`

\`\`\`ts
// in a module imported before the editors
import { configureEditors } from "mroffice-core";
configureEditors({ assetsBaseUrl: "/mroffice-assets/" });
\`\`\`

and import \`style.self-hosted.css\` in place of \`style.css\` (it leaves out the font declarations, which then come from \`/mroffice-assets/fonts.css\`; put \`<link rel="stylesheet" href="/mroffice-assets/fonts.css">\` in the page's \`<head>\` to have them from the first paint).`;
}

const frameworks = (name) => `## Next.js, webpack, Vite

The packages are ES modules with their types and a prebuilt stylesheet: no Tailwind, PostCSS or bundler settings needed. React 19 is a peer dependency.

In **Next.js** (App Router) the editors run in the browser only: load the component above without server rendering.

\`\`\`tsx
// app/editor/page.tsx
"use client";
import dynamic from "next/dynamic";
const Editor = dynamic(() => import("./Editor"), { ssr: false });
export default function Page() { return <Editor />; }
\`\`\`

With **webpack**, the stylesheet import needs a CSS loader (\`css-loader\` + \`style-loader\` or \`mini-css-extract-plugin\`). Import \`${name}/style.css\` once; every editor package's \`style.css\` is the same stylesheet.`;

const license = `## License

[AGPL-3.0-only](./LICENSE) with the additional terms in [NOTICE.md](./NOTICE.md): a copy or modified version that shows a user interface keeps a reasonable attribution to the original work (the text "MR Office" linking to https://mroffice.ai), and the names "MR Office" and "MR Note" are not licensed as trademarks. The bundled third-party code and its licenses are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). A commercial license is available: support@mr-note.com.

The source is [${REPO}](${REPO}) (packages/, built with \`npm run pack:npm\`).`;

function editorReadme(pkg, config, version) {
  const info = config.packages[pkg];
  const name = info.name;
  const ident = { docs: "docs", sheets: "sheets", slides: "slides", pdf: "pdf", code: "code" }[pkg];
  const file = pkg === "pdf"
    ? `declare const pdfBytes: Uint8Array; // a PDF's bytes (from <input type="file">, fetch(), ...)\nconst file = { id: "1", name: "paper.pdf", bytes: pdfBytes };`
    : `const file = { id: "1", ...${ident}.newFile!() }; // or { id, name, bytes } of a file you have`;
  return `# ${name}

The ${info.label} of [MR Office](https://mroffice.ai), as a React component. ${info.description.replace(/^[^:]*: /, "").replace(/^./, (c) => c.toUpperCase())}

- Opens ${info.opens}; saves ${info.saves}.
- Runs in the browser on a file you hand it; nothing is sent anywhere.

\`\`\`sh
npm i ${name} ${config.packages.core.name}
\`\`\`

## Use

\`\`\`tsx
import { EditorHostProvider, browserDownloadHost, type SavedFile } from "${config.packages.core.name}";
import ${ident} from "${name}";
import "${name}/style.css";

${file}
let save: () => Promise<SavedFile> | SavedFile;

export default function Editor() {
  return (
    <div style={{ height: "100vh" }}>
      <EditorHostProvider locale="en">
        <${ident}.Component
          file={file}
          registerSave={(saver) => { save = saver; return () => {}; }}
          onSaveRequest={async () => { const out = await save(); browserDownloadHost.saveFile({ name: out.name, type: out.type, data: new Blob([out.bytes as BlobPart], { type: out.type }) }); }}
        />
      </EditorHostProvider>
    </div>
  );
}
\`\`\`

The editor fills its container: give it a height. \`registerSave\` receives a function that returns the current file (\`{ name, type, bytes }\`); \`onSaveRequest\` fires on the editor's own Save (ribbon, Ctrl/Cmd+S). \`EditorHostProvider\` takes the interface language (\`locale\`: en, de, es, fr, ja, ko, zh, ... see \`EDITOR_LOCALES\`) and a \`host\` (\`saveFile\`, \`notify\`) for what the editor hands out. The default export is an \`EditorDefinition\` (\`extensions\`, \`newFile\`, \`Component\`); the component is also exported by name.

What works in the open-source build, feature by feature: [packages/${pkg}/README.md](${REPO}/blob/main/packages/${pkg}/README.md).

${officeFiles}

${frameworks(name)}

${assetsSection(config, version)}

${license}
`;
}

function coreReadme(config, version) {
  const core = config.packages.core.name;
  const editors = Object.entries(config.packages).filter(([pkg]) => pkg !== "core");
  return `# ${core}

The shared layer of the [MR Office](https://mroffice.ai) editors, which every editor package depends on: the **host adapter** through which a page embeds an editor, the Office-style ribbon, fonts and text measurement, themes, charts, SmartArt and equations, and the interface text.

| Package | Editor |
|---|---|
${editors.map(([, info]) => `| [\`${info.name}\`](https://www.npmjs.com/package/${info.name}) | ${info.label} |`).join("\n")}

\`\`\`sh
npm i ${core} ${editors[0][1].name}
\`\`\`

## The host adapter

\`\`\`tsx
import { EditorHostProvider, type EditorHost } from "${core}";

const host: EditorHost = {
  saveFile({ name, data }) { /* a file the editor hands out (an export, a download) */ },
  notify({ title, description }) { /* a toast */ },
};

<EditorHostProvider host={host} locale="en" fallback={<p>Loading…</p>}>
  {/* an editor: <docs.Component file={...} registerSave={...} onSaveRequest={...} /> */}
</EditorHostProvider>
\`\`\`

- \`EditorHostProvider\`: the host (\`saveFile\`, \`notify\`; by default files are downloaded) and the interface language (\`EDITOR_LOCALES\`).
- Every editor package's default export is an \`EditorDefinition\`: \`extensions\` it opens, \`newFile()\`, and \`Component\` taking \`{ file, registerSave, onSaveRequest, onDirty? }\` (\`EditorProps\`).
- \`configureEditors({ assetsBaseUrl, sandboxOrigin })\`: where the assets are fetched from (below) and the origin of the Python sandbox page.
- \`import "${core}/style.css"\`: the editors' stylesheet (each editor package carries the same file as \`<editor>/style.css\`). It includes a CSS reset of the page (Tailwind's preflight), as the editors expect; load it on the pages that show an editor.

The workspace, accounts, collaboration and AI of MR Office are not part of the open-source editors: where an editor would reach them it reaches the host, and a feature the host does not provide is absent.

${officeFiles}

${frameworks(core)}

${assetsSection(config, version)}

${license}
`;
}

export function readmeFor(pkg, config, version) {
  return pkg === "core" ? coreReadme(config, version) : editorReadme(pkg, config, version);
}

export function assetsReadme(config, version) {
  const assets = config.assets.name;
  return `# ${assets}

The files the [MR Office](https://mroffice.ai) editors (\`${config.packages.core.name}\`, \`${Object.values(config.packages).filter((info) => info.label).map((info) => info.name).join("`, `")}\`) fetch as they need them: the open fonts that stand in for Office's (with their licenses), the PDF.js worker, CMaps, standard fonts and decoders, the spelling dictionaries, the code runners (Lua, SQL, shell, Go WebAssembly; the Python sandbox page), and the interface text in languages other than English.

**Not a dependency to import.** The editors fetch these files from jsDelivr's copy of this package of the same version (\`https://cdn.jsdelivr.net/npm/${assets}@${version}/\`). To host them yourself:

\`\`\`sh
npm i -D ${assets}@${version}
cp -R node_modules/${assets} public/mroffice-assets
\`\`\`

\`\`\`ts
import { configureEditors } from "${config.packages.core.name}";
configureEditors({ assetsBaseUrl: "/mroffice-assets/" });
\`\`\`

and use \`style.self-hosted.css\` of the editor package with \`<link rel="stylesheet" href="/mroffice-assets/fonts.css">\` in the page.

Running Python needs \`python-sandbox.html\` served from another origin than the page (\`configureEditors({ sandboxOrigin })\`); running code in the other languages needs the files served by your site or the CDN.

## License

The editors' own files: AGPL-3.0-only with the additional terms in NOTICE.md. Each font is under its own license, in the folder beside it (licenses/ and fonts/**); PDF.js data: Apache-2.0; the dictionaries: their licenses in proofing/. Third-party notices: THIRD_PARTY_NOTICES.md. Source: https://github.com/XinaTian/MROffice.
`;
}
