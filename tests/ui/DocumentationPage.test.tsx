import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DocumentationPage from "../../src/components/DocumentationPage";

describe("DocumentationPage", () => {
  it("calls onBack when clicking back", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<DocumentationPage onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows documentation content", () => {
    render(<DocumentationPage onBack={() => {}} />);
    expect(screen.getByText(/Spiffy Trader/i)).toBeInTheDocument();
    expect(screen.getByText(/simulated trading assistant/i)).toBeInTheDocument();
  });
});
