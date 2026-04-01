# Spiffy Trader

<p align="left">
  <a href="https://github.com/MichaelJ43/spiffy-trader/actions/workflows/ci.yml"><img src="https://github.com/MichaelJ43/spiffy-trader/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="#verification"><img src="https://img.shields.io/badge/verify-npm_run_verify-4B32C3?logo=vitest&logoColor=white" alt="npm run verify" /></a>
</p>

**Spiffy Trader** is a local, **simulated** Kalshi trading assistant. It ingests financial and political headlines from RSS, matches them to **open** [Kalshi](https://kalshi.com) prediction markets using the public trade API, and uses an LLM to decide whether to open simulated positions—**without placing real orders** or requiring Kalshi trading credentials.

## What it does

- **RSS pipeline** — Polls feeds you configure (a built-in seed list plus sources the model may discover) and stores items in a local database.
- **Market curation** — For each headline, narrows to relevant open markets using embeddings when [Ollama](https://ollama.com) is available, or token overlap as a fallback.
- **LLM decisions** — Ollama is the primary path; optional **Gemini** can back up generation. The model returns structured choices (trade or not, ticker, size, sentiment, reasoning), with prompts oriented around capital preservation and fees.
- **Simulated execution** — Fills at the current YES mid from Kalshi data, applies an estimated taker-style fee, and tracks P&L and settlement in the sim. If portfolio value effectively hits zero, background work pauses until you fund the sim again and resume.

## What you see in the UI

- Portfolio value and cash, with open YES positions marked to mids when snapshots exist.
- A performance chart (replay-style) over selectable windows.
- Execution history with links to the Kalshi site for comparison.
- **Force Analysis** (run a monitoring pass early) and **Force sell all** (close simulated positions at mid or settlement where applicable).

In-app **Documentation** (same content as `src/components/DocumentationPage.tsx`) expands on fees, risk, and limitations.

## Stack and data

- **Kalshi** — Read-only use of the public markets API (listings and quotes). No order API; **this is not live trading.**
- **CouchDB** — Local state (trades, news, bot status, RSS sources, cached open markets). Point `COUCHDB_URL` (and credentials) at your instance; defaults match a typical local setup.
- **Ollama** — Generation and optional embeddings (`OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`, etc.). See `.env.example` for common variables.

Models can be wrong; the UI is for experimentation and learning, **not** financial advice.

## Verification

| What it proves | Command | Passing looks like |
|----------------|---------|-------------------|
| TypeScript compiles | `npm run lint` | `tsc --noEmit` exits with code 0 (no output on success). |
| Vitest suite | `npm run test` | Last lines include `Test Files … passed` and `Tests … passed`; exit code 0. |
| Coverage run | `npm run test:coverage` | Same as tests, plus a `% Coverage report` table; exit code 0. |
| **All of the above (same order as CI)** | `npm run verify` | Runs `lint` → `test` → `test:coverage`; all must exit 0. |

The [CI workflow](.github/workflows/ci.yml) runs the same steps as `npm run verify` on every push and pull request to `main` or `master`. The badge above reflects the latest run on the default branch; add `?branch=main` to the badge URL if you need to pin a branch.

## Run locally

**Prerequisites:** Node.js, a running **CouchDB** instance, and **Ollama** (with your chosen chat and, if you want semantic matching, embedding models pulled). Optional: `GEMINI_API_KEY` for Gemini as a backup to Ollama.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set at least CouchDB URL/credentials, Ollama settings, and optionally `GEMINI_API_KEY`.
3. Run the app: `npm run dev` (serves on port 3000 by default).
