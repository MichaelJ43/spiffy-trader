# Test layout

| Folder | Purpose |
|--------|---------|
| `unit/` | Pure logic: fees, portfolio replay, Kalshi URLs, utils, prompts snippets, config helpers. |
| `integration/` | Backend modules with **mocked axios** (Kalshi client, RSS fetch, `getKalshiMarketData`). |
| `ui/` | React Testing Library: `Dashboard`, `App` navigation, `DocumentationPage`. Uses mocked `fetch` for `/api/*`. |
| `live/` | Same production code paths; **only outbound HTTP (axios)** is stubbed with fixtures—no real Kalshi, RSS hosts, or Ollama. |
| `setup/` | Vitest setup (`jest-dom`, `ResizeObserver` for Recharts in jsdom). |
| `helpers/` | Shared mocks (e.g. dashboard `fetch`). |

Commands: `npm test` (CI), `npm run test:watch`, `npm run test:coverage`.
