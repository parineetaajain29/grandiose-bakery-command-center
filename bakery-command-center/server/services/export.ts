// Shared export formatters — Word/PDF for narrative content, CSV/Excel for
// tabular data. Pure formatting only: every caller passes in data it already
// computed and trusts (usually exactly what's already rendered on screen) —
// this module never fetches or recomputes anything itself, so no page's
// calculation logic is duplicated or re-derived here.
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

export interface DocSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface DocSpec {
  title: string;
  subtitle?: string;
  sections: DocSection[];
}

export interface TableSheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

// --- Word ---------------------------------------------------------------

export async function buildDocx(spec: DocSpec): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ text: spec.title, heading: HeadingLevel.TITLE })];
  if (spec.subtitle) {
    children.push(new Paragraph({ text: spec.subtitle, heading: HeadingLevel.HEADING_2 }));
  }
  for (const section of spec.sections) {
    if (section.heading) {
      children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }));
    }
    for (const p of section.paragraphs ?? []) {
      children.push(new Paragraph({ children: [new TextRun(p)], spacing: { after: 120 } }));
    }
    for (const b of section.bullets ?? []) {
      children.push(new Paragraph({ text: b, bullet: { level: 0 }, spacing: { after: 60 } }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// --- PDF ------------------------------------------------------------------

export function buildPdf(spec: DocSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text(spec.title);
    if (spec.subtitle) {
      doc.moveDown(0.3);
      doc.fontSize(12).fillColor('#666666').text(spec.subtitle);
      doc.fillColor('#000000');
    }
    doc.moveDown();

    for (const section of spec.sections) {
      if (section.heading) {
        doc.moveDown(0.6);
        doc.fontSize(14).text(section.heading);
        doc.moveDown(0.2);
      }
      doc.fontSize(11);
      for (const p of section.paragraphs ?? []) {
        doc.text(p);
        doc.moveDown(0.3);
      }
      for (const b of section.bullets ?? []) {
        doc.text(`•  ${b}`, { indent: 10 });
      }
    }

    doc.end();
  });
}

// --- CSV --------------------------------------------------------------------

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(sheet: TableSheet): string {
  const lines = [sheet.columns.map(csvField).join(',')];
  for (const row of sheet.rows) lines.push(row.map(csvField).join(','));
  return lines.join('\r\n');
}

// --- Excel --------------------------------------------------------------

export async function buildXlsx(sheets: TableSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet((sheet.name || 'Sheet').slice(0, 31));
    ws.addRow(sheet.columns);
    for (const row of sheet.rows) ws.addRow(row);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
