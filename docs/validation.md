# Validation record

Validated on 19 October 2026 using Node 24.19, Python 3.12, PostgreSQL 18, Chromium, Tesseract/Poppler and Docker on Linux x64.

The following checks exercise actual software behavior rather than treating simulation prose as research:

- TypeScript checking and Vite production build.
- 24 passing unit tests, including financial arithmetic, discounting and edge cases; document extraction and retrieval; safe diagram generation.
- Actual SymPy differentiation/integration/solving/identities, matrix properties, Pint unit conversion, SciPy sample comparison, seeded NumPy Monte Carlo and Z3 linear claims/counterexamples/inconsistent-premise handling.
- Actual restricted Docker execution with passing and failing Python unit tests, missing-test rejection, timeout, absent host workspace/API keys and blocked external network.
- `.env` loading with quoted values/comments, explicit file overrides of generated defaults, preserved injected settings, and actual PostgreSQL connection checks for all nine services.
- Baseline/proposal cost and revenue comparisons, both favorable and unfavorable metrics, zero-baseline percentages, zero-investment losses, evidence references and immutable investigation/report snapshots.
- Owner authentication, origin and internal-token checks, database persistence and cross-service ID behavior.
- Versioning/deduplication, original-file downloads, XLSX and OCR for images and scanned PDFs, including page-labelled retrieval.
- Persisted planner output, real proactive Monte Carlo, company briefs, weighted decision matrices, tool receipt handoffs, review before synthesis, model-call ledger and cancellation.
- Word, PDF and PowerPoint exports with content signatures and embedded chart rendering.
- Revoked session-cookie replay rejection.
- PWA install metadata, public offline shell, persistent/clearable offline notes and no private API responses in caches.
- Actual HTTPS chat/image provider contract requests using a local fixture certificate trusted only in a child process; TLS verification remained enabled. Fixture responses are explicitly identified and are not live Azure validation.
- Wikipedia discovery through the platform proxy returned five source snippets. A live article full-text import, SHA-256 fingerprint, document ingestion and excerpt retrieval also passed.

Browser verification covers desktop 1440px and phone 390px layouts, owner login/logout, company brief, upload, baseline/proposal comparisons, financial calculation, symbolic computation, disposable code testing, diagrams, agent plans, reports and absence of document-width overflow/runtime errors. Screenshots are under ignored `data/screenshots/`. A real browser-fixture comparison report was downloaded in all four formats; the PDF cover/comparison page were visually inspected and Word/PowerPoint XML was checked for retained metric values, evidence references and structured tables. These fixtures remain labelled simulation, not research results.

The production dependency audit reported zero known vulnerabilities. This is not a substitute for a complete production security review.

Live Azure reasoning quality, live generated image quality, broad Brave results, Supabase connectivity and publicly hosted phone access require the real configuration deferred by the user. Mathematical checks establish only their stated domains; tests and simulations do not establish physical or commercial success.
