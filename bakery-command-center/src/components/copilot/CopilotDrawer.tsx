import { useState, type FormEvent, type ReactNode } from 'react';
import { askCopilot, type CopilotAction } from '../../data/api';
import { useCopilotViewContext } from '../../contexts/CopilotContext';
import { CroissantIcon, CloseIcon, SendIcon } from './icons';

/** Renders `**bold**` spans within a single line of Copilot's answer text —
 * explainResult (copilot.ts) is told to wrap every number it states in
 * **double asterisks**, so the important figures actually stand out instead
 * of blending into a paragraph. No markdown library — this is the only
 * markdown-like syntax Copilot ever emits, so a full parser is unneeded. */
function renderInlineBold(line: string): ReactNode[] {
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part !== '')
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
}

/** Renders Copilot's answer text as a lead sentence plus bullet points —
 * explainResult is told to answer as "- " lines, one fact per bullet, so
 * numbers stay scannable instead of buried in a dense paragraph. Plain
 * (non-bulleted) lines render as short paragraphs, same styling either way. */
function renderMessageText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    const items = bulletBuffer;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="mt-1.5 list-disc space-y-1 pl-4 font-sans text-sm">
        {items.map((item, i) => (
          <li key={i}>{renderInlineBold(item)}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2));
      continue;
    }
    flushBullets();
    if (line !== '') {
      nodes.push(
        <p key={`p-${nodes.length}`} className="font-sans text-sm">
          {renderInlineBold(line)}
        </p>,
      );
    }
  }
  flushBullets();
  return nodes;
}

interface CopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Lets Copilot's own "View SKU Performance ->" style action chips
   * actually navigate, instead of just describing where to go. Wired to
   * setPage in App.tsx (Phase 8) — optional so the drawer still renders
   * standalone (e.g. in isolation during review) without it. */
  onNavigate?: (page: string) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source?: string;
  actions?: CopilotAction[];
  followUps?: string[];
  isError?: boolean;
}

const STARTER_QUESTIONS = [
  'What are the biggest issues management should look at?',
  'Which SKU has the highest contribution?',
  'Which employee needs attention?',
  'How are we doing with B2B overall?',
];

let nextMessageId = 0;
function newMessageId(): string {
  nextMessageId += 1;
  return `copilot-msg-${nextMessageId}`;
}

/** Right-side conversational panel for Grandiose Copilot (Phase 7/8). Owns
 * its own message thread and conversationId locally — App.tsx only owns
 * whether the drawer is open. Every question is sent with the current
 * CopilotViewContext (Phase 5) via useCopilotViewContext(), so a question
 * like "compare it with last month" resolves against what the user is
 * actually looking at right now rather than a stale snapshot from when the
 * drawer first opened. This component never computes an answer itself —
 * askCopilot() is the only data path, and every number rendered here is
 * exactly what POST /api/copilot/ask returned. */
export function CopilotDrawer({ open, onClose, onNavigate }: CopilotDrawerProps) {
  const viewContext = useCopilotViewContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  async function send(question: string) {
    const q = question.trim();
    if (q === '' || sending) return;

    setInput('');
    setMessages((prev) => [...prev, { id: newMessageId(), role: 'user', text: q }]);
    setSending(true);

    try {
      const result = await askCopilot(q, viewContext, conversationId);
      setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: newMessageId(), role: 'assistant', text: result.answer, source: result.source, actions: result.actions, followUps: result.followUps },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong — try asking again.';
      setMessages((prev) => [...prev, { id: newMessageId(), role: 'assistant', text: message, isError: true }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  if (!open) return null;

  return (
    <>
      {/* Click-outside catcher, same pattern as ExportMenu's own backdrop. */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-subtle bg-bg-panel shadow-card" role="dialog" aria-modal="true" aria-label="Grandiose Copilot">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CroissantIcon width={20} height={20} className="text-accent-orange" />
            <div>
              <p className="font-sans text-sm font-semibold text-text-primary">Grandiose Copilot</p>
              <p className="font-mono text-[10px] tracking-[0.1em] text-text-tertiary">GROUNDED IN YOUR DATA</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Grandiose Copilot"
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-bg-panel-raised hover:text-text-primary"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="font-sans text-sm text-text-secondary">
                Ask about production cost, wastage, labour productivity, SKU performance, or B2B accounts — answers come straight
                from the same data behind this dashboard, never invented.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="rounded-full border border-border-subtle px-3 py-1.5 font-sans text-xs text-text-secondary transition-colors hover:border-accent-blue/50 hover:text-text-primary"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-card px-4 py-2.5 ${
                  m.role === 'user'
                    ? 'bg-accent-blue text-[#04070d]'
                    : m.isError
                      ? 'border border-accent-red/40 bg-bg-panel-raised text-text-primary'
                      : 'border border-border-subtle bg-bg-panel-raised text-text-primary'
                }`}
              >
                <div className="space-y-1">{m.role === 'assistant' && !m.isError ? renderMessageText(m.text) : <p className="whitespace-pre-wrap font-sans text-sm">{m.text}</p>}</div>

                {m.source && <p className="mt-2 font-mono text-[10px] tracking-[0.08em] text-text-tertiary">SOURCE: {m.source.toUpperCase()}</p>}

                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.actions.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => a.page && onNavigate?.(a.page)}
                        className="rounded-full border border-accent-blue/40 px-2.5 py-1 font-sans text-[11px] font-medium text-accent-blue transition-colors hover:bg-accent-blue/10"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}

                {m.followUps && m.followUps.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.followUps.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => void send(f)}
                        className="rounded-full border border-border-subtle px-2.5 py-1 font-sans text-[11px] text-text-secondary transition-colors hover:border-accent-blue/50 hover:text-text-primary"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-card border border-border-subtle bg-bg-panel-raised px-4 py-2.5">
                <p className="font-mono text-xs text-text-secondary">Checking the data…</p>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about cost, wastage, labour, SKUs, B2B…"
            disabled={sending}
            className="flex-1 rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 font-sans text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-blue/50 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || input.trim() === ''}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-blue text-[#04070d] transition-opacity disabled:opacity-40"
          >
            <SendIcon width={16} height={16} />
          </button>
        </form>
      </div>
    </>
  );
}
