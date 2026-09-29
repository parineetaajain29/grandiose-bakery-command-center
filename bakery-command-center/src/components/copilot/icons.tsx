// Icons for Grandiose Copilot (Phase 6 of the implementation plan). Same
// minimal inline-line-icon convention as scenario/aiRisk/icons.tsx — no icon
// library, no emoji. CroissantIcon is Copilot's brand mark: an original
// drawn shape (a stylised crescent body with three fold-line ticks), not a
// copy of any specific icon library's glyph — it's what identifies the
// floating button and drawer header as Copilot rather than a generic
// chat/assistant icon.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...props };
}

export function CroissantIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 15c0-4 3.5-7 8-8 4.5 1 8 4 8 8-2 2-5 2.5-8 1.5-3 1-6 .5-8-1.5z" />
      <path d="M8 12.5L10 8M11.3 13L13.3 8.5M14.6 13.2L16.6 9" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12l16-7-7 16-2.5-6.5L4 12z" />
    </svg>
  );
}
