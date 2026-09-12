// Per-file-type text extraction — mirrors app.py's extract_pdf_text /
// extract_docx_text / extract_excel_text: never throws, returns a bracketed
// error string on failure so the caller always has something to show.
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export interface ExtractedFile {
  filename: string;
  text: string;
}

const MAX_PDF_PAGES = 30;

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ first: MAX_PDF_PAGES });
    return result.text;
  } catch (err) {
    return `[Could not read PDF: ${err instanceof Error ? err.message : String(err)}]`;
  } finally {
    await parser.destroy();
  }
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    return `[Could not read DOCX: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

function csvBufferToText(buffer: Buffer): string {
  const rows = parseCsv(buffer, { skip_empty_lines: true }) as string[][];
  return rows.map((row) => row.join(',')).join('\n');
}

/**
 * .xlsx via exceljs (one "--- Sheet: {name} ---" block per sheet, CSV-ish
 * rows, matching app.py's per-sheet header convention). .csv via csv-parse.
 * Legacy binary .xls isn't something exceljs reads — that's a real gap vs.
 * the Streamlit source (openpyxl/pandas handled it), disclosed rather than
 * silently pretended to work; a .xls upload gets a clear error string too.
 */
export async function extractExcelText(filename: string, buffer: Buffer): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    try {
      return csvBufferToText(buffer);
    } catch (err) {
      return `[Could not read spreadsheet: ${err instanceof Error ? err.message : String(err)}]`;
    }
  }
  if (lower.endsWith('.xls')) {
    return '[Could not read spreadsheet: legacy .xls binary format is not supported — please re-save as .xlsx or .csv]';
  }
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const blocks: string[] = [];
    workbook.eachSheet((worksheet) => {
      const lines: string[] = [`--- Sheet: ${worksheet.name} ---`];
      worksheet.eachRow((row) => {
        const cells = Array.isArray(row.values) ? row.values.slice(1) : [];
        lines.push(cells.map((c) => (c === null || c === undefined ? '' : String(c))).join(','));
      });
      blocks.push(lines.join('\n'));
    });
    return blocks.join('\n\n');
  } catch (err) {
    return `[Could not read spreadsheet: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

export async function extractFileText(filename: string, buffer: Buffer): Promise<ExtractedFile> {
  const lower = filename.toLowerCase();
  let text: string;
  if (lower.endsWith('.pdf')) {
    text = await extractPdfText(buffer);
  } else if (lower.endsWith('.docx')) {
    text = await extractDocxText(buffer);
  } else {
    text = await extractExcelText(filename, buffer);
  }
  return { filename, text };
}
