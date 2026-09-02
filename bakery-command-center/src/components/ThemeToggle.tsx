import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className="flex h-8 w-14 items-center rounded-full border border-border-subtle bg-bg-panel px-1 transition-colors hover:border-accent-blue/60"
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-blue text-[11px] text-bg-primary transition-transform duration-200"
        style={{ transform: isDark ? 'translateX(0)' : 'translateX(24px)' }}
      >
        {isDark ? '🌙' : '☀'}
      </span>
    </button>
  );
}
