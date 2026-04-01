import React from "react";
import { ArrowLeft, BookOpen, ShieldAlert } from "lucide-react";

type Props = {
  onBack: () => void;
};

export default function DocumentationPage({ onBack }: Props) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/50 hover:text-orange-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </button>
          <div className="h-4 w-px bg-white/15" />
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold tracking-tight">Documentation</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 shrink-0 bg-orange-500 rounded-sm flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight uppercase italic">Spiffy Trader</h1>
            <p className="mt-2 text-white/60 text-sm leading-relaxed">
              A local, simulated trading assistant that reads financial and political headlines from RSS,
              matches them to open Kalshi prediction markets, and uses an LLM to decide whether to open
              simulated positions—without placing real orders on Kalshi.
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">What it does</h2>
          <ul className="text-sm text-white/75 space-y-2 list-disc pl-5 leading-relaxed">
            <li>
              <span className="text-white/90">Polls RSS feeds</span> you configure (seed list plus any
              sources the model discovers) and ingests new items into a local database.
            </li>
            <li>
              <span className="text-white/90">Curates Kalshi markets</span> for each headline—using
              embeddings when Ollama is available, or token overlap as a fallback—so the model only
              chooses from markets that are actually open on Kalshi&apos;s public API.
            </li>
            <li>
              <span className="text-white/90">Asks the LLM</span> (Ollama first, optional Gemini backup)
              for a structured decision: trade or not, ticker, size, sentiment, and reasoning. The prompt
              stresses capital preservation, fees, and not running the simulated account to zero.
            </li>
            <li>
              <span className="text-white/90">Simulates execution</span> at the current YES mid from
              Kalshi data: cash decreases by notional plus an estimated taker-style fee; P&amp;L and
              settlement follow the same toy math as you hold or exit positions.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">What you see on the dashboard</h2>
          <ul className="text-sm text-white/75 space-y-2 list-disc pl-5 leading-relaxed">
            <li>
              <span className="text-white/90">Portfolio value &amp; cash</span> — cash plus mark-to-market
              for open YES positions (using live mids when snapshots exist).
            </li>
            <li>
              <span className="text-white/90">Performance chart</span> — replay-based approximation of
              portfolio value over selectable windows; the right edge aligns with live portfolio value.
            </li>
            <li>
              <span className="text-white/90">Execution history</span> — each row links out to the Kalshi
              website (event page when known) so you can compare the sim with the real market.
            </li>
            <li>
              <span className="text-white/90">Force Analysis</span> — triggers a monitoring pass early;{" "}
              <span className="text-white/90">Force sell all</span> closes open simulated positions at the
              current mid or settlement when applicable.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">Fees &amp; risk (simulation)</h2>
          <p className="text-sm text-white/75 leading-relaxed">
            Buys charge an estimated Kalshi-style taker fee on top of notional so the model feels drag on
            tiny-edge trades. If total portfolio value falls to essentially zero, the worker{" "}
            <span className="text-white/90">stops scheduling</span> RSS/LLM loops until you fund again and
            call the resume endpoint—so the sim doesn&apos;t burn API calls when there&apos;s nothing left
            to trade.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">Where data lives</h2>
          <p className="text-sm text-white/75 leading-relaxed">
            Everything runs against a <span className="text-white/90">local CouchDB</span> (or whatever
            you point <span className="font-mono text-xs text-orange-400/90">COUCHDB_URL</span> at): trades,
            news, bot status, RSS source records, and a cached snapshot of open Kalshi markets. No
            cloud-hosted app database is required for the default setup.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-orange-500">Important limitations</h2>
          <ul className="text-sm text-white/75 space-y-2 list-disc pl-5 leading-relaxed">
            <li>This is <span className="text-white/90">not</span> live trading on Kalshi—no API keys for
              orders, no real money at risk in the app.</li>
            <li>Models can be wrong; the UI is for experimentation and learning, not financial advice.</li>
            <li>Open-market cache and embeddings depend on local services (Ollama, Couch) being up.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
