// sanitize.js: the logo is inlined as SVG markup (the Logo block sets innerHTML), so the file is rebuilt from
// an allowlist before the film sees it. Only SVG drawing elements survive: no scripts, no embedded HTML, no
// comments or processing instructions (a "?>"-less PI can smuggle markup past the HTML parser), no event
// handlers, no javascript: links, and no reference that would fetch from another host, since a render must
// never depend on the network. Fragments (#id) and paths on the film's own server stay.
const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'desc', 'title', 'symbol', 'use', 'image', 'switch', 'view', 'a', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'filter',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
  'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
  'animate', 'animateMotion', 'animateTransform', 'set', 'mpath',
]);
const ANIMATIONS = new Set(['animate', 'animateMotion', 'animateTransform', 'set']);
const IMAGES = new Set(['image', 'feImage']);

// browsers drop tabs, newlines and control characters from a URL and read a backslash as a slash,
// so "java&#9;script:" and "\\host/x" are judged the way the browser will read them
const clean = v => String(v).replace(/[\s\u0000-\u001f]/g, '').replace(/\\/g, '/');
export const jsUrl = v => /^javascript:/i.test(clean(v));
// local: a fragment, a data: image where one is allowed, or a path with no scheme and no //host
export function localRef(v, { dataImage = false } = {}) {
  const u = clean(v);
  if (u.startsWith('#')) return true;
  if (dataImage && /^data:image\//i.test(u)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//');
}
// CSS that could fetch from another host: @import, image-set() and friends, a url() that is not local,
// or an escape (a backslash can spell any of these)
export function remoteCss(css) {
  const s = String(css);
  if (/\\|@import|image-set\(|cross-fade\(|\bimage\(|\belement\(/i.test(s)) return true;
  for (const m of s.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) if (!localRef(m[2])) return true;
  return /url\(/i.test(s.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, ''));
}

function dropAttribute(n, a) {
  if (/^on/i.test(a.localName)) return true;
  if (a.namespaceURI === XML_NS && a.localName === 'base') return true;
  if (/href$/i.test(a.localName)) return !localRef(a.value, { dataImage: IMAGES.has(n.localName) });
  return remoteCss(a.value); // style="...", fill="url(...)", filter, mask, clip-path, marker-*, animation values
}
function dropElement(n) {
  if (n.namespaceURI !== SVG_NS || !ELEMENTS.has(n.localName)) return true;
  if (ANIMATIONS.has(n.localName) && /href|^on|^style$/i.test(n.getAttribute('attributeName') || '')) return true;
  return n.localName === 'style' && remoteCss(n.textContent);
}
// title and desc are HTML integration points: the HTML parser reads their children as HTML, where a <style>
// is raw text that a "</style>" inside it closes. So they keep text only, and CDATA becomes plain text,
// which the serializer escapes (a CDATA section is written out raw).
const TEXT_ONLY = new Set(['title', 'desc']);
function scrub(n) {
  for (const a of [...n.attributes]) if (dropAttribute(n, a)) n.removeAttributeNode(a);
  for (const c of [...n.childNodes]) {
    if (c.nodeType === 1) {
      if (TEXT_ONLY.has(n.localName) || dropElement(c)) c.remove();
      else scrub(c);
    } else if (c.nodeType === 4) c.replaceWith(c.ownerDocument.createTextNode(c.data));
    else if (c.nodeType !== 3) c.remove(); // keep text only
  }
}
// inertSvg(text) returns the cleaned <svg> markup, or '' when the file is not a well-formed SVG.
// DOMParser and XMLSerializer default to the page's; tests pass jsdom's.
export function inertSvg(text, { DOMParser: Parser = globalThis.DOMParser, XMLSerializer: Serializer = globalThis.XMLSerializer } = {}) {
  let doc;
  try {
    doc = new Parser().parseFromString(String(text ?? ''), 'image/svg+xml');
  } catch {
    return '';
  }
  const svg = doc.documentElement;
  if (!svg || svg.namespaceURI !== SVG_NS || svg.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return '';
  scrub(svg);
  return new Serializer().serializeToString(svg);
}
