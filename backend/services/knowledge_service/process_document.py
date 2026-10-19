import base64
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import resource
import zipfile

resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
resource.setrlimit(resource.RLIMIT_FSIZE, (100 * 1024**2, 100 * 1024**2))
from pypdf import PdfReader

request = json.loads(sys.stdin.read(30000000))
contents = base64.b64decode(request['contents'], validate=True)
extension = request['extension']
if extension in {'.docx', '.xlsx'}:
    # Validate expanded bytes and CRCs before passing an archive to the Node document parsers.
    with zipfile.ZipFile(io.BytesIO(contents)) as archive:
        entries = archive.infolist()
        if len(entries) > 2000 or sum(entry.file_size for entry in entries) > 50 * 1024**2:
            raise ValueError('Office archive expands beyond the supported limit')
        total = 0
        for entry in entries:
            if entry.is_dir(): continue
            with archive.open(entry) as stream:
                while chunk := stream.read(65536):
                    total += len(chunk)
                    if total > 50 * 1024**2: raise ValueError('Office archive exceeds expanded size limit')
    print(json.dumps({'text': 'Archive validated'}))
    sys.exit(0)
with tempfile.TemporaryDirectory(prefix='research_document_') as directory:
    folder = Path(directory)
    pages = []
    if extension == '.pdf':
        reader = PdfReader(io.BytesIO(contents))
        if len(reader.pages) > 1500: raise ValueError('Split PDFs longer than 1,500 pages')
        scanned_pages = []
        for index, page in enumerate(reader.pages):
            text = page.extract_text() or ''
            pages.append(text)
            if len(text.strip()) < 20: scanned_pages.append(index)
        if len(scanned_pages) > 8: raise ValueError('This PDF needs OCR on more than 8 pages. Split scanned books into batches of 8 pages; text PDFs support 1,500 pages.')
        if scanned_pages:
            source = folder / 'source.pdf'
            source.write_bytes(contents)
            for index in scanned_pages:
                prefix = folder / f'page_{index}'
                subprocess.run(['pdftoppm', '-f', str(index+1), '-l', str(index+1), '-r', '120', '-png', '-singlefile', str(source), str(prefix)], check=True, capture_output=True, timeout=12)
                result = subprocess.run(['tesseract', str(prefix)+'.png', 'stdout', '-l', 'eng'], check=True, capture_output=True, timeout=10)
                pages[index] = '[OCR — verify transcription]\n'+result.stdout.decode('utf-8')
    else:
        source = folder / ('image'+extension)
        source.write_bytes(contents)
        result = subprocess.run(['tesseract', str(source), 'stdout', '-l', 'eng'], check=True, capture_output=True, timeout=15)
        pages = ['[OCR — verify transcription]\n'+result.stdout.decode('utf-8')]
    text = '\n\n'.join(f'[Page {index+1}]\n{page}' for index, page in enumerate(pages))
    if len(text) > 3000000: raise ValueError('Extracted text exceeds 3 million characters')
    print(json.dumps({'text': text, 'pages': len(pages)}))
