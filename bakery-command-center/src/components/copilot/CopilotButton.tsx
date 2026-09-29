import { CroissantIcon } from './icons';

interface CopilotButtonProps {
  onClick: () => void;
}

/** Floating entry point for Grandiose Copilot (Phase 7). Mounted once in
 * App.tsx (Phase 8) alongside CopilotDrawer — App.tsx owns the open/closed
 * state, this is just the trigger. Icon-only by design, matching the
 * spec's "not a chatbot" positioning: no unread badge, no pulsing nudge,
 * nothing competing for attention the way a support-widget bubble does. */
export function CopilotButton({ onClick }: CopilotButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open Grandiose Copilot"
      className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full border border-accent-orange/40 bg-bg-panel text-accent-orange shadow-card transition-colors hover:bg-bg-panel-raised"
    >
      <CroissantIcon width={26} height={26} />
    </button>
  );
}
