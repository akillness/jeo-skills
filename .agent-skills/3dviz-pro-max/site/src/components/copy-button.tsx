// The design's icon-only copy control: a 34×34 rounded square with a clipboard glyph. It owns
// nothing but the clipboard write and its own label; whoever renders it owns the visible
// confirmation (the hero prints "COPIED ✓" under the prompt).
import { useEffect, useState } from 'react';

const RESET_MS = 1800;

export interface CopyButtonProps {
  /** The exact text written to the clipboard. */
  text: string;
  /** Called once per successful write, so the caller can show its own confirmation. */
  onCopied?: () => void;
}

export default function CopyButton({ text, onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  // The label goes back to "Copy prompt" on its own; the timer is the external system here.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleClick(): Promise<void> {
    // Clipboard needs a secure context; an http preview or an old browser has no API at all.
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    onCopied?.();
  }

  const label = copied ? 'Copied' : 'Copy prompt';

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      title={label}
      aria-label={label}
      className="grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center rounded-xl border border-line bg-white text-green transition-colors hover:bg-mint"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="12" height="12" rx="3" />
        <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}
