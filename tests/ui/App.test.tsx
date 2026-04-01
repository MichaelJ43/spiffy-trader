import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../../src/App";
import { createDashboardFetchMock } from "../helpers/mock-dashboard-fetch";

describe("App", () => {
  it("switches between dashboard and documentation", async () => {
    const user = userEvent.setup();
    globalThis.fetch = createDashboardFetchMock() as unknown as typeof fetch;

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/Initializing Spiffy Trader/i)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /documentation/i }));
    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to dashboard/i }));
    await waitFor(() => {
      expect(screen.getByText(/Portfolio value/i)).toBeInTheDocument();
    });
  });
});
