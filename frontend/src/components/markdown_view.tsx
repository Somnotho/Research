import { marked } from 'marked';
import DOMPurify from 'dompurify';
import marked_katex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
marked.use(marked_katex({ throwOnError: false }));
export function MarkdownView({ content }: { content: string }) {
  const html = DOMPurify.sanitize(marked.parse(content, { async: false }), {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['img'],
  });
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
