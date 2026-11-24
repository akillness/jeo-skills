// The editors' Tailwind setup (MR Note's own, apps/web/tailwind.config.ts).
const path = require("node:path");
const packages = path.resolve(__dirname, "../../packages");

module.exports = {
  darkMode: "class",
  experimental: { optimizeUniversalDefaults: true },
  content: [
    path.join(__dirname, "src/**/*.{ts,tsx}"),
    `${packages}/*/src/**/*.{ts,tsx}`,
    `!${packages}/*/src/web/lib/pdf/**`,
    `!${packages}/*/src/web/lib/document-import/**`,
    `!${packages}/*/src/web/lib/office-smartart/**`,
    `!${packages}/*/src/web/lib/office-charts/**`,
    `!${packages}/*/src/web/**/*.generated.ts`,
  ],
  theme: {
    extend: {
      colors: {
        "base-bg": "var(--bg-base)",
        surface: "var(--bg-surface)",
        raised: "var(--bg-raised)",
        border: "var(--border)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "brand-v2": "var(--brand-v2)",
        "brand-soft": "var(--brand-soft)",
        "success-v2": "var(--success-v2)",
        "warning-v2": "var(--warning-v2)",
        error: "var(--error)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted-v2)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent-v2)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        ring: "var(--ring)",
        input: "var(--input)",
      },
      maxWidth: { site: "1120px" },
      borderRadius: { panel: "30px", card: "20px", xs: "4px", sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },
      fontFamily: {
        sans: ["var(--font-family-sans)", "var(--font-sans)", "system-ui", "-apple-system", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-family-display)"],
      },
      transitionDuration: { DEFAULT: "200ms", fast: "150ms", slow: "300ms" },
      transitionTimingFunction: { DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)" },
      zIndex: { dropdown: "10", sticky: "20", "modal-backdrop": "30", modal: "40", popover: "50", tooltip: "60", toast: "70" },
      screens: { tablet: "768px", ipad: "1024px" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
