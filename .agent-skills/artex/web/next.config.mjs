import { fileURLToPath } from "node:url";

// Static export: `NEXT_EXPORT=1 next build` produces a pure static directory at web/out,
// ready to drop into an nginx web root. Dev (next dev) leaves the variable unset, keeping the /api reverse proxy and hot reload.
const isExport = process.env.NEXT_EXPORT === "1";
// Vercel demo: the whole site runs on mock, no backend, no /api reverse proxy needed.
const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent a parent directory's lockfile from affecting root inference and asset path generation.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  reactCompiler: true,
  // Allow accessing dev resources (HMR) from LAN IPs; add or remove as needed.
  // In dev, allow any IPv4 origin to access /_next/* and HMR (unaffected by LAN IP changes).
  // Note: Next forbids a bare "*" for security; use segmented wildcards — "*.*.*.*" matches any IPv4.
  allowedDevOrigins: ["*.*.*.*"],
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  ...(isExport
    ? {
        // Pure static export: no Node runtime; images unoptimized; each route emits <route>/index.html.
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : isMock
      ? {
          // Vercel mock demo: no backend, no /api reverse proxy needed.
          images: { unoptimized: true },
        }
      : {
          // Dev: reverse-proxy /api/* to the Go backend (default :8787, override with AUTOPENTEST_API).
          async rewrites() {
            const backend = process.env.AUTOPENTEST_API ?? "http://localhost:8787";
            return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
          },
        }),
};

export default nextConfig;
