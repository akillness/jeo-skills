// Which editor a file opens in, and what the model reads of a document:
// the editor's own files (.mrdoc, .mrsheet) as Markdown and CSV, text files
// as they are.

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export type Kind = "document" | "spreadsheet" | "presentation" | "pdf" | "text";

/** Formats the server takes in and their kind. `office` ones need the engine. */
export const FORMATS: Record<string, { kind: Kind; office?: boolean; mime: string }> = {
  docx: { kind: "document", office: true, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { kind: "spreadsheet", office: true, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { kind: "presentation", office: true, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  md: { kind: "document", mime: "text/markdown" },
  markdown: { kind: "document", mime: "text/markdown" },
  html: { kind: "document", mime: "text/html" },
  htm: { kind: "document", mime: "text/html" },
  txt: { kind: "document", mime: "text/plain" },
  mrdoc: { kind: "document", mime: "application/json" },
  csv: { kind: "spreadsheet", mime: "text/csv" },
  tsv: { kind: "spreadsheet", mime: "text/tab-separated-values" },
  mrsheet: { kind: "spreadsheet", mime: "application/json" },
  mrslides: { kind: "presentation", mime: "application/json" },
  pdf: { kind: "pdf", mime: "application/pdf" },
};

export function extensionOf(name: string): string {
  const lower = name.toLowerCase().replace(/\.json$/, "");
  const at = lower.lastIndexOf(".");
  return at >= 0 ? lower.slice(at + 1) : "";
}

export function stem(name: string): string {
  return name.replace(/\.(mrdoc|mrsheet|mrslides)(\.json)?$|\.[^.]+$/i, "") || "Untitled";
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "Untitled";
}

// ------------------------------------------------------------ the documents

export interface MrDoc {
  format: "mrnote.document";
  version: 1;
  title: string;
  content: DocNode;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export function mrdocBytes(title: string, content: DocNode): Uint8Array {
  const file: MrDoc = { format: "mrnote.document", version: 1, title, content };
  return encoder.encode(`${JSON.stringify(file)}\n`);
}

export function parseMrdoc(bytes: Uint8Array): MrDoc {
  const parsed = JSON.parse(decoder.decode(bytes)) as MrDoc;
  if (parsed?.format !== "mrnote.document" || !parsed.content) throw new Error("not an MR Office document file");
  return parsed;
}

function inline(nodes: DocNode[] | undefined): string {
  let out = "";
  for (const node of nodes ?? []) {
    if (node.type === "text") {
      let text = node.text ?? "";
      const marks = new Set((node.marks ?? []).map((mark) => mark.type));
      if (marks.has("code")) text = `\`${text}\``;
      if (marks.has("bold") && text.trim()) text = `**${text}**`;
      if (marks.has("italic") && text.trim()) text = `*${text}*`;
      if (marks.has("strike") && text.trim()) text = `~~${text}~~`;
      const link = node.marks?.find((mark) => mark.type === "link");
      if (link?.attrs?.href) text = `[${text}](${String(link.attrs.href)})`;
      out += text;
    } else if (node.type === "hardBreak") out += "  \n";
    else if (node.type === "image") out += `![${String(node.attrs?.alt ?? "image")}]`;
    else out += inline(node.content);
  }
  return out;
}

function cellText(cell: DocNode): string {
  return (cell.content ?? []).map((child) => inline(child.content ?? [child])).join(" ").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function blocks(nodes: DocNode[] | undefined, indent = ""): string[] {
  const out: string[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
        out.push(`${"#".repeat(level)} ${inline(node.content)}`);
        break;
      }
      case "paragraph":
        out.push(`${indent}${inline(node.content)}`);
        break;
      case "bulletList":
      case "orderedList":
      case "taskList": {
        let index = Number(node.attrs?.start ?? 1);
        const lines: string[] = [];
        for (const item of node.content ?? []) {
          const [first, ...rest] = blocks(item.content, `${indent}   `);
          const bullet = node.type === "orderedList" ? `${index++}.` : node.type === "taskList" ? (item.attrs?.checked ? "- [x]" : "- [ ]") : "-";
          lines.push(`${indent}${bullet} ${(first ?? "").trimStart()}`, ...rest);
        }
        out.push(lines.join("\n"));
        break;
      }
      case "blockquote":
        out.push(...blocks(node.content).map((line) => `> ${line}`));
        break;
      case "codeBlock":
        out.push(`\`\`\`${String(node.attrs?.language ?? "")}\n${inline(node.content)}\n\`\`\``);
        break;
      case "horizontalRule":
        out.push("---");
        break;
      case "table": {
        const rows = (node.content ?? []).map((row) => (row.content ?? []).map(cellText));
        if (!rows.length) break;
        const width = Math.max(...rows.map((row) => row.length));
        const pad = (row: string[]) => [...row, ...Array(width - row.length).fill("")];
        out.push([`| ${pad(rows[0]).join(" | ")} |`, `|${" --- |".repeat(width)}`, ...rows.slice(1).map((row) => `| ${pad(row).join(" | ")} |`)].join("\n"));
        break;
      }
      default:
        if (node.content?.length) out.push(...blocks(node.content, indent));
        else if (node.text) out.push(node.text);
    }
  }
  return out;
}

/** A document's content as Markdown, for the model. */
export function documentMarkdown(content: DocNode): string {
  return blocks(content.content).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ------------------------------------------------------------- spreadsheets

interface Workbook {
  type: string;
  title?: string;
  sheets: { name: string; cells: Record<string, { value?: unknown; formula?: string }> }[];
}

function quoteCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Each sheet of an .mrsheet workbook as CSV (formulas as `=...` after the value). */
export function workbookCsv(bytes: Uint8Array): { name: string; csv: string; rows: number; columns: number }[] {
  const book = JSON.parse(decoder.decode(bytes)) as Workbook;
  return (book.sheets ?? []).map((sheet) => {
    let rows = 0;
    let columns = 0;
    for (const key of Object.keys(sheet.cells ?? {})) {
      const [r, c] = key.split(":").map(Number);
      rows = Math.max(rows, r + 1);
      columns = Math.max(columns, c + 1);
    }
    const lines: string[] = [];
    for (let r = 0; r < rows; r += 1) {
      const line: string[] = [];
      for (let c = 0; c < columns; c += 1) {
        const cell = sheet.cells[`${r}:${c}`];
        line.push(quoteCsv(cell ? String(cell.value ?? "") : ""));
      }
      lines.push(line.join(","));
    }
    return { name: sheet.name, csv: lines.join("\n"), rows, columns };
  });
}

// ---------------------------------------------------------------- Markdown

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** Markdown (the common part: headings, paragraphs, lists, tables, quotes,
 * code, rules) as HTML the document editor imports. */
export function markdownToHtml(markdown: string, title?: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;
  const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      html.push(`<h${heading[1].length}>${inlineHtml(heading[2].trim())}</h${heading[1].length}>`);
      index += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) body.push(lines[index++]);
      index += 1;
      html.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }
    if (isTableRow(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const head = cells(line);
      index += 2;
      const body: string[][] = [];
      while (index < lines.length && isTableRow(lines[index])) body.push(cells(lines[index++]));
      html.push(
        `<table><thead><tr>${head.map((cell) => `<th>${inlineHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body
          .map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) body.push(lines[index++].replace(/^>\s?/, ""));
      html.push(`<blockquote>${markdownToHtml(body.join("\n"))}</blockquote>`);
      continue;
    }
    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    if (listItem.test(line)) {
      const ordered = /\d/.test(line.match(listItem)![2]);
      const items: string[] = [];
      while (index < lines.length && listItem.test(lines[index])) {
        const match = lines[index].match(listItem)!;
        items.push(`<li><p>${inlineHtml(match[3].replace(/^\[[ xX]\]\s+/, ""))}</p></li>`);
        index += 1;
      }
      html.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|>\s?|\s*([-*+]|\d+[.)])\s+)/.test(lines[index]) && !isTableRow(lines[index])) {
      paragraph.push(lines[index++].trim());
    }
    if (!paragraph.length) {
      paragraph.push(lines[index++].trim());
    }
    html.push(`<p>${inlineHtml(paragraph.join(" "))}</p>`);
  }
  const head = title ? `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` : `<head><meta charset="utf-8"></head>`;
  return `<!doctype html><html>${head}<body>${html.join("\n")}</body></html>\n`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** HTML (what the model wrote, before the editor has read it) as Markdown-ish text. */
export function htmlToMarkdown(html: string): string {
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  return body
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `\n\n${"#".repeat(Number(level))} ${text}\n\n`)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|blockquote|ul|ol|table|pre)>/gi, "\n\n")
    .replace(/<tr[^>]*>/gi, "\n|")
    .replace(/<\/t[dh]>/gi, " |")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** CSV rows (RFC 4180: quoted fields, doubled quotes, line breaks in quotes). */
export function parseCsv(text: string, separator = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** A CSV as the spreadsheet editor's workbook (one sheet), for the engine's
 * Excel writer: numbers as numbers, `=...` as formulas, the rest as text. */
export function csvWorkbook(text: string, title: string, separator = ","): Record<string, unknown> {
  const rows = parseCsv(text.replace(/^﻿/, ""), separator);
  const cells: Record<string, { value: string; kind: string; formula?: string }> = {};
  let columns = 0;
  rows.forEach((row, r) => {
    columns = Math.max(columns, row.length);
    row.forEach((value, c) => {
      if (value === "") return;
      if (value.startsWith("=") && value.length > 1) cells[`${r}:${c}`] = { value, kind: "text", formula: value };
      else if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value.trim())) cells[`${r}:${c}`] = { value: value.trim(), kind: "number" };
      else cells[`${r}:${c}`] = { value, kind: "text" };
    });
  });
  const name = (safeFileName(title).replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet1").slice(0, 31);
  return {
    type: "mrnote.spreadsheet.v1",
    activeSheetId: "sheet-1",
    sheets: [{ id: "sheet-1", name, rowCount: Math.max(rows.length, 1), columnCount: Math.max(columns, 1), cells }],
  };
}
