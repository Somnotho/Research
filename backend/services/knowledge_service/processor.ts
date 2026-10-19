import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export async function recognize_document(extension: string, contents: Buffer): Promise<string> {
  return new Promise((fulfill, reject) => {
    const child = spawn(
      process.env.SCIENCE_PYTHON ?? resolve('data/science_venv/bin/python'),
      ['-I', resolve('backend/services/knowledge_service/process_document.py')],
      { shell: false, env: { ...process.env, OMP_THREAD_LIMIT: '1' }, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Document processing exceeded 90 seconds; split the document.'));
    }, 90000);
    child.stdout.on('data', (contents) => {
      output += contents.toString();
      if (output.length > 15000000) child.kill('SIGKILL');
    });
    child.stderr.resume();
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code)
        return reject(
          new Error(
            'Document extraction/OCR failed. Verify file integrity; scanned PDFs must have at most 8 pages. OCR requires tesseract and pdftoppm.',
          ),
        );
      try {
        fulfill(JSON.parse(output).text);
      } catch {
        reject(new Error('Invalid document processor output'));
      }
    });
    child.stdin.end(JSON.stringify({ extension, contents: contents.toString('base64') }));
  });
}
