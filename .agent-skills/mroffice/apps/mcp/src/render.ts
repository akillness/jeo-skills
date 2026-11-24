// The editor, headless: a picture of a page as the person sees it, and the
// editor's own reading of a document the model wrote as HTML (so an export
// is what the editor shows, not a second converter's guess).
//
// One Chromium for the server, started on first use and closed when idle.

import type { Config } from "./config.ts";
import type { MrDoc } from "./formats.ts";
import type { StoredDocument } from "./store.ts";

export interface Renderer {
  render(doc: StoredDocument, page: number): Promise<Uint8Array>;
  materialize(doc: StoredDocument): Promise<MrDoc>;
  close(): Promise<void>;
}

type Browser = import("playwright-core").Browser;
type Page = import("playwright-core").Page;

const IDLE_MS = 60_000;

export class HeadlessEditor implements Renderer {
  private browser: Promise<Browser> | null = null;
  private idle: NodeJS.Timeout | null = null;
  private busy = 0;
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private async launch(): Promise<Browser> {
    let chromium: typeof import("playwright-core").chromium;
    try {
      ({ chromium } = await import("playwright-core"));
    } catch {
      throw new Error("pictures of pages need playwright-core and its Chromium (npm install; npx playwright-core install chromium-headless-shell)");
    }
    const options = { headless: true, args: ["--disable-gpu", "--font-render-hinting=none"] };
    // Playwright's own Chromium when it is installed; else a Chrome or Edge
    // already on the machine, so `npx` users get pictures without a download
    const failures: string[] = [];
    for (const channel of [undefined, "chrome", "msedge"] as const) {
      try {
        return await chromium.launch(channel ? { ...options, channel } : options);
      } catch (error) {
        failures.push(`${channel ?? "playwright chromium"}: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`);
      }
    }
    throw new Error(
      "pictures of pages need a Chromium: install Google Chrome or Microsoft Edge, or run `npx playwright-core install chromium-headless-shell` " +
        `(${failures.join("; ")})`,
    );
  }

  /** Callers waiting for one of the renderConcurrency slots. */
  private readonly queue: (() => void)[] = [];
  private drawing = 0;

  private async slot(): Promise<() => void> {
    if (this.drawing >= Math.max(1, this.config.renderConcurrency)) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.drawing += 1;
    return () => {
      this.drawing -= 1;
      this.queue.shift()?.();
    };
  }

  private async withPage<T>(doc: StoredDocument, width: number, run: (page: Page) => Promise<T>): Promise<T> {
    const release = await this.slot();
    try {
      return await this.drawPage(doc, width, run);
    } finally {
      release();
    }
  }

  private async drawPage<T>(doc: StoredDocument, width: number, run: (page: Page) => Promise<T>): Promise<T> {
    if (this.idle) clearTimeout(this.idle);
    this.busy += 1;
    if (!this.browser) {
      this.browser = this.launch();
      this.browser.catch(() => (this.browser = null));
    }
    let context: import("playwright-core").BrowserContext;
    let page: Page;
    try {
      const browser = await this.browser;
      context = await browser.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: 1 });
      page = await context.newPage();
    } catch (error) {
      // no browser: nothing to draw with, and nothing busy
      this.busy -= 1;
      throw error;
    }
    try {
      const url = `${this.config.publicUrl}/_mcp/view/${doc.id}?t=${encodeURIComponent(doc.token)}&render=1&rev=${doc.current.rev}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction(
        () => {
          const editor = document.querySelector(".pg-editor:not([hidden])");
          return Boolean(editor && editor.childElementCount > 0 && !editor.querySelector(".pg-loading"));
        },
        undefined,
        { timeout: 90_000 },
      );
      // fonts, pictures and the editor's own layout passes
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      return await run(page);
    } finally {
      await context.close().catch(() => undefined);
      this.busy -= 1;
      if (this.busy === 0) this.idle = setTimeout(() => void this.close(), IDLE_MS);
    }
  }

  async render(doc: StoredDocument, pageNumber: number): Promise<Uint8Array> {
    return this.withPage(doc, 1100, async (page) => {
      // a paged document's Nth page when the editor draws pages; else the view scrolled to it
      const pages = page.locator(".pg-editor:not([hidden]) article.page-sheet, .pg-editor:not([hidden]) [data-page-index], .pg-editor:not([hidden]) .note-page, .pg-editor:not([hidden]) .pdf-page, .pg-editor:not([hidden]) [data-page-number]");
      const count = await pages.count().catch(() => 0);
      if (count >= pageNumber && pageNumber >= 1) {
        const target = pages.nth(pageNumber - 1);
        await target.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(400);
        const box = await target.boundingBox();
        if (box && box.width > 200 && box.height > 200) return new Uint8Array(await target.screenshot({ type: "png" }));
      } else if (pageNumber > 1) {
        await page.evaluate((n) => {
          const scroller = Array.from(document.querySelectorAll<HTMLElement>(".pg-editor:not([hidden]) *")).find((el) => el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== "visible");
          if (scroller) scroller.scrollTop = (n - 1) * scroller.clientHeight;
        }, pageNumber);
        await page.waitForTimeout(500);
      }
      const stage = page.locator(".pg-stage");
      return new Uint8Array(await stage.screenshot({ type: "png" }));
    });
  }

  async materialize(doc: StoredDocument): Promise<MrDoc> {
    return this.withPage(doc, 1100, async (page) => {
      const read = await page.evaluate(() => {
        const surface = document.querySelector(".ProseMirror.note-editor-content") as (HTMLElement & { editor?: { getJSON(): unknown } }) | null;
        const content = surface?.editor?.getJSON();
        return content ? { content, title: document.title.replace(/ — MR Office$/, "") } : null;
      });
      if (!read) throw new Error("the document editor did not open this document");
      return { format: "mrnote.document", version: 1, title: read.title || doc.title, content: read.content as MrDoc["content"] };
    });
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (browser) await (await browser.catch(() => null))?.close().catch(() => undefined);
  }
}
