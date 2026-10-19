# Service and agent architecture

The application uses TypeScript for independent HTTP services and the responsive web client. Zod validates service inputs and agent tool plans. Each data-owning service has its own Prisma schema/client and PostgreSQL schema. Python is confined to numerical/document-processing workers and disposable implementation-test containers.

## UI ownership

| Feature                                        | Page                  | Service    | Port | Owned data                                        |
| ---------------------------------------------- | --------------------- | ---------- | ---- | ------------------------------------------------- |
| Owner login, revocation, install/offline shell | main, install_control | gateway    | 3000 | Private session ledger on disk                    |
| Projects and company briefs                    | main, brief_page      | workspace  | 4101 | project                                           |
| Uploads, OCR, versions and retrieval           | library_page          | knowledge  | 4102 | document                                          |
| Conversation, planning, budgets and activity   | research_page         | research   | 4103 | message, research_run, research_step              |
| Baseline comparisons, finance and decisions    | analytics_page        | analytics  | 4104 | scenario, improvement_comparison, decision_matrix |
| Markdown/Word/PDF/slides                       | research_page         | report     | 4105 | report                                            |
| Diagrams and Azure concept images              | visuals_page          | visual     | 4106 | visual_asset                                      |
| Symbolic/numerical/formal operations           | science_page          | scientific | 4107 | experiment                                        |
| Search and full-text downloads                 | evidence_page         | evidence   | 4108 | web_source                                        |
| Code and real unit-test execution              | implementation_page   | execution  | 4109 | code_test                                         |

Each SQL service also owns its `service_migration` metadata table, represented in Prisma. IDs across services are scalar UUIDs without foreign keys. Production service roles must restrict access to their own schemas. Test cleanup deliberately uses the local development role; application code does not use cross-service SQL joins.

All browser APIs pass through the owner-authenticated gateway. Private services require an internal bearer token and bind to loopback by default. Override `*_SERVICE_URL` for separate hosts and `SERVICE_HOST` for private-network binding. A shared development token is not a replacement for production network isolation and service identity.

## Agent communication

Six separate workers run `backend/services/agent_service/server.ts` with an `AGENT_ROLE`:

| Role       | Port | Receives                                                               | Returns                                                                           |
| ---------- | ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| planner    | 4206 | Question, company context, evidence, allowed tool contracts and limits | Zod-validated tasks, permitted tool choices, declared assumptions, missing inputs |
| science    | 4201 | Evidence, plan, actual scientific/code receipts                        | Mechanisms, equations, limits and proposed physical tests                         |
| commercial | 4202 | Same packet                                                            | Business options, competitors, adoption and employee impact                       |
| analytics  | 4203 | Same packet including computed scenarios/matrices                      | Financial interpretation, uncertainty and missing measurements                    |
| reviewer   | 4204 | Packet plus all three specialist findings                              | Critique, conflicts and required corrections                                      |
| director   | 4205 | Packet, findings and review                                            | Synthesis, implementation proposal and next investigation                         |

The coordinator persists the run before work. It reserves at most six model calls, invokes the planner, executes permitted bounded tools, consults specialists in parallel, waits for every specialist, consults the reviewer, then the director. No private chain of thought is stored or exchanged; only explicit findings, plans, evidence and computation receipts are communicated.

Tool calls use fixed scientific operations or, when enabled for the run, Python standard-library implementation tests. Planner requests are validated against operation schemas. User documents remain untrusted evidence; they do not grant permissions. Tools do not deploy, buy services, message companies or modify their infrastructure.

A submitted question launches a proactive investigation within explicit limits, not indefinite monitoring. The planner surfaces gaps and alternatives. Existing financial scenarios trigger a reproducible Monte Carlo sensitivity check when the tool budget permits, using an explicitly hypothetical 20% savings deviation. Context retains the latest document versions and bounded recent history/scenarios/receipts; no exhaustive-book claim is made.

Plans, limits, usage, evidence, intermediate findings, errors and final answers persist. Cancellation stops further dispatch and aborts pending model HTTP requests where possible; already accepted provider work may still be billed. Running code containers retain their own short hard limits. Queued cancellation is immediate. Restarted active investigations/test jobs are marked interrupted instead of repeated automatically.

## Computation and implementation isolation

Scientific operations use a fixed Python AST parser, never Python eval for expression input. They allow a small arithmetic/function vocabulary and enforce expression, matrix, sample, CPU, memory, output and wall-clock bounds. SymPy provides algebra, NumPy/SciPy numerical/statistical operations, Pint units and Z3 linear-real-arithmetic checks. Z3 rejects inconsistent premises as a useful proof and can return a counterexample. These tools do not prove arbitrary scientific theories.

Submitted implementation code runs inside a digest-pinned official Python container: no network, no host volumes, no API-key environment injection, read-only root, unprivileged UID, dropped capabilities, no-new-privileges, 256 MB memory, one CPU, bounded PIDs/output and a timeout. Passing, failing, zero-test and timeout outcomes stay distinct. Only the execution service needs Docker access; deploy it on a dedicated trusted execution host. Container isolation is not a universal guarantee against all kernel/runtime vulnerabilities.

OCR runs local Tesseract/Poppler on generated temporary paths; no user shell command is constructed. Mathematical OCR and image interpretation require manual verification. PDFs retain page markers; searchable excerpts have filenames, page numbers and character offsets. Original bytes and SHA-256 fingerprints support provenance and versioning.

## Migrations and persistence

Each schema has versioned SQL plus a checksum ledger. `scripts/apply_migrations.ts` applies it in a transaction under a per-service advisory lock and refuses altered previously applied migrations. Startup never resets user data. Prisma's JavaScript PostgreSQL adapter avoids downloaded native query engines. The pinned Prisma 6 JavaScript schema-engine config used for generation/diffing is experimental; deployment uses the tested SQL runner because its experimental migration engine could not read PostgreSQL 18 metadata. Do not mix migration ledgers.

Publication snapshots prepared filesystem state, not live connections or processes. Docker images may need to be restored by setup; do not assume a Docker daemon/image cache survived. Start services again and verify readiness. Nine PostgreSQL service URLs and explicit network access are needed for a later Supabase connection.

## Independent execution

After setup and migrations, each service starts independently from the repository root with `npx tsx backend/services/<name>_service/server.ts`. Start agents with `AGENT_ROLE=<role> npx tsx backend/services/agent_service/server.ts`. `PORT` overrides a process port. The launcher supervises them together only as a development convenience; service communication uses HTTP across real process boundaries.

## Baseline and proposal evidence

Analytics owns immutable saved comparisons. They require current/proposed cost and revenue inputs, a matched horizon/currency, financial evidence, at least one success metric with direction and reference, and explicit trade-offs. Calculations preserve unfavorable metrics and negative NPV; observed labels are owner reports, not independent verification. A zero metric baseline yields no percentage; positive monthly benefit gives simple payback which may exceed the horizon. Return on upfront is net incremental benefit divided by additional upfront investment, and is undefined at zero investment. No arbitrary scores are aggregated into a claim of overall superiority.

Research retrieves the latest five comparisons when starting a run. Their inputs and results are persisted in the evidence packet, supplied to every role within context limits, and formatted deterministically into the report before model prose. Later comparisons require a new run. Report snapshots do not change when project data changes; separately appended project charts/visuals remain explicitly labelled current at export time.
