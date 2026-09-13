// AI-assisted file interpretation — ported verbatim from Streamlit's
// interpret_uploaded_files() (app.py lines 929-963) and its
// INTERPRETER_SYSTEM_PROMPT (lines 891-921): same combined-file format, same
// 60,000-char truncation guard, same strict-JSON contract, same fence-
// stripping. Only the client SDK differs (@anthropic-ai/sdk vs. the Python
// SDK) and the "not configured" source (Settings/app_settings vs. st.secrets).
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from './settings.ts';

const MAX_UPLOAD_CHARS = 60000; // keeps API cost/latency bounded across a batch of files

const INTERPRETER_SYSTEM_PROMPT = `You are a financial and operations analyst working on a cost-optimization dashboard for Grandiose Bakery, a UAE bakery division (GIP III project). You will be given raw, rough, messy content extracted from one or more uploaded files (Excel, PDF, or Word) — it could be production logs, procurement records, wastage logs, sales data, inventory data, employee shift logs, or something else entirely.

Your job:
1. Identify what kind of business data this actually is.
2. Clean and interpret the rough numbers — infer column meaning even if headers are messy, missing, or inconsistent. Handle obvious typos and unit inconsistencies sensibly.
3. Where the data supports it, compute relevant KPIs using standard bakery cost-optimization metrics: wastage % (wasted / (produced + wasted) * 100), cost per unit, batch-time adherence %, quality pass rate, supplier concentration (HHI), productivity (value generated per employee per day), or straightforward sums/averages/trends — but ONLY compute what the data actually supports. Never fabricate numbers that aren't derivable from what was given.
4. Write 2-4 sentences of plain-English, management-readable insight per output sheet — what the numbers show and what it implies, not just a restatement of the table.

Respond with STRICT JSON only, no markdown fences, no commentary outside the JSON, matching exactly this shape:
{
  "detected_data_type": "short description of what this data is",
  "summary": "2-4 sentence overall summary of what was found across all files",
  "sheets": [
    {
      "sheet_name": "short sheet name, max 31 chars, no slashes or brackets",
      "title": "human-readable title for this sheet",
      "columns": ["Column A", "Column B", ...],
      "rows": [["value", "value", ...], ...],
      "insights": ["insight sentence 1", "insight sentence 2"]
    }
  ]
}

Produce 1-4 sheets depending on what's genuinely present in the data — don't invent sheets with no real content. If the uploaded content is unreadable or empty, still return valid JSON with an empty "sheets" list and explain why in "summary".`;

export interface InterpretedSheet {
  sheet_name: string;
  title: string;
  columns: string[];
  rows: string[][];
  insights: string[];
}

export interface InterpretationResult {
  detected_data_type: string;
  summary: string;
  sheets: InterpretedSheet[];
}

export type InterpretOutcome =
  | { ok: true; result: InterpretationResult }
  | { ok: false; reason: 'not_configured'; message: string }
  | { ok: false; reason: 'error'; message: string };

export function isAnthropicConfigured(): boolean {
  return getAnthropicApiKey() !== null;
}

export async function interpretUploadedFiles(fileContents: { filename: string; text: string }[]): Promise<InterpretOutcome> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return {
      ok: false,
      reason: 'not_configured',
      message: "AI interpretation isn't configured yet. Add an Anthropic API key in Settings.",
    };
  }

  let combined = '';
  for (const { filename, text } of fileContents) {
    combined += `\n\n===== FILE: ${filename} =====\n${text}`;
  }
  const truncated = combined.length > MAX_UPLOAD_CHARS;
  if (truncated) combined = combined.slice(0, MAX_UPLOAD_CHARS);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      system: INTERPRETER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Here is the extracted content to interpret:${combined}` }],
    });

    const rawText = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '');
    }

    let result: InterpretationResult;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: 'error', message: "The AI response couldn't be parsed as structured data. Try again, or with a smaller/simpler file." };
    }

    if (truncated) {
      result.summary = `${result.summary ?? ''} (Note: input was long and was truncated before analysis — results reflect only the portion processed.)`;
    }
    return { ok: true, result };
  } catch (err) {
    // Leak shape here: none. Verified empirically (2026-09-13, invalid-key
    // test) — Anthropic's auth-error body is clean JSON
    // ({"type":"authentication_error","message":"API key is invalid."}) with
    // no key material in it, masked or otherwise, so returning err.message
    // as-is is safe. This is NOT the same for every provider — see
    // aiRisk.ts, where OpenAI masks the key but still echoes a partial
    // fragment (requires a key-shaped pattern-match redaction), and
    // email.ts, where Nodemailer can echo the literal, unmasked app password
    // (requires an exact-match redaction). A fourth provider needs its own
    // empirical check of its actual error shape — don't assume "no
    // redaction" carries over from here without re-testing.
    return { ok: false, reason: 'error', message: `Could not process files: ${err instanceof Error ? err.message : String(err)}` };
  }
}
