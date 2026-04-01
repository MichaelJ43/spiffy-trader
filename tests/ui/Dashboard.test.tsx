import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
