// Tiny static server rooted at the project dir.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
const ROOT = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "..",
);
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".bin": "application/octet-stream",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
};
export function serve(port = 0) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p;
      try {
        p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      } catch {}
      // fs throws synchronously on a NUL byte, which would end the process like a bad escape does.
      if (p === undefined || p.includes("\0")) {
        rsp.writeHead(400);
        return rsp.end();
      }
      if (p === "/") p = "/engine/index.html";
      const f = path.join(ROOT, p);
      // A bare prefix test would also pass a sibling named like the root plus a suffix.
      if (f !== ROOT && !f.startsWith(ROOT + path.sep)) {
        rsp.writeHead(403);
        return rsp.end();
      }
      fs.stat(f, (e, st) => {
        if (e || !st.isFile()) {
          rsp.writeHead(404);
          return rsp.end("404 " + p);
        }
        rsp.writeHead(200, {
          "Content-Type": MIME[path.extname(f)] ?? "application/octet-stream",
          "Content-Length": st.size,
          "Cache-Control": "no-store",
        });
        fs.createReadStream(f).pipe(rsp);
      });
    });
    srv.listen(port, "127.0.0.1", () => res({ srv, port: srv.address().port }));
  });
}
if (process.argv[1] === url.fileURLToPath(import.meta.url)) {
  const { port } = await serve(parseInt(process.argv[2] ?? "8123"));
  console.log("serving on", port);
}
