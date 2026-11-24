# MR Office Editors (desktop)

MR Office Editors is the source code of the MR Office desktop app's shell,
built under an identity of its own. It is an Electron app. It runs in one of
two ways:

- **With the MR Office component**, it is the MR Office desktop app. It opens
  and saves Word, Excel, PowerPoint and PDF files, calculates formulas with
  functions, and draws charts and SmartArt. It writes PDF edits back into the
  file, and you can sign in with an MR Office account to use AI. The
  component is the compiled local service that the MR Office installer
  ships: the API, the web app, the file engines and their runtime. It is
  free to use.
- **Without the component**, it runs the open-source editors in this
  repository on their own. They open `.mrdoc`, `.mrsheet` and `.mrslides`
  files, CSV, HTML, Markdown and PDF, and save the editors' own
  formats and CSV back into the same file. When you open a Word, Excel or
  PowerPoint file, the app tells you where to get the component.

## What is in this repository, and what you download

| Part | Where | License |
| --- | --- | --- |
| The desktop shell (this folder) | source, here | GNU AGPL-3.0 with the terms in [NOTICE.md](../../NOTICE.md) |
| The editors (`packages/*`, `apps/playground`) | source, here | GNU AGPL-3.0 with the terms in NOTICE.md |
| The MR Office component | compiled, on [Releases](https://github.com/XinaTian/MROffice/releases) | its own license (`LICENSE-COMPONENT.md` in the download): free to use; modified copies may not be distributed |


## Build and run

You need Node.js 20.19 or later. Run these from the repository's root:

```bash
npm install
npm run fonts      # the open substitutes for Office's fonts
npm run build      # builds the editors (apps/playground/dist)
npm run desktop    # installs Electron in apps/desktop and starts the app
```

To build the app itself, unpacked:

```bash
npm run desktop:package    # apps/desktop/release/
```

Or build the installers with `npm --prefix apps/desktop run dist`: a .dmg and
.zip on macOS, an NSIS installer on Windows. electron-builder builds for the
system it runs on. The builds are not signed with a certificate. On macOS
the app gets only the ad-hoc signature that Apple silicon needs to run it.

Tests: `npm --prefix apps/desktop test` (Node's test runner; no window is
opened).

## Installing the MR Office component

1. On [Releases](https://github.com/XinaTian/MROffice/releases), download the
   component for your computer (for example
   `MR-Office-Component-<version>-mac-arm64.zip`). It must be the one built
   for your version of MR Office Editors: the release that carries the source
   you built.
2. Unpack the .zip, or copy the folder out of the .dmg, so that the folder
   holding `component.json` is
   `~/Library/Application Support/MR Office Editors/component` (macOS).
3. Start MR Office Editors again.

The app also uses a component in the folder named by `MROFFICE_COMPONENT_DIR`.
If `apps/desktop/component` holds an unpacked component when you run
`npm run desktop:package`, the component is packed into the app, and the
package is then the whole MR Office desktop app.

A component fits a shell only when it was built for the same bridge between
the shell and the component's pages and services. `component.json` names that
contract, and so does `component-contract.json` here. If they differ, or the
component is incomplete or built for another system, the app does not start
it. Instead it says why and where to get the right one.

The component is available for macOS on Apple silicon, as a disk image
(.dmg) and a .zip. MR Office signs the macOS component with its Developer ID
and Apple notarizes it, so Gatekeeper opens it without a warning. MR Office
Editors itself, built from this source, is not signed. A Windows component
is not signed yet; Windows SmartScreen warns about it until it is.

## How it differs from the MR Office app on Releases

- **Its own identity.** The two apps never collide, and both can be
  installed side by side:

  | | |
  | --- | --- |
  | Name | MR Office Editors |
  | Bundle id / AppUserModelId | `ai.mroffice.editors.oss` |
  | Data folder | `MR Office Editors` in the system's app-data folder |
  | Sign-in link scheme | `mroffice-oss` |
  | Windows ProgIDs | `MROfficeEditors.Document`, `.Workbook`, `.Presentation`, `.PDF`, `.Markdown`, `.CSV` |

- **No automatic updates.** The app never checks a feed, downloads or
  installs anything by itself. Check for Updates opens the Releases page.
- **No signing.** There are no certificates and no notarization.
- **No release, signing, notarization or publishing scripts.** Those stay
  with MR Office.

If you distribute a fork, give it an identity of your own: change
`products.cjs`, `package.json` (`productName`) and `src/editors/brand.ts`.
The license's additional terms (NOTICE.md) give no rights to the MR Office
name or logo.

## What reaches the network

- **Without the component:** nothing. Links open in your default browser.
- **With the component:**
  - Its services listen on 127.0.0.1 only. Your notebooks and files stay on
    this computer.
  - It reads MR Office's public settings for desktop apps from MR Office's
    servers.
  - Signing in opens MR Office's sign-in page in your browser, which hands
    the app a one-time code on the `mroffice-oss` scheme.
  - After you sign in, AI runs through MR Office's servers on your account.
  - Some conversions offer to download LibreOffice.

## How it works

| File | What it does |
| --- | --- |
| `src/entry.ts` | looks for the component (`src/component.ts`) and starts one of the two modes |
| `src/classic/` | the MR Office desktop app's shell: windows, the local services (`services.ts`), sign-in (`ai-account.ts`), file handling, printing, the AI's tools |
| `src/*.ts` | the modules the shell shares: menus, file types, default app, permissions; `updates.ts` is this build's (no updates) |
| `src/editors/` | the open-source editors on their own: a loopback server for their build, a bridge for opening and saving files, menus |
| `products.cjs`, `document-types.cjs` | this build's identity, and the file types registered with the system |
| `../playground/src/desktop.ts` | the editors page's side of the bridge |

## License

The source here is under the GNU AGPL-3.0 with the additional terms in
[NOTICE.md](../../NOTICE.md), like the rest of this repository. The MR
Office component is under its own license.
