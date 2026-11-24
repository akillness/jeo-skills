import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/i18n";

export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card size="sm" className="gap-1">
      <CardContent>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`text-lg font-semibold ${tone === "red" ? "text-rose-600" : ""}`}>{value}</p>
        {hint && <p className={`text-xs ${tone === "red" ? "text-rose-600" : "text-muted-foreground"}`}>{hint}</p>}
      </CardContent>
    </Card>
  );
}

// formatBacklog renders backlog milliseconds as a human-readable magnitude.
export function formatBacklog(ms: number): string {
  if (!ms) return "—";
  if (ms < 60_000) return t("{n}s", { n: Math.round(ms / 1000) });
  if (ms < 3_600_000) return t("{n}min", { n: Math.round(ms / 60_000) });
  return t("{n}h", { n: (ms / 3_600_000).toFixed(1) });
}
