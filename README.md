<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

<p align="left">
  <a href=".github/workflows/ci.yml"><img src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white" alt="CI workflow" /></a>
  <a href="#verification"><img src="https://img.shields.io/badge/verify-npm_run_verify-4B32C3?logo=vitest&logoColor=white" alt="npm run verify" /></a>
</p>

After this repo is on GitHub, you can add a **live pass/fail** badge next to the links above by inserting your GitHub username or organization in this URL (replace both `OWNER` segments):

`https://github.com/OWNER/spiffy-trader/actions/workflows/ci.yml/badge.svg`

## Verification

| What it proves | Command | Passing looks like |
|----------------|---------|-------------------|
| TypeScript compiles | `npm run lint` | `tsc --noEmit` exits with code 0 (no output on success). |
| Vitest suite | `npm run test` | Last lines include `Test Files … passed` and `Tests … passed`; exit code 0. |
| Coverage run | `npm run test:coverage` | Same as tests, plus a `% Coverage report` table; exit code 0. |
| **All of the above (same order as CI)** | `npm run verify` | Runs `lint` → `test` → `test:coverage`; all must exit 0. |

The [CI workflow](.github/workflows/ci.yml) runs the same steps as `npm run verify` on every push and pull request to `main` or `master`.

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c83cd991-0c69-4a02-9c64-deaf775ea479

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
