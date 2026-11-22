// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  inertSvg,
  jsUrl,
  localRef,
  remoteCss,
} from "../../skills/scenario-kinetic-film/assets/engine/sanitize.js";

const NS =
  'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const svg = (body: string, attrs = "") =>
  `<svg ${NS} viewBox="0 0 10 10"${attrs}>${body}</svg>`;
// what the Logo block does with the result: innerHTML into an HTML element
const inlined = (text: string) => {
  const host = document.createElement("div");
  host.innerHTML = inertSvg(text);
  return host;
};

describe("inertSvg", () => {
  it("keeps drawing: ids, viewBox, paths, gradients, fragment references, class-only styles", () => {
    const out = inertSvg(
      svg(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
          '<style>.a{fill:#fff}</style><path id="m1" class="a" d="M0 0h5v5z" fill="url(#g)" style="opacity:.5"/>' +
          '<use href="#m1"/><use xlink:href="#m1"/><image href="logo.png"/><image href="data:image/png;base64,AAAA"/>',
      ),
    );
    for (const kept of [
      'viewBox="0 0 10 10"',
      'id="m1"',
      'fill="url(#g)"',
      'style="opacity:.5"',
      ".a{fill:#fff}",
      'href="#m1"',
      'xlink:href="#m1"',
      'href="logo.png"',
      'href="data:image/png;base64,AAAA"',
    ])
      expect(out).toContain(kept);
  });

  it("drops scripts, embedded HTML and other non-drawing elements", () => {
    const out = inertSvg(
      svg(
        '<script>alert(1)</script><foreignObject><div>x</div></foreignObject><iframe src="x"/><object/><embed/><img xmlns="http://www.w3.org/1999/xhtml" src="http://e/x"/><img src="x"/><rect/>',
      ),
    );
    expect(out).not.toMatch(/script|foreignObject|iframe|object|embed|img/);
    expect(out).toContain("<rect/>");
  });

  it("drops event handlers in any case", () => {
    const out = inertSvg(
      svg(
        '<rect onclick="x()" ONLOAD="y()" onMouseOver="z()"/>',
        ' onload="w()"',
      ),
    );
    expect(out).not.toMatch(/on\w+=/i);
  });

  it("drops javascript: links however they are spelled", () => {
    for (const href of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "java&#9;script:alert(1)",
      "java&#10;script:alert(1)",
      "&#x6A;avascript:alert(1)",
    ]) {
      const out = inertSvg(
        svg(`<a href="${href}"><rect/></a><a xlink:href="${href}"><rect/></a>`),
      );
      expect(out, href).not.toMatch(/href/);
    }
    expect(jsUrl("java\tscript:x")).toBe(true);
  });

  it("drops animations that would rewrite a link, a handler or a style", () => {
    const out = inertSvg(
      svg(
        '<a href="#x"><set attributeName="href" to="javascript:alert(1)"/><animate attributeName="xlink:href" values="javascript:1"/>' +
          '<animate attributeName="onclick"/><set attributeName="style" to="x"/><animate attributeName="opacity" values="0;1"/></a>',
      ),
    );
    expect(out.match(/<(set|animate)\b/g)).toEqual(["<animate"]);
    expect(out).toContain('attributeName="opacity"');
  });

  it("drops references to other hosts, so a render never needs the network", () => {
    const out = inertSvg(
      svg(
        '<image href="http://e/a.png"/><image xlink:href="//e/a.png"/><image href="\\\\e/a.png"/><use href="https://e/s.svg#a"/><a href="file:///etc/passwd"><rect/></a>' +
          '<rect fill="url(http://e/f.svg#p)" filter="url(\'//e/f.svg#b\')" mask="url(&quot;https://e/m#m&quot;)" clip-path="url(#c)"/>' +
          '<rect style="fill:url(https://e/x.svg#p)"/><rect style="background-image:image-set(\'http://e/x.png\' 1x)"/><rect style="fill:u\\72l(http://e)"/>' +
          '<use href="data:image/svg+xml,&lt;svg/&gt;"/>',
      ),
    );
    expect(out).not.toMatch(/\/\/e|\\e|file:|data:|url\((?!#)|image-set/);
    expect(out).toContain('clip-path="url(#c)"');
  });

  it("drops style blocks that import or fetch", () => {
    for (const css of [
      '@import "http://e/x.css";',
      ".a{fill:url(http://e/x#p)}",
      "@font-face{src:url(//e/f.woff)}",
      ".a{fill:url(http://e",
    ]) {
      expect(inertSvg(svg(`<style>${css}</style><rect/>`)), css).not.toContain(
        "<style",
      );
    }
  });

  it("drops comments and processing instructions, which could smuggle markup past the HTML parser", () => {
    const text = svg(
      "<?x ><img src=x onerror=alert(1)>?><!-- a comment --><rect/>",
    );
    const out = inertSvg(text);
    expect(out).not.toMatch(/<\?|<!--|img|onerror/);
    const host = inlined(text);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("rect")).not.toBeNull();
  });

  it("keeps no markup inside title or desc, where the HTML parser takes over", () => {
    // a <style> inside svg:title is HTML raw text: a raw CDATA "</style>" would close it early
    for (const holder of ["title", "desc"]) {
      const text = svg(
        `<${holder}><style><![CDATA[</style><img src=x onerror=alert(1)>]]></style>Logo</${holder}><rect/>`,
      );
      const host = inlined(text);
      expect(host.querySelector("img"), holder).toBeNull();
      expect(host.querySelector(`${holder} *`), holder).toBeNull();
      expect(host.querySelector(holder)?.textContent, holder).toBe("Logo");
      expect(host.querySelector("rect"), holder).not.toBeNull();
    }
  });

  it("turns CDATA into escaped text, so a style block keeps its rules", () => {
    const text = svg(
      "<style><![CDATA[.a > .b{fill:#fff}]]></style><text><![CDATA[</text><img src=x onerror=alert(1)>]]></text>",
    );
    const out = inertSvg(text);
    expect(out).not.toContain("CDATA");
    const host = inlined(text);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("style")?.textContent).toBe(".a > .b{fill:#fff}");
    expect(host.querySelector("text")?.textContent).toBe(
      "</text><img src=x onerror=alert(1)>",
    );
  });

  it("inlines with no element or handler that could run", () => {
    const host = inlined(
      svg(
        '<script>1</script><a href="javascript:1"><rect onclick="1"/></a><style>.b{fill:red}</style>',
      ),
    );
    expect(
      host.querySelectorAll("script, img, iframe, foreignObject").length,
    ).toBe(0);
    for (const el of host.querySelectorAll("*"))
      for (const a of el.attributes) {
        expect(a.name).not.toMatch(/^on/i);
        expect(a.value).not.toMatch(/javascript:/i);
      }
  });

  it("drops xml:base, which would point relative links at another host", () => {
    expect(
      inertSvg(svg('<image href="a.png"/>', ' xml:base="http://e/"')),
    ).not.toContain("xml:base");
  });

  it("returns nothing for a file that is not a well-formed SVG", () => {
    for (const text of [
      "",
      "not xml",
      "<svg " + NS + "><rect></svg>",
      "<html><body/></html>",
      '<svg xmlns="http://example.com/other"/>',
    ])
      expect(inertSvg(text), text).toBe("");
  });

  it("returns nothing when the parser reports an error inside the svg, as Chrome does", () => {
    class ChromeLike {
      parseFromString() {
        return new DOMParser().parseFromString(
          svg(
            '<parsererror xmlns="http://www.w3.org/1999/xhtml">line 1</parsererror><rect/>',
          ),
          "image/svg+xml",
        );
      }
    }
    expect(
      inertSvg("<svg><rect>", {
        DOMParser: ChromeLike as unknown as typeof DOMParser,
      }),
    ).toBe("");
  });

  it("keeps the tour's placeholder logo whole", () => {
    const logo = readFileSync(
      path.resolve(
        __dirname,
        "../../skills/scenario-kinetic-film/assets/examples/tour/logo.svg",
      ),
      "utf8",
    );
    const host = inlined(logo);
    expect([...host.querySelectorAll("path")].map((p) => p.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "w1",
    ]);
  });
});

describe("the rules", () => {
  it("localRef", () => {
    for (const v of ["#a", "logo.png", "art/x.png", "/x.png", ""])
      expect(localRef(v), v).toBe(true);
    for (const v of [
      "http://e",
      "//e/x",
      "\\\\e\\x",
      "/\\e",
      "mailto:x",
      "data:image/png;base64,A",
    ])
      expect(localRef(v), v).toBe(false);
    expect(localRef("data:image/png;base64,A", { dataImage: true })).toBe(true);
    expect(localRef("data:text/html,x", { dataImage: true })).toBe(false);
  });

  it("remoteCss", () => {
    for (const css of [
      "fill:#fff",
      "fill:url(#g)",
      "fill:url( 'a.svg#g' )",
      ".a{stroke:red}",
    ])
      expect(remoteCss(css), css).toBe(false);
    for (const css of [
      "@import 'x'",
      "fill:url(http://e)",
      'fill:url("//e")',
      "fill:URL(https://e)",
      "x:image-set('a' 1x)",
      "fill:\\75rl(x)",
      "fill:url(http://e",
    ])
      expect(remoteCss(css), css).toBe(true);
  });
});
