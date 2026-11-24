// open_document's url: an http(s) file, fetched with a size cap and never
// from this machine's or a private network's addresses (unless the server is
// told it runs for local development).

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { Config } from "./config.ts";

function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function fetchDocumentUrl(raw: string, config: Config, redirects = 3): Promise<Uint8Array> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(config.allowPrivateUrls && url.protocol === "http:")) throw new Error("Only https URLs are fetched.");
  if (!config.allowPrivateUrls) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
    if (!addresses.length || addresses.some(privateAddress)) throw new Error(`${url.hostname} is not a public address.`);
  }
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    if (redirects <= 0) throw new Error("Too many redirects.");
    return fetchDocumentUrl(new URL(response.headers.get("location")!, url).href, config, redirects - 1);
  }
  if (!response.ok || !response.body) throw new Error(`${url.hostname} answered ${response.status}.`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > config.maxFileBytes) throw new Error(`The file is larger than ${config.maxFileBytes} bytes.`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > config.maxFileBytes) throw new Error(`The file is larger than ${config.maxFileBytes} bytes.`);
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
