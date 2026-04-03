# AGENTS.md — canonical repository context for AI coding agents

> **MAINTENANCE (mandatory):** Any change that affects **architecture**, **entrypoints**, **scripts**, **CI**, **env contract**, **major directory layout**, or **agent-relevant conventions** MUST update this file in the **same PR/commit** as the change. Treat this document as part of the codebase, not documentation fluff.

---

## 1. Identity

- **Name:** `spiffy-trader` (npm package private, version `0.0.0`).
- **Purpose:** Local **simulated** Kalshi-style prediction-market assistant. Ingests RSS headlines, matches to **open** Kalshi markets (read-only public API), uses an LLM (Ollama primary, optional Gemini backup) to emit **structured JSON** trade decisions, applies **simulated** execution and P&L—**no real orders**, no Kalshi trading credentials required for the sim path.
- **Stack:** Node **ESM** (`"type": "module"`), **TypeScript**, **Express** server (`server.ts` → `src/server/http.ts`), **Vite** for React 19 SPA (`src/`), **CouchDB** for persistence, **Ollama** for chat + optional embeddings, optional **Gemini** via `@google/genai`.
- **UI:** Dashboard + in-app Documentation; not the source of business logic (logic lives server-side + `src/kalshi`, `src/trading`, etc.).

---

## 2. Entrypoints and runtime shape

| Entry | Role |
|-------|------|
| `server.ts` | Loads `dotenv/config`, calls `startServer()` from `src/server/http.js`. |
| `src/server/http.ts` | Express app: API routes, Vite middleware (dev) or `dist` static (prod), `initializeDatabase()`, listens on `PORT` (default 3000), starts monitor loop + intervals. |
| `src/server/monitor.ts` | Core **monitoring loop:** Ollama/Gemini availability, `resolveTrades`, RSS fetch per weighted sources, `curateMarketsForNews`, LLM trade decision JSON, `executeTradeOnPlatform` (simulation). |

**Dev:** `npm run dev` → `tsx server.ts` (TypeScript execute without separate build for server).

**Production UI build:** `npm run build` → Vite → `dist/`; server still runs via Node and serves `dist` when `NODE_ENV === "production"`.

---

## 3. High-level data flow (RSS → trade sim)

1. **News sources:** Weighted list from CouchDB `news_sources` + seeds from `src/server/config.ts` (`SEED_NEWS_*`). Source discovery can add URLs via LLM (`src/ai/source-discovery.ts`).
2. **RSS:** `src/rss/fetch.ts`, backoff `src/rss/backoff.ts`; items stored in CouchDB `news`.
3. **Markets:** Kalshi open markets cached (`src/kalshi/cache.ts`, `kalshi_markets` DB); embeddings optional via `src/ollama/embed.ts` + `src/kalshi/curate.ts` (fallback token overlap `src/lib/text-match.ts`).
4. **LLM:** `src/ai/llm-json.ts` → Ollama `/api/generate` with `format: "json"`, optional Gemini fallback. Prompts in `src/kalshi/prompts.ts` (trade decision, related stories, simulation idle context).
5. **Execution:** `src/trading/platform.ts` — simulation only; fees `src/kalshi/fees.ts`, pricing `src/kalshi/pricing.ts`.
6. **State:** Trades in `trades` DB; bot status in `status`; portfolio halt `src/server/portfolio-halt.ts`.

---

## 4. Directory map (authoritative overview)

```
server.ts                 # process entry
src/db.ts                 # CouchDB URL + database names (env-overridable)
src/db/                   # init, couch helpers, documents, kalshi snapshot, market_watchlist
src/server/               # http, monitor, config, state, portfolio-*, gemma4-hardware (LLM sizing heuristics)
src/kalshi/               # API client, cache, curate, prompts, fees, pricing, ws (optional), types
src/ai/                   # llm-json, gemini, source-discovery, exit-review
src/ollama/               # embeddings, reachability
src/rss/                  # fetch + backoff
src/news/                 # related-stories for prompt context
src/performance/          # news source weighting / performance snapshot
src/trading/              # simulated platform execution
src/lib/                  # utils, trade-ratings, text-match, portfolio-series, kalshi-links, news-scores
src/components/           # Dashboard, DocumentationPage, ErrorBoundary (React)
tests/                    # unit + integration + ui; setup in tests/setup/; shared fetch mocks in tests/helpers/
# Docker: Dockerfile + docker-compose*.yml at repo root; ./docker-compose.sh / docker-compose.ps1
```

**Import convention:** ESM with **`.js` extensions** in import paths for local compiled modules (e.g. `from "./config.js"`). Path alias `@/*` → repo root (see `tsconfig.json`).

---

## 5. Configuration and environment

- **Source of truth for variables:** `.env.example` (copy to `.env.local` for local dev; never commit secrets).
- **Server config aggregation:** `src/server/config.ts` — ports, RSS seeds, Ollama URL/model resolution, embed model, Kalshi caps, timeouts, **Gemma 4 auto model** when `OLLAMA_MODEL` unset (`src/server/gemma4-hardware.ts`), etc.
- **LLM model selection:** If `OLLAMA_MODEL` is **not** set, a Gemma 4 tag is chosen from hardware heuristics. If set, that tag wins. Inspect `GET /api/system/llm-capacity`.
- **CouchDB:** `COUCHDB_URL` and credentials per `src/db/couch.ts` / env.
- **Docker:** Repo root has `Dockerfile`, `docker-compose.yml` (GPU-capable Ollama), and `docker-compose.apple.yml` (macOS Docker Desktop, no `gpus`). Run **`./docker-compose.sh`** or **`docker-compose.ps1`** so the correct compose file is used; see `README.md`.

---

## 6. Linting, typecheck, tests, CI

| Command | What it does |
|---------|----------------|
| `npm run lint` | **`tsc --noEmit` only** — there is **no ESLint** in `package.json`. TypeScript is the linter. |
| `npm run test` | Vitest run, Node env; `tests/ui/**` uses jsdom per `vitest.config.ts`. |
| `npm run test:coverage` | Vitest + v8 coverage with **enforced global floors** (see below); excludes only bootstrap / huge integration surfaces (`main.tsx`, `http.ts`, `monitor.ts`, `kalshi/types.ts`). **`src/components/**` and `App.tsx` are included** so UI stays measurable. |
| `npm run verify` | **`lint` → `test` → `test:coverage`** — required green bar before merge. |

### Coverage enforcement (global)

`vitest.config.ts` sets **`coverage.thresholds`**: failing the run if included `src/**` drops below **80%** lines, statements, or functions, or **65%** branches (branches are capped lower than lines because defensive / optional paths are unevenly hit). **`npm run verify` must pass** — do not lower thresholds in the same PR as unrelated feature work without explicit maintainer intent.

### Coverage expectation for new or changed code (≈90% unit bar)

For any **non-trivial** change under `src/**` (excluding files already excluded from coverage in `vitest.config.ts`):

1. **Unit tests (`tests/unit/**`)** — Any **new or materially modified** module that contains business logic, parsing, math, or HTTP client helpers should reach **≥90% line coverage for that file** in the `npm run test:coverage` table (or as close as practical). If the repo-wide number for that file is still below 90% after your change, **extend tests until it clears 90%** or document why the remainder is unreachable (e.g. only hit in production with real hardware).
2. **UI (`src/components/**`, `App.tsx`)** — **Every user-visible flow** must have **jsdom coverage** in `tests/ui/**`: render, primary interactions, and critical copy/labels. When you add a new screen, button, or panel, **add or extend** a test in the same PR. Existing surfaces: **App** (dashboard ↔ docs), **Dashboard** (stats, chart range, news feed scores, force analysis, execution history / Kalshi links, footer docs callback), **DocumentationPage**, **ErrorBoundary**.
3. **Integration (`tests/integration/**`)** — Use for **cross-module or I/O-adjacent** paths (RSS fetch + parser, Kalshi client usage, pricing helpers, etc.). Aim to cover **common success and common failure** modes (e.g. happy-path RSS body, axios/network error). When you introduce a new external integration or a new failure mode users will hit, **add an integration test** rather than only mocking at unit level.

**Note:** There is no separate CI tool yet for “diff-only 90%”; agents and reviewers use the per-file table from `test:coverage` plus the rules above.

**CI:** `.github/workflows/ci.yml` — `ubuntu-latest`, **Node 22**, `npm ci`, then `npm run lint`, `npm run test`, `npm run test:coverage` (same steps as verify, split into named steps). Coverage thresholds apply in the **Coverage** step.

**Dependencies:** `package.json` may use **`overrides`** (e.g. `esbuild`) for security; run `npm install` after lockfile changes.

---

## 7. Coding conventions (repository-specific)

- **Minimal diffs:** Change only what the task requires; no drive-by refactors or unrelated files.
- **Match existing style:** Imports, naming, error handling patterns in surrounding files.
- **No gratuitous new docs** unless the user asks; **this file** is the exception for agent onboarding.
- **Tests:** Follow **section 6** (global thresholds, ~90% on touched logic files, full UI + integration expectations). Prefer `tests/unit/` for pure logic; `tests/integration/` for realistic I/O wiring; React under `tests/ui/` with jsdom and shared mocks in `tests/helpers/` where useful.
- **Prompts / JSON contracts:** Trade and related-story outputs are schema-sensitive; changing `src/kalshi/prompts.ts` or normalizers may require updates in `tests/unit/prompts.test.ts` or trade-decision tests.

---

## 8. How to make changes (checklist)

1. **Locate** the right layer: RSS (`rss/`), curation (`kalshi/curate.ts`, `ollama/embed.ts`), LLM (`ai/llm-json.ts`, `kalshi/prompts.ts`), persistence (`db/`), HTTP API (`server/http.ts`), UI (`components/`).
2. **Implement** with minimal scope; preserve ESM `.js` import paths for local modules.
3. **Run** `npm run verify` locally (or at minimum `npm run lint` + `npm run test` if iterating quickly, then **full verify** before finish so **coverage thresholds** and `test:coverage` both pass).
4. **Update** `AGENTS.md` if you changed architecture, scripts, CI, env contract, or structural rules.
5. **Do not** commit `.env.local` or secrets.

---

## 9. APIs (non-exhaustive; discover in `http.ts`)

Examples: `/api/health`, `/api/status`, `/api/trades`, `/api/news`, `/api/trigger`, `/api/system/llm-capacity`, performance and trading resume routes. Rate limiting on static/SPA in production.

---

## 10. External references

- **Kalshi:** Public market data only for this sim; WebSocket optional for mids (`src/kalshi/ws-*.ts`).
- **Ollama library:** e.g. Gemma 4 tags documented upstream; app table in `gemma4-hardware.ts`.

---

## 11. Meta

- **Single onboarding file:** New agents should read **this file first**, then `.env.example`, then targeted source files.
- **Cursor:** `.cursor/rules/agents-md-first.mdc` (`alwaysApply: true`) instructs the agent to read this file before substantive work and commands.
- **Stale content:** If you notice drift between this file and the repo, update this file or flag it—stale `AGENTS.md` is a bug.
