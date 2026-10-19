# Research Office

A private web application for researching business and technical problems with books, company context, specialist agents, reproducible calculations and implementation tests. It works on desktop and phone browsers and includes an installable web-app manifest and offline notes.

## Start

Requires Node.js 24.14+, Python 3.12+, Docker, Chromium, Tesseract English OCR and Poppler (`pdftoppm`). These prerequisites are available in the prepared cloud environment. Node 24.19 and Linux x64 are validated.

```sh
git clone https://github.com/Somnotho/Research.git
cd Research
npm ci
npm run setup
npm run build
npm run dev
```

`setup` generates private `.env.local` values without displaying them, generates each service's Prisma client, installs pinned scientific dependencies, and prepares the digest-pinned Python execution image. It preserves existing configuration and data. Optionally copy `.env.example` to `.env` to configure providers or override local defaults. Injected environment settings take precedence over `.env`, followed by generated `.env.local`. Quoted values and comments are supported. Restart the launcher after changes. Read `OWNER_PASSWORD` privately in `.env.local` to sign in. Never commit that file or print its contents.

`dev` starts persistent local PostgreSQL, applies transactional checksum-checked migrations and launches **ten separate domain/gateway services and six separate agent workers**. The gateway serves the built frontend on port 3000; all services bind to loopback by default. Stop the launcher with Ctrl+C. Data lives in ignored `data/`. The execution service starts disposable restricted containers for submitted tests; Docker daemon access belongs only on a trusted execution host.

## The research workflow

1. Create a project and fill in its company brief: problem, current systems/costs, constraints, competitors, employee impact and success metrics.
2. Upload books and evidence. The library supports PDF, DOCX, XLSX, HTML, TXT, Markdown, CSV, JSON, LaTeX and OCR images. Versions and original bytes are retained; identical uploads deduplicate. Text PDFs support 1,500 pages; scanned PDFs support eight OCR pages per upload and must be split beyond that. OCR is English and equations/diagrams need verification against the original.
3. Discover sources and import accessible public HTTPS pages or PDFs. Imports keep source URLs, timestamps, hashes and searchable document text. Private/reserved network targets, custom ports and credential-bearing URLs are rejected. No paywalls or access controls are bypassed. Internet access still follows the environment's allowlist. If local DNS is unavailable behind the cloud proxy, explicit public host approvals in `RESEARCH_SOURCE_DOMAINS` permit proxy-side DNS; Wikipedia is approved by default. Private literal addresses remain rejected.
4. In Analytics, save a **current state versus proposed solution** comparison: matched scope/period/currency, current/proposed costs and revenues, upfront investment, technical or employee success metrics, evidence references and trade-offs. The app calculates incremental benefit, discounted NPV and metric gains/regressions without forcing a positive outcome. Zero baselines have no percentage change; zero investment has no defined return percentage. Estimated and owner-reported observed values remain visibly distinct. Start a new investigation to include a comparison added later. Also save financial scenarios and weighted options matrices. ROI, payback, NPV and cash-flow charts are software-calculated from stated user inputs. Matrix weights/scores are subjective judgments, labelled accordingly.
5. Use the scientific workbench for symbolic expressions, derivatives, integrals, equations, identities, matrix properties, physical unit conversion, Welch sample comparisons, seeded Monte Carlo simulations and formal linear-real-arithmetic checks. Every operation retains its input, result and engine versions.
6. Use the implementation lab to execute Python standard-library code and `unittest` tests in disposable containers. No network, host mounts or API keys enter the container; execution uses a read-only root, unprivileged user, dropped capabilities, memory/CPU/process/output limits and a timeout. Zero tests do not count as success. Passing tests prove only the covered behavior.
7. Start an investigation. A planner records tasks, missing inputs and bounded tool choices. Science, commercial and analytics specialists receive the evidence and actual computation receipts; a reviewer sees all their findings before the director produces the synthesis. The next steps, assumptions, disagreements and source gaps stay visible.
8. Export Markdown, styled Word, PDF or slides. Exports include a frozen baseline/proposal comparison, financial summary, metric/evidence tables, trade-offs, synthesis and detailed provenance; Word/PDF/slides can include current project charts and visuals, explicitly labelled as current at export time. Diagrams and concept images are also downloadable separately.

Investigations allow at most six chat-model calls, configurable output/context/tool/time limits and cancellation. Enabling disposable agent-selected code execution is an explicit per-investigation choice. Model calls already accepted by a provider may still be billed after cancellation; no further calls are dispatched after cancellation is detected. In-progress jobs are marked interrupted after restart instead of silently repeating paid work. Queued jobs persist.

## Local mode versus live providers

Local simulation uses explicitly labelled fixed agent responses. **Scientific computations, OCR, implementation tests, financial calculations, charts and document exports still run for real.** Simulation is useful for testing the application; it is not AI research. In simulation no external discovery or Azure image calls are made by agents. Explicit user source imports still make the requested download.

Use `.env` for your provider values; `.env.example` starts safely in local simulation mode:

```sh
cp .env.example .env
# Edit .env privately; never commit it.
# After stopping any running launcher:
npm run setup
npm run build
npm run dev
```

Keep the generated owner credentials or uncomment their overrides in `.env`. Blank optional Azure/search settings are safe in simulation. Do not uncomment placeholder database URLs until replacing all of them with valid connections.

Connect Azure and Supabase securely using [.env.example](.env.example). Set `RESEARCH_MODEL_MODE=azure` after configuring a compatible HTTPS Azure endpoint, deployment and key. Separate deployment overrides exist for planner, science, commercial, analytics, reviewer and director. Choose a capable reasoning deployment for planning/director/review and a lower-cost capable deployment for specialists, then compare groundedness, latency and cost on your own corpus. Deployment availability and API support vary by region/model.

For example, set `AZURE_AI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com/openai/v1`, `AZURE_AI_MODEL=YOUR-DEPLOYMENT-NAME` and `RESEARCH_AZURE_KEY` privately. These are deployment names from your Azure resource, not necessarily catalog model names.

Chat supports Azure OpenAI-compatible `/openai/v1` and Foundry `/models` endpoints with system/user messages and `max_completion_tokens`. Images use a separate full generation URL and a deployment returning base64 PNG data. Brave Search provides broad discovery when configured; otherwise live discovery is limited to Wikipedia snippets. Full-text imports are independent of snippet discovery. Unrecognized cited URLs are flagged; URL presence alone is not proof that a source supports a claim.

For Supabase, supply PostgreSQL direct/session-pooler connections, not an anon key or REST URL. Set `USE_EXTERNAL_DATABASE=true` and all nine service URLs. Each service owns its schema and Prisma client, with no cross-service foreign keys or runtime cross-service SQL joins. Keep schemas private, use least-privilege roles and verified TLS, and establish the necessary database network route before claiming connectivity. Local development uses a shared development database role. Each URL template in `.env.example` identifies its service schema. URL-encode special characters in database passwords. Migrations run at launcher startup and require schema/table DDL privileges; use a trusted migration identity for initial setup, then restrict runtime identities according to [architecture](docs/architecture.md). Existing local data is not automatically transferred to Supabase.

After startup, check the actual connections:

```sh
npm run check:connections
npm run check:readiness
# Optional: six small paid Azure chat calls, one per agent role:
npm run check:connections -- --probe-models
```

The first command checks database access and configuration without making paid model requests. The explicit probe sends no company information and validates chat compatibility/credentials/quota for each role. Images and search are separate optional integrations; test their app actions too. Real Azure and Supabase credentials have not been supplied or validated in this repository. See [troubleshooting](docs/troubleshooting.md) for specific failures.

## Private desktop and phone access

Owner sessions use HttpOnly cookies, strict origin checks, login rate limiting, server-side revocation and an eight-hour expiry. Signing out invalidates the cookie on the server; other devices can be revoked separately. Changing owner credentials invalidates the saved session generation.

For access from a phone outside the development host, deploy behind HTTPS, set the exact `PUBLIC_ORIGIN`, set `NODE_ENV=production` for Secure cookies, supply unique secrets and keep internal services/database private. **GitHub contains the source code; pushing it does not deploy a running website.** GitHub Pages cannot run these Node services, PostgreSQL, Python tools or Docker. Deploy on a trusted Linux server or container platform with persistent storage and HTTPS. No public deployment has been performed. Browser installation uses Install app/Add to Home Screen. The service worker caches public application assets only, never private API responses. Offline notes are explicitly stored on that device and can be cleared; AI/server research requires connectivity. Native app-store packages are outside this web-app release.

The server generates PDF/image exports using local Chromium with network requests blocked during rendering. Live Azure/Supabase and real model quality require validation after credentials are connected; test-provider responses are never presented as live Azure output.

## Verify

```sh
npm test
npm run build
npm run check:readiness
# With local services running in simulation:
npm run test:integration
npm run test:advanced
npm run test:browser
npm run test:offline
# Real HTTPS exchange against a clearly labelled local provider fixture:
npm run test:providers
```

Do not run fixture suites against production data or paid live-model mode. Unit tests exercise actual scientific engines and Docker isolation. Integration tests remove their own fixtures; advanced/browser tests retain clearly named verification projects and ignored screenshots for inspection. The provider fixture adds only its local test CA to a child process while retaining TLS verification and existing trust; it does not alter production trust settings.

## Structure and conventions

- `backend/services/`: independent gateway, workspace, knowledge, evidence, analytics, scientific, execution, research, report and visual service entry points, plus an agent entry point launched separately for each role.
- `backend/shared/`: transport, authentication and configuration helpers; domain data stays service-owned.
- `frontend/src/pages/`: feature pages annotated with their service ownership.
- `frontend/src/services/`: browser API adapters; the browser never receives database credentials.
- `scripts/`: repeatable setup, process supervision, readiness and migration application.
- `tests/`: unit, API, advanced workflow, browser, offline and provider-contract validation.

Use snake_case names, verb–noun functions and noun-based data variables. React components and framework APIs follow their standard conventions. Tables, columns and service directories use snake_case. See [service architecture](docs/architecture.md), [validation](docs/validation.md) and [cloud startup](docs/cloud_startup.md).
