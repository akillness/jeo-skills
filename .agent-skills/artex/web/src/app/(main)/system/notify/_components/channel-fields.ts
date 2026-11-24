import { t } from "@/i18n";

// Channel field table and config-value parsing helpers.
//
// This lives apart from the page because it is **data**, not a view: it describes which fields each channel has,
// which control each field uses, and the two-way conversion between form text and config values (JSON).
// In its own file, adding a channel only touches this file — the page itself needs no changes.
// Display names and blurbs for channel types. Kept in the frontend because they only affect copy; the backend does not need to know.
export const KIND_LABEL: Record<string, string> = {
  dingtalk: "DingTalk",
  feishu: "Feishu",
  wecom: "WeCom",
  webhook: t("Generic Webhook"),
  telegram: "Telegram",
  email: t("Email"),
};

// Config field definitions per channel.
//
// A frontend field table is kept here deliberately instead of having the backend send down a schema: the backend only does
// Validate (required/format), while the UI needs layout and control types — not the same concern.
// The single coupling point is secret_keys — which fields render as password inputs comes from the backend,
// because only the channel implementation knows which values are credentials (WeCom's entire Webhook is the credential,
// whereas DingTalk's is just one secret). A missing entry here for a new channel only blanks the form;
// it does not fail silently (hasFields below surfaces it).
export type FieldKind = "text" | "password" | "number" | "select" | "textarea" | "switch" | "kv" | "list";
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
}
export const CHANNEL_FIELDS: Record<string, FieldDef[]> = {
  dingtalk: [
    {
      key: "webhook",
      label: "Webhook URL",
      kind: "text",
      placeholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
    },
    {
      key: "secret",
      label: t("Signing secret"),
      kind: "password",
      help: t("Fill in when the robot's security settings use 'Sign'; leave empty for 'Custom keywords' or when no security setting is enabled"),
    },
  ],
  feishu: [
    {
      key: "webhook",
      label: "Webhook URL",
      kind: "text",
      placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
    },
    { key: "secret", label: t("Signature verification secret"), kind: "password", help: t("Fill in when the robot enables 'Signature verification'; otherwise leave empty") },
  ],
  wecom: [
    {
      key: "webhook",
      label: "Webhook URL",
      kind: "text",
      placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
    },
  ],
  webhook: [
    { key: "url", label: t("Target URL"), kind: "text", placeholder: "https://your-endpoint.example.com/hook" },
    {
      key: "method",
      label: t("HTTP method"),
      kind: "select",
      options: [
        { value: "POST", label: t("POST (with body)") },
        { value: "PUT", label: t("PUT (with body)") },
        { value: "PATCH", label: t("PATCH (with body)") },
        { value: "GET", label: t("GET (no body)") },
      ],
    },
    { key: "headers", label: t("Custom headers"), kind: "kv", help: t("One KEY=VALUE per line, e.g. Authorization=Bearer xxx") },
    {
      key: "body_template",
      label: t("Body template"),
      kind: "textarea",
      help: t(
        "Leave empty to use the built-in default template. Variables: {{.Title}} {{.Batch}} {{.Count}} {{.HomeURL}} {{.SentAt}}, plus .Name/.VulnClass/.Severity/.Summary/.Assets/.DetailURL/.StatusLabel under range .Items. Use {{json .Xxx}} instead of {{.Xxx}} to insert strings, or quotes in titles will break the JSON.",
      ),
    },
  ],
  telegram: [
    { key: "bot_token", label: "Bot Token", kind: "password", placeholder: "123456:ABC-DEF..." },
    { key: "chat_id", label: "Chat ID", kind: "text", placeholder: "-1001234567890" },
    {
      key: "base_url",
      label: "API URL",
      kind: "text",
      placeholder: "https://api.telegram.org",
      help: t("Leave empty for the official URL; fill in when proxying a self-hosted Bot API"),
    },
  ],
  email: [
    { key: "host", label: t("SMTP server"), kind: "text", placeholder: "smtp.example.com" },
    {
      key: "port",
      label: t("Port"),
      kind: "number",
      placeholder: "587",
      help: t("587 uses STARTTLS; for 465 turn 'Implicit TLS' on"),
    },
    { key: "username", label: t("Account"), kind: "text" },
    { key: "password", label: t("Password / auth code"), kind: "password" },
    { key: "from", label: t("From"), kind: "text", placeholder: "artex@example.com" },
    { key: "to", label: t("Recipients"), kind: "list", help: t("Separate multiple addresses with commas") },
    { key: "tls", label: t("Implicit TLS"), kind: "switch", help: t("On for port 465; keep off for 587 (STARTTLS is automatic)") },
  ],
};

export const SEVERITY_OPTIONS = [
  { value: "", label: t("All severities") },
  { value: "low", label: t("Low and above") },
  { value: "medium", label: t("Medium and above") },
  { value: "high", label: t("High and above") },
  { value: "critical", label: t("Critical only") },
];

export type ChannelForm = {
  name: string;
  kind: string;
  mode: "realtime" | "digest";
  enabled: boolean;
  ratePerMin: string;
  config: Record<string, unknown>;
  minSeverity: string;
  includeText: string;
  excludeText: string;
  taskIDsText: string;
  assetIDsText: string;
  onStatusChange: boolean;
};

export const emptyForm = (kind: string): ChannelForm => ({
  name: "",
  kind,
  mode: "realtime",
  enabled: true,
  ratePerMin: "",
  config: {},
  minSeverity: "",
  includeText: "",
  excludeText: "",
  taskIDsText: "",
  assetIDsText: "",
  onStatusChange: false,
});

// parseKV parses a "KEY=VALUE per line" textarea.
export function parseKV(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const ln = line.trim();
    if (!ln) continue;
    const i = ln.indexOf("=");
    if (i > 0) out[ln.slice(0, i).trim()] = ln.slice(i + 1).trim();
  }
  return out;
}
// parseIDs parses a comma/whitespace-separated id list.
export function parseIDs(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}
// parseKeywords parses a line/comma-separated keyword list (vulnerability type names may contain spaces, hence splitting on lines or commas).
export function parseKeywords(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
