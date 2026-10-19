import { z } from 'zod';

export const diagram_input = z.object({
  title: z.string().trim().min(1).max(100),
  nodes: z.array(z.string().trim().min(1).max(80)).min(2).max(8),
});

export function escape_xml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function draw_diagram(input: z.infer<typeof diagram_input>) {
  const height = 100 + input.nodes.length * 100;
  const nodes = input.nodes
    .map((label, index) => {
      const top = 80 + index * 100;
      const lines = label.match(/.{1,37}(?:\s|$)|.{1,37}/g) ?? [label];
      return `${index ? `<path d="M300 ${top - 32}V${top - 5}" stroke="#769576" stroke-width="2" marker-end="url(#arrow)"/>` : ''}<rect x="75" y="${top}" width="450" height="68" rx="10" fill="#e8efdf" stroke="#a9bba0"/>${lines.map((line, line_index) => `<text x="300" y="${top + 28 + line_index * 18}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#284c35">${escape_xml(line.trim())}</text>`).join('')}`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${height}" role="img" aria-label="${escape_xml(input.title)}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#769576"/></marker></defs><rect width="600" height="${height}" fill="#f7f9f3"/><text x="300" y="38" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#284c35">${escape_xml(input.title)}</text>${nodes}</svg>`;
}
