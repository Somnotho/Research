// UI boundary: knowledge_service only.
import { useEffect, useState } from 'react';
import { list_documents, upload_document, type ResearchDocument } from '../services/knowledge_service';

export function LibraryPage({ project_id }: { project_id: string }) {
  const [documents, set_documents] = useState<ResearchDocument[]>([]);
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  useEffect(() => {
    void list_documents(project_id)
      .then(set_documents)
      .catch((error) => set_error(error.message));
  }, [project_id]);
  async function submit_document(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    set_busy(true);
    set_error('');
    try {
      await upload_document(project_id, file);
      set_documents(await list_documents(project_id));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
      input.value = '';
    }
  }
  return (
    <section className="panel">
      <span className="eyebrow">THE EVIDENCE BASE</span>
      <h2>Your research library</h2>
      <p className="intro">
        Bring the books, company notes and operating data that shape your thinking. Each investigation
        retrieves relevant excerpts and retains their provenance.
      </p>
      <label className="upload">
        <span>＋</span>
        <strong>{busy ? 'Extracting document…' : 'Add a book or document'}</strong>
        <span>PDF · DOCX · XLSX · HTML · text · OCR images / up to 20 MB</span>
        <input
          type="file"
          aria-label="Upload research document"
          accept=".pdf,.docx,.xlsx,.html,.txt,.md,.csv,.json,.tex,.png,.jpg,.jpeg,.tiff,.webp"
          disabled={busy}
          onChange={submit_document}
        />
      </label>
      <p className="hint">
        PDF page references, versioned originals and English OCR are supported. Scanned PDFs are limited to 8
        pages per upload; text PDFs support 1,500 pages. Verify OCR equations and critical passages against
        the original. Relevant excerpts are sent to Azure in live mode.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="document_list">
        {documents.map((document) => (
          <div key={document.id}>
            <span>▤</span>
            <strong>
              {document.name} <a href={`/api/knowledge/documents/${document.id}/original`}>Original ↗</a>
            </strong>
            <span className="muted">{document.characters.toLocaleString()} characters</span>
          </div>
        ))}
      </div>
      {!documents.length && (
        <p className="muted">
          No documents yet. Start with the material most relevant to your research question.
        </p>
      )}
    </section>
  );
}
