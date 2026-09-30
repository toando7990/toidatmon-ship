import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("CopyOrderIdButton", () => {
  afterEach(() => cleanup());

  it("copies the FULL order id to the clipboard and does not trigger the parent card's click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const parentClick = vi.fn();
    render(
      // biome-ignore lint/a11y/useKeyWithClickEvents: test wrapper
      <div onClick={parentClick}>
        <CopyOrderIdButton orderId="ORD-1790072417076-5cd9e59f" />
      </div>,
    );
    fireEvent.click(screen.getByTestId("copy_order_id_button"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("ORD-1790072417076-5cd9e59f"),
    );
    expect(parentClick).not.toHaveBeenCalled();
  });
});
