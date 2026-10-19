import { marked, type Tokens } from 'marked';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TextRun,
  ImageRun,
  Footer,
  PageNumber,
  AlignmentType,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import { chromium } from 'playwright-core';
import sanitize_html from 'sanitize-html';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import marked_katex from 'marked-katex-extension';

marked.use(marked_katex({ throwOnError: false }));
export type ReportVisual = { title: string; contents: Buffer; mime_type: string };

function read_plain_text(text: string) {
  return text.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export async function render_word(title: string, content: string, visuals: ReportVisual[]) {
  const paragraphs: (Paragraph | Table)[] = [
    new Paragraph({ text: 'RESEARCH OFFICE', spacing: { before: 1200, after: 500 } }),
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 500 } }),
    new Paragraph({ text: 'Evidence, economics and implementation', spacing: { after: 300 } }),
    new Paragraph({
      text: 'Private research proposal · Verify evidence and assumptions before implementation',
      pageBreakBefore: false,
    }),
    new Paragraph({ text: '', pageBreakBefore: true }),
  ];
  for (const token of marked.lexer(content)) {
    if (token.type === 'heading')
      paragraphs.push(
        new Paragraph({
          text: read_plain_text(token.text),
          heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][
            Math.min(token.depth, 3) - 1
          ],
        }),
      );
    else if (token.type === 'table') {
      const table = token as Tokens.Table;
      paragraphs.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [table.header, ...table.rows].map(
            (row, index) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      shading: index ? undefined : { fill: 'E3ECDD' },
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: read_plain_text(cell.text), bold: index === 0 })],
                        }),
                      ],
                    }),
                ),
              }),
          ),
        }),
      );
    } else if (token.type === 'list') {
      for (const item of token.items)
        paragraphs.push(new Paragraph({ text: read_plain_text(item.text), bullet: { level: 0 } }));
    } else if (token.type === 'code')
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: token.text, font: 'Courier New', size: 16 })] }),
      );
    else if ('text' in token && typeof token.text === 'string')
      paragraphs.push(new Paragraph({ text: read_plain_text(token.text) }));
  }
  for (const visual of visuals.filter((visual) => visual.mime_type === 'image/png')) {
    paragraphs.push(new Paragraph({ text: visual.title, heading: HeadingLevel.HEADING_2 }));
    paragraphs.push(
      new Paragraph({
        children: [
          new ImageRun({ data: visual.contents, type: 'png', transformation: { width: 540, height: 320 } }),
        ],
      }),
    );
  }
  return Packer.toBuffer(
    new Document({
      styles: {
        paragraphStyles: [
          { id: 'Title', name: 'Title', basedOn: 'Normal', run: { color: '20543B', size: 60, bold: true } },
        ],
        default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 160 } } } },
      },
      sections: [
        {
          properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: 'Research Office · Private · ', size: 16, color: '72816C' }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
                  ],
                }),
              ],
            }),
          },
          children: paragraphs,
        },
      ],
    }),
  );
}

export async function render_pdf(title: string, content: string, visuals: ReportVisual[]) {
  const html = sanitize_html(marked.parse(content, { async: false }), {
    allowedTags: [
      ...sanitize_html.defaults.allowedTags,
      'span',
      'math',
      'semantics',
      'annotation',
      'mrow',
      'mi',
      'mo',
      'mn',
      'mfrac',
      'msup',
      'msub',
      'mtext',
    ],
    allowedAttributes: { '*': ['class', 'style', 'aria-hidden', 'xmlns', 'encoding'], a: ['href'] },
    allowedSchemes: ['https'],
    allowVulnerableTags: false,
  });
  let math_css = readFileSync('node_modules/katex/dist/katex.min.css', 'utf8');
  math_css = math_css.replace(
    /url\((fonts\/[^)]+)\)/g,
    (_, filename: string) =>
      `url(data:font/woff2;base64,${readFileSync(resolve('node_modules/katex/dist', filename)).toString('base64')})`,
  );
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const images = visuals
    .map(
      (visual) =>
        `<section><h2>${escape(visual.title)}</h2><img style="max-width:100%;max-height:650px" src="data:${visual.mime_type};base64,${visual.contents.toString('base64')}"/></section>`,
    )
    .join('');
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(
      `<html><head><meta charset="utf-8"/><style>${math_css}body{font:12px/1.65 Arial;overflow-wrap:anywhere;color:#253c31}h1,h2,h3{color:#20543b;break-after:avoid}thead{display:table-header-group}table{table-layout:fixed;border-collapse:collapse;width:100%;font-size:10px}tr{break-inside:avoid}td,th{overflow-wrap:anywhere;border:1px solid #cad8c3;padding:8px}th{background:#e8efdf}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:8px/1.5 monospace;background:#f0f4eb;padding:12px}img{break-inside:avoid}section{margin-top:25px}a{color:#245b40}.katex-display{overflow-wrap:anywhere}.cover{box-sizing:border-box;height:240mm;padding:28mm 12mm;border-top:8px solid #20543b;background:#f1f5ed;break-after:page}.cover h1{font-size:38px;line-height:1.2;margin:35mm 0 14mm}.cover .brand{font-size:13px;letter-spacing:4px;font-weight:bold}.cover .subtitle{font-size:20px}.cover .private{margin-top:40mm;color:#65725c;font-size:11px}</style></head><body><header class="cover"><div class="brand">RESEARCH OFFICE</div><h1>${escape(title)}</h1><div class="subtitle">Evidence, economics and implementation</div><p class="private">PRIVATE RESEARCH PROPOSAL<br/>Review sources, assumptions and trade-offs before implementation.</p></header>${html}${images}</body></html>`,
      { waitUntil: 'networkidle' },
    );
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font:8px Arial;width:100%;text-align:center;color:#829178">Research Office · Human review required · <span class="pageNumber"></span></div>',
    });
  } finally {
    await browser.close();
  }
}

export async function render_slides(title: string, content: string, visuals: ReportVisual[]) {
  const presentation = new PptxGenJS();
  presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'Research Office';
  presentation.subject = 'Evidence-based research proposal';
  presentation.title = title;
  const add_slide = (heading: string) => {
    const slide = presentation.addSlide();
    slide.background = { color: 'F4F6EF' };
    slide.addText(read_plain_text(heading).slice(0, 120), {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 0.8,
      fontSize: 25,
      color: '20543B',
      bold: true,
    });
    slide.addText('Research Office · Executive slides · Full details and references in the written report', {
      x: 0.7,
      y: 7,
      w: 12,
      h: 0.2,
      fontSize: 9,
      color: '83917A',
    });
    return slide;
  };
  const cover = add_slide('RESEARCH OFFICE');
  cover.addText(title, { x: 0.8, y: 2, w: 11.7, h: 2.5, fontSize: 34, color: '20543B', bold: true });
  cover.addText('Evidence, economics and implementation · Private research proposal', {
    x: 0.8,
    y: 5.2,
    w: 11.7,
    h: 0.5,
    fontSize: 17,
    color: '65725C',
  });
  let heading = 'Research findings';
  let slides = 1;
  for (const token of marked.lexer(content)) {
    if (slides >= 70) {
      const slide = add_slide('Further detail in the written report');
      slide.addText(
        'This executive deck is limited to 70 content slides. Consult the full PDF or Word report for all remaining findings, specialist notes, computation receipts and evidence.',
        { x: 0.8, y: 2, w: 11.5, h: 3, fontSize: 22 },
      );
      break;
    }
    if (token.type === 'heading') {
      heading = read_plain_text(token.text);
      continue;
    }
    if (token.type === 'space') continue;
    if (token.type === 'table') {
      const table = token as Tokens.Table;
      for (let offset = 0; offset < table.rows.length; offset += 5) {
        const slide = add_slide(heading + (offset ? ' (continued)' : ''));
        const rows = [table.header, ...table.rows.slice(offset, offset + 5)].map((row) =>
          row.map((cell) => ({ text: read_plain_text(cell.text).slice(0, 180) })),
        );
        slide.addTable(rows, {
          x: 0.6,
          y: 1.5,
          w: 12.1,
          colW: Array(table.header.length).fill(12.1 / table.header.length),
          rowH: 0.6,
          fontSize: 12,
          color: '253C31',
          border: { type: 'solid', color: 'CAD8C3', pt: 1 },
          fill: { color: 'E8EFDF' },
          margin: 0.08,
          valign: 'top',
          autoPage: true,
          autoPageRepeatHeader: true,
          autoPageSlideStartY: 1.5,
        });
        slides++;
      }
      continue;
    }
    const text =
      token.type === 'code'
        ? '[Detailed code, plans or evidence receipts are retained in the full written report.]'
        : 'text' in token && typeof token.text === 'string'
          ? read_plain_text(token.text)
          : '';
    if (!text.trim()) continue;
    const chunks = text.match(/[\s\S]{1,700}/g) ?? [];
    for (const chunk of chunks) {
      const slide = add_slide(heading);
      slide.addText(chunk, {
        x: 0.8,
        y: 1.6,
        w: 11.7,
        h: 4.9,
        fontSize: 18,
        color: '384E3B',
        valign: 'top',
        fit: 'shrink',
      });
      slides++;
    }
  }
  for (const visual of visuals.filter((visual) => visual.mime_type === 'image/png')) {
    const slide = presentation.addSlide();
    slide.addText(visual.title, { x: 0.6, y: 0.4, w: 12, h: 0.6, fontSize: 24, color: '20543B' });
    slide.addImage({
      data: 'image/png;base64,' + visual.contents.toString('base64'),
      x: 1.5,
      y: 1.4,
      w: 10,
      h: 5.2,
    });
  }
  return (await presentation.write({ outputType: 'nodebuffer' })) as Buffer;
}

export async function rasterize_visual(visual: ReportVisual): Promise<ReportVisual> {
  if (visual.mime_type !== 'image/svg+xml') return visual;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 }, javaScriptEnabled: false });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(
      `<img style="width:850px" src="data:image/svg+xml;base64,${visual.contents.toString('base64')}"/>`,
    );
    const contents = await page.locator('img').screenshot({ type: 'png' });
    return { ...visual, contents, mime_type: 'image/png' };
  } finally {
    await browser.close();
  }
}
