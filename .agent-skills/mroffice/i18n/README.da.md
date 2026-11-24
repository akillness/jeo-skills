# MR Office — Dansk

<p align="center"><sub>🌐 <a href="../README.md">English</a> · <a href="../i18n/README.en-GB.md">English (UK)</a> · <a href="../i18n/README.zh.md">简体中文</a> · <a href="../i18n/README.zh-TW.md">繁體中文</a> · <a href="../i18n/README.ja.md">日本語</a> · <a href="../i18n/README.ko.md">한국어</a> · <a href="../i18n/README.de.md">Deutsch</a> · <a href="../i18n/README.fr.md">Français</a> · <a href="../i18n/README.es.md">Español</a> · <a href="../i18n/README.es-419.md">Español (Latinoamérica)</a> · <a href="../i18n/README.pt-BR.md">Português (Brasil)</a> · <a href="../i18n/README.it.md">Italiano</a> · <a href="../i18n/README.nl.md">Nederlands</a> · <a href="../i18n/README.sv.md">Svenska</a> · <a href="../i18n/README.da.md">Dansk</a> · <a href="../i18n/README.no.md">Norsk</a> · <a href="../i18n/README.fi.md">Suomi</a> · <a href="../i18n/README.id.md">Bahasa Indonesia</a> · <a href="../i18n/README.th.md">ไทย</a> · <a href="../i18n/README.vi.md">Tiếng Việt</a></sub></p>

<p align="center"><b>MR Office's open source-editore, den AI-kontorpakke der er tættest på Microsoft Office: dokumenter, regneark, præsentationer, PDF og kode i browseren, og en AI der redigerer rigtige Word-, Excel- og PowerPoint-filer sammen med dig.</b></p>

<p align="center"><a href="https://mroffice.ai/da"><b>▶ Prøv online</b></a> · <a href="https://mroffice.ai/da/office/download"><b>⬇ Download</b></a> · <a href="https://mroffice.ai">🌐 mroffice.ai</a><br><a href="https://mroffice.ai/da/developers">🧑‍💻 Udviklere</a> · <a href="https://mroffice.ai/da/developers/embed">🧩 Indlejr</a> · <a href="https://mroffice.ai/da/developers/mcp">🤖 MCP til AI-apps</a> · <a href="https://www.npmjs.com/package/mroffice-embed">📦 npm-SDK</a> · <a href="https://mroffice.ai/da/developers/oauth">🔑 Log ind med MR Office</a></p>

<p align="center"><a href="../LICENSE"><img alt="AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue"></a> <a href="https://github.com/XinaTian/MROffice/releases"><img alt="release" src="https://img.shields.io/github/v/release/XinaTian/MROffice"></a> <a href="https://github.com/XinaTian/MROffice/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/XinaTian/MROffice/actions/workflows/ci.yml/badge.svg"></a> <a href="https://github.com/XinaTian/MROffice/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/XinaTian/MROffice?style=social"></a></p>

<p align="center"><a href="https://mroffice.ai/da"><img src="../docs/media/mr-office-demo.webp" alt="MR Office's open source-editore, den AI-kontorpakke der er tættest på Microsoft Office: dokumenter, regneark, præsentationer, PDF og kode i browseren, og en AI der redigerer rigtige Word-, Excel- og PowerPoint-filer sammen med dig." width="100%"></a></p>

<p align="center"><a href="https://demo.mroffice.ai/media/mr-office-demo.mp4">🔊 Se den 50 sekunder lange rundvisning med lyd</a></p>

<table>
<tr>
<td align="center" width="50%"><a href="https://mroffice.ai/da"><img src="../docs/screenshots/docs.png" alt="Dokumenter" width="100%"></a><br><b>Dokumenter</b></td>
<td align="center" width="50%"><a href="https://mroffice.ai/da"><img src="../docs/screenshots/sheets.png" alt="Regneark" width="100%"></a><br><b>Regneark</b></td>
</tr>
<tr>
<td align="center" width="50%"><a href="https://mroffice.ai/da"><img src="../docs/screenshots/slides.png" alt="Præsentationer" width="100%"></a><br><b>Præsentationer</b></td>
<td align="center" width="50%"><a href="https://mroffice.ai/da"><img src="../docs/screenshots/pdf.png" alt="PDF" width="100%"></a><br><b>PDF</b></td>
</tr>
<tr>
<td align="center" width="50%"><a href="https://mroffice.ai/da"><img src="../docs/screenshots/code.png" alt="Kode" width="100%"></a><br><b>Kode</b></td>
</tr>
</table>

MR Office er en AI-kontorpakke til rigtige filer: Word, Excel, PowerPoint og PDF, på nettet og i en gratis desktop-app, med en AI ved siden af hvert dokument og live-samredigering. Dette repository udgiver kildekoden til pakkens editorer: de samme editorer som MR Office kører, og som du selv kan bygge, køre og integrere.

## Gratis for enkeltpersoner og små teams

- **MR Office online og desktop-appen** — gratis: ægte Word-, Excel-, PowerPoint- og PDF-redigering, live-samredigering og deling, på nettet, på telefoner og offline på din computer. AI'en kommer med en gratis daglig kvote; tungere AI-brug er en valgfri betalt plan.
- **Embed'en til din egen app** — gratis at starte, med alt inkluderet: den fulde formelmotor, ægte Office-filer, samredigering, alle eksportformater og automatiserings-API'en (1.000 sessioner om måneden på localhost, 100 på dine egne domæner, op til 2 apps, intet kort).
- **Virksomheder med tungere brug** — betal efter forbrug på en fuldt hostet tjeneste: Starter til US$29 om måneden med 5.000 sessioner, Pro til US$149 om måneden med 40.000 sessioner, white-label og prioriteret support. Ingen årlig licens, ingen servere at drive, ingen opgraderinger at håndtere: opdateringer, skalering og backups er vores.

Til sammenligning er ONLYOFFICE Docs Developer Edition listet fra omkring US$6.000 om året for 250 samtidige forbindelser på servere, du selv driver (forhandlerlistepris, november 2026); Univer Pros pris er ikke offentliggjort. [Priser og grænser →](https://mroffice.ai/da/developers/pricing)

## AI der arbejder inde i dine filer

I MR Office arbejder AI'en på selve dokumentet, ikke på tekst indsat i en chat. Den læser filen, foretager ændringen i filens egne objekter og viser dig, hvad den har rørt ved, før du beholder det.

- **Copilot i hver editor** — dokumenter, regneark, præsentationer, PDF og kode. Markér eller tegn en cirkel om det, du mener, og sig, hvad du vil have: den redigerer afsnit, tabeller, celler og formler, figurer og slides direkte, spørger når anmodningen er uklar, viser ændringen før den gemmes, og hver ændring kan fortrydes.
- **Ændringer du gennemgår** — det AI'en foreslår, anvendes kun når du bekræfter det; hvis filen er ændret i mellemtiden, er forslaget ugyldigt, og intet af det, du har skrevet, overskrives.
- **Et AI-vindue der kender dit workspace** — spørg om dine filer, noter og canvas og få svar der citerer deres kilder; den udkaster nye dokumenter, regneark og præsentationer og bygger et lille værktøj på canvas, når du har brug for det.
- **Hukommelse** — en hukommelsesgraf holder styr på de personer, projekter og beslutninger, der betyder noget, så AI'en ikke starter fra nul i hver samtale.
- **Førende modeller** — vælg modellen til hver samtale blandt tidens førende AI-modeller; dine filer bliver i dit workspace, eller på din egen computer med desktop-appen.

**[Prøv AI'en i MR Office, gratis →](https://mroffice.ai/da)**

### Lad din AI-agent redigere Office-filer (MCP)

Claude, ChatGPT, Cursor, Codex, VS Code og enhver anden MCP-klient kan oprette, åbne, redigere, læse tilbage, gengive og eksportere dokumenter og regneark via MR Office's MCP-server (`create_document`, `open_document`, `update_document`, `get_document`, `render_page`, `export_document` til docx, xlsx, pptx, pdf, md, html eller csv). I apps der viser MCP Apps, vises editoren direkte i samtalen; andre steder svarer værktøjerne med et link til den samme editor og et billede af siden. Du og AI'en redigerer det samme dokument: assistenten læser dine ændringer tilbage, før den fortsætter, og en opdatering oven på ændringer, den ikke har set, afvises i stedet for at gå tabt.

```bash
# Claude Code
claude mcp add mroffice -- npx -y mroffice-mcp
# Codex
codex mcp add mroffice -- npx -y mroffice-mcp
```

Claude Desktop, Cursor og andre apps der tager en JSON-konfiguration:

```json
{ "mcpServers": { "mroffice": { "command": "npx", "args": ["-y", "mroffice-mcp"] } } }
```

Ingen installation: forbind det hostede endpoint `https://mcp.mroffice.ai/mcp` og log ind med din MR Office-konto. Word-, Excel- og PowerPoint-filer går gennem MR Office's Office-motor som din egen konto; MCP-serverens kildekode ligger i `apps/mcp`. [MCP-guide →](https://mroffice.ai/da/developers/mcp)

## For udviklere

Alt for udviklere findes på **[MR Office Developers](https://mroffice.ai/da/developers)** — selvbetjening, ingen ansøgning: log ind med en hvilken som helst MR Office-konto og kom i gang.

### Indlejr editorerne i din webapp (anbefalet)

MR Office hoster editorerne; din server signerer et kortlivet sessionstoken, og din side åbner editoren. Den redigerer rigtige Word-, Excel-, PowerPoint- og PDF-filer (.docx, .xlsx, .pptx, .pdf) med den fulde formelmotor, samredigering, uploads, alle eksportformater, udskrivning, automatiserings-API'et (dokumentobjektmodel, makroer, plugins) og gemninger sendt tilbage til din server i et signeret callback. Alt sammen er i Free-planen: 1.000 sessioner om måneden på localhost, 100 på dine egne domæner, op til 2 apps, intet kort påkrævet. Som hostet tjeneste pålægger den ikke din egen app nogen AGPL-forpligtelser.

1. Kør `npx mroffice-embed init` i projektets mappe (eller opret en app i udviklerkonsollen): ét klik på "Tillad" i browseren, så skrives appens nøgler til `.env.local` / `.env`.
2. Din server laver et sessionstoken med `createSessionToken` fra `mroffice-embed/server`; den hemmelige nøgle forlader aldrig serveren.
3. Din side åbner editoren med `open()` fra `mroffice-embed` (eller scriptet `https://mroffice.ai/embed/v1/embed.js`).

```js
// server: GET /api/mroffice/session (check who is signed in first)
import { createSessionToken } from "mroffice-embed/server";
const token = await createSessionToken({
  appId: process.env.MROFFICE_APP_ID,
  secretKey: process.env.MROFFICE_SECRET_KEY, // mro_sk_..., server only
  file: { key: "contract-42", name: "contract.docx", url: signedUrlToTheFile },
  user: { id: user.id, name: user.name },
  mode: "edit",
});

// page
import { open } from "mroffice-embed";
open({ container: "#editor", token: () => fetch("/api/mroffice/session").then((r) => r.json()).then((b) => b.token) });
```

[Guide til indlejring](https://mroffice.ai/da/developers/embed) · [Guiden som Markdown (til AI-agenter)](https://mroffice.ai/developers/embed.md) · [Priser og grænser](https://mroffice.ai/da/developers/pricing) · [Udviklerkonsol](https://mroffice.ai/da/developers/console) · [Livedemo](https://mroffice.ai/da/developers/embed/demo)

### AI-apps: MCP-serveren

MCP-serveren ovenfor er også måden, hvorpå dine egne AI-funktioner kan åbne, læse, redigere og eksportere dokumenter i den rigtige MR Office-editor: det hostede endpoint `https://mcp.mroffice.ai/mcp` (OAuth-login, ingen nøgle) eller `npx -y mroffice-mcp` på din egen computer. [MCP-guide →](https://mroffice.ai/da/developers/mcp)

### Log ind med MR Office (OAuth)

MR Office er en OAuth 2.1-autorisationsserver (PKCE, metadatadokumenter for klient-id, dynamisk registrering): din app kan logge folk ind med deres MR Office-konto og handle med de rettigheder, de tillader. [OAuth-guide →](https://mroffice.ai/da/developers/oauth)

### Host selv open source-editorerne

De fem editorer i dette repository kan bygges ind i dit eget produkt under AGPL-3.0: hvis folk bruger en ændret version over et netværk, skal du tilbyde dem dens komplette kildekode og bevare "MR Office"-krediteringen (NOTICE.md). De åbner deres egne formater, CSV, HTML, Markdown og PDF; Word-, Excel- og PowerPoint-filer følger med den hostede embed ovenfor, Free-plan inkluderet. En kommerciel licens fås via support@mr-note.com. [Open source-guide →](https://mroffice.ai/da/developers/open-source)

Editorene findes på npm som React-komponenter: `npm i mroffice-docs mroffice-core` (og `mroffice-sheets`, `mroffice-slides`, `mroffice-pdf`, `mroffice-code`); hver pakkes README viser, hvordan den indlejres.

## Editorerne

Hvad hver editor gør i dette repository:

- **Dokumenter** — en ordbehandler med sider: skrifttyper, afsnitsformatering, lister og typografier under Hjem; forside og tomme sider, sideskift, tabeller, billeder, figurer, SmartArt, diagrammer, links, bogmærker, kommentarer, sidehoveder, sidefødder og sidetal, ligninger, symboler, tekstbokse og WordArt under Indsæt. Gemmer sit eget format (.mrdoc); åbner HTML, Markdown og almindelig tekst.
- **Regneark** — celler og formler med skrifttyper, justering, talformater, betinget formatering, cellestile og indsættelse eller sletning af celler under Hjem; tabeller, billeder, figurer, ikoner, afkrydsningsfelter, diagrammer og sparklines under Indsæt; flere ark, med sum og gennemsnit af markeringen. Aritmetik mellem celler (=A1*B1+10) beregnes live i browseren, mens du skriver, og enhver formel i en fil bevares intakt; den fulde formelmotor (SUM, IF, VLOOKUP og hundredvis flere) kører gratis i MR Office-skrivebordsappen og i den hostede embeds Free-plan. Gemmer sit eget format (.mrsheet); åbner og gemmer CSV og TSV.
- **Præsentationer** — slides med layouts og sektioner, tekst, skrifttyper og afsnit samt figurer med deres arrangement under Hjem; tabeller, billeder, ikoner, SmartArt, diagrammer, tekstbokse, WordArt, sidehoveder og sidefødder, ligninger, symboler og video under Indsæt; talernoter, kommentarer og præsentation. Gemmer sit eget format (.mrslides).
- **PDF** — læs, præsentér og udskriv PDF-filer: enkelt- og topagesvisning, kontinuerlig rulning, rotation, miniaturer og læsetilstand, søgning og kopiering af deres tekst samt kommentarer; redigering af en PDF's egen tekst og lagring tilbage i filen er gratis i MR Office-skrivebordsappen og den hostede embed.
- **Kode** — en hurtig kodeeditor med syntaksfremhævning til mange sprog, en oversigt, søgning, hurtig åbning, en filoversigt og en problemliste.

Formler med funktioner (SUM, IF, VLOOKUP og hundredvis flere), Word-, Excel- og PowerPoint-filer, diagrammer, SmartArt og automatiserings-API'et er gratis at bruge: i den gratis MR Office-skrivebordsapp og i din egen app via den hostede embeds Free-plan. Filer bevarer enhver formel, diagram og SmartArt intakt i open source-editorerne også.

## Kør editorerne

**▶ [Prøv live-demoen – ingen installation](https://mroffice.ai/da)**

De fem editore findes i `packages/` (`@mrnote/docs`, `sheets`, `slides`, `pdf`, `code`, som deler `@mrnote/core`) og kører sammen i `apps/playground`:

```bash
npm install
npm run fonts     # the open substitutes for Office's fonts
npm run build
npm run preview   # http://localhost:5178
```

`npm run dev` starter en udviklingsserver på samme adresse, og `npm run smoke` tjekker et build. Hver pakkes README beskriver i detaljer, hvad den gør, og hvordan den indlejres.

## Skrivebordsapp

[`apps/desktop`](../apps/desktop) indeholder **MR Office Editors**: kilden til MR Office-skrivebordsappens shell (Electron) under sin egen identitet. Med den gratis MR Office-komponent fra Releases er det MR Office-skrivebordsappen med Word-, Excel-, PowerPoint- og PDF-filer, login og AI. Uden komponenten kører den open source-editorene alene, som åbner .mrdoc-, .mrsheet- og .mrslides-filer, CSV, HTML, Markdown og PDF. Shellen og editorene er AGPL-kildekode; komponenten er en gratis download fra Releases. Efter `npm run build` startes den med:

```bash
npm run desktop
```

## Få alle funktioner: installér MR Offices skrivebordsapp (gratis)

MR Office-skrivebordsappen er gratis, har disse editorer og den fulde service og fungerer offline på din egen computer. Den bringer også:

- Åbne og gemme Word-, Excel- og PowerPoint-filer (.docx, .xlsx, .pptx)
- Formler med funktioner (SUM, IF, VLOOKUP …), beregnet af den fulde formelmotor
- Diagrammer beregnet og tegnet ud fra dine data
- Redigering af SmartArt
- Gemme ændringer i en PDF tilbage i filen
- Automatiserings-API'et: dokumentobjektmodellen, makroer og plugins

**[Download MR Office (gratis) →](https://mroffice.ai/da/office/download)**

## Sådan hænger delene sammen

```mermaid
flowchart LR
  subgraph OSS["Open source · AGPL-3.0"]
    direction LR
    core["@mrnote/core"] --> E["De fem editore<br/>Dokumenter · Regneark · Præsentationer · PDF · Kode"]
    E --> PG["apps/playground<br/>Browser"]
    E --> DS["apps/desktop<br/>Skrivebordsskal"]
    MCP["apps/mcp<br/>MCP-server til AI-apps"]
  end
  COMP["MR Office-komponent: Word-, Excel- og PowerPoint-filer · gratis"] -.-> DS
```

## Licens

Open source under GNU Affero General Public License v3.0 (LICENSE) med de yderligere vilkår i NOTICE.md: bevar angivelsen "MR Office" og linket til https://mroffice.ai, og ingen rettigheder til navnet eller logoet MR Office. En kommerciel licens fås via support@mr-note.com. Software og data fra tredjeparter står i THIRD_PARTY_NOTICES.md. Bidrag: se CONTRIBUTING.md.

## Mere

Websted og hele produktet: **https://mroffice.ai** · Spørgsmål og feedback: support@mr-note.com

<p align="center">Hvis MR Office er nyttigt for dig, hjælper en ⭐ på GitHub andre med at finde det.</p>
