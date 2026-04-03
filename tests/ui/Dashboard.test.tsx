import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Dashboard from "../../src/components/Dashboard";
import { createDashboardFetchMock } from "../helpers/mock-dashboard-fetch";

describe("Dashboard", () => {
  it("renders header and portfolio after fetch", async () => {
    globalThis.fetch = createDashboardFetchMock() as unknown as typeof fetch;
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Spiffy Trader/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Portfolio value/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$250\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders news feed relevance, edge, and impact scores", async () => {
    globalThis.fetch = createDashboardFetchMock({
      newsItems: [
        {
          source: "Wire",
          timestamp: new Date().toISOString(),
          content: "Headline for scores.",
          sentiment: "Neutral",
          relevanceScore: 60,
          edgeScore: 40
        }
      ]
    }) as unknown as typeof fetch;

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Spiffy Trader/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/News Feed/i)).toBeInTheDocument();
    expect(screen.getByText(/Rel: 60%/)).toBeInTheDocument();
    expect(screen.getByText(/Edge: 40%/)).toBeInTheDocument();
    expect(screen.getByText(/Impact: 54%/)).toBeInTheDocument();
  });

  it("switches portfolio chart window when a range button is clicked", async () => {
    const user = userEvent.setup();
    globalThis.fetch = createDashboardFetchMock() as unknown as typeof fetch;
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Spiffy Trader/i)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^5D$/i }));
    expect(screen.getByRole("button", { name: /^5D$/i })).toBeInTheDocument();
  });

  it("POSTs to /api/trigger when Force Analysis is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = createDashboardFetchMock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Spiffy Trader/i)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Force Analysis/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/trigger"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("invokes onOpenDocs when footer Documentation is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDocs = vi.fn();
    globalThis.fetch = createDashboardFetchMock() as unknown as typeof fetch;
    render(<Dashboard onOpenDocs={onOpenDocs} />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Spiffy Trader/i)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^Documentation$/i }));
    expect(onOpenDocs).toHaveBeenCalledTimes(1);
  });

  it("renders an open trade in execution history with Kalshi link", async () => {
    globalThis.fetch = createDashboardFetchMock({
      trades: [
        {
          id: "t-open-1",
          timestamp: new Date().toISOString(),
          event: "Test Event",
          market: "Market",
          outcome: "YES",
          price: 0.55,
          amount: 25,
          status: "OPEN",
          ticker: "KXTEST-1",
          eventTicker: "KXTEST",
          tradeRating: 7.5,
          entryFeeUsd: 0.5,
          totalOutlayUsd: 25.5
        }
      ],
      newsItems: []
    }) as unknown as typeof fetch;

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Spiffy Trader/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Test Event/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open Kalshi market KXTEST-1/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("kalshi.com/events/KXTEST"));
  });
});
