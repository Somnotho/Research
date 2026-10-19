import { extname } from 'node:path';
import mammoth from 'mammoth';
// Import the implementation directly: the package root executes a sample PDF when loaded by ESM.
import parse_pdf from 'pdf-parse/lib/pdf-parse.js';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { load } from 'cheerio';
import { recognize_document } from './processor.ts';

export const document_query = z.object({ question: z.string().min(1).max(16000) });

export async function extract_document(name: string, contents: Buffer): Promise<string> {
  const extension = extname(name).toLowerCase();
  if (['.docx', '.xlsx'].includes(extension)) await recognize_document(extension, contents);
  let text: string;
  if (extension === '.pdf') {
    text = await recognize_document(extension, contents);
  } else if (['.png', '.jpg', '.jpeg', '.tiff', '.webp'].includes(extension))
    text = await recognize_document(extension, contents);
  else if (extension === '.xlsx') {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(contents as never);
    const rows: string[] = [];
    book.eachSheet((sheet) =>
      sheet.eachRow((row, index) => {
        rows.push(`[${sheet.name}, row ${index}] ` + JSON.stringify(row.values));
      }),
    );
    text = rows.join('\n');
  } else if (['.html', '.htm'].includes(extension)) {
    const page = load(contents.toString('utf8'));
    page('script,style,nav,footer,iframe').remove();
    text = page('body').text().replace(/\s+/g, ' ').trim();
  } else if (extension === '.docx') text = (await mammoth.extractRawText({ buffer: contents })).value;
  else if (['.txt', '.md', '.csv', '.json', '.tex'].includes(extension))
    text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  else
    throw Object.assign(
      new Error('Supported formats: PDF, DOCX, XLSX, HTML, TXT, Markdown, CSV, JSON, LaTeX and OCR images.'),
      { statusCode: 422 },
    );
  if (!text.trim()) throw Object.assign(new Error('No readable text found.'), { statusCode: 422 });
  if (text.length > 3000000)
    throw Object.assign(new Error('Document exceeds 3 million extracted characters. Split it into parts.'), {
      statusCode: 422,
    });
  return text;
}

export function select_excerpts(documents: { id: string; name: string; text: string }[], question: string) {
  const words = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])];
  const excerpts = documents.flatMap((document) => {
    const chunks = [];
    const page_markers = [...document.text.matchAll(/\[Page (\d+)\]/g)];
    for (let offset = 0; offset < document.text.length; offset += 2200) {
      const text = document.text.slice(offset, offset + 2600);
      const lower_text = text.toLowerCase();
      const page = page_markers.findLast((marker) => marker.index <= offset) ?? page_markers[0];
      chunks.push({
        document_id: document.id,
        filename: document.name,
        offset,
        page: page ? Number(page[1]) : null,
        text,
        relevance: words.reduce((score, word) => score + lower_text.split(word).length - 1, 0),
      });
    }
    return chunks;
  });
  return excerpts.sort((first, second) => second.relevance - first.relevance).slice(0, 12);
}
