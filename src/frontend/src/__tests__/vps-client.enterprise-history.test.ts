// Cover tests for the accepted "write the raw Bkav response for root-cause
// lookup" behavior at the frontend consumer seam.
//
// Accepted behavior: getEnterpriseHistory logs the raw enterprise-history
// response (including each failed order's real invoiceError) so the Bkav
// rejection reason can be diagnosed from the browser, and only does so when
// the response actually contains failed invoices.
//
// This exercises the real vps-client module with a mocked global fetch and a
// mocked runtime env — no external network call. It does NOT exercise the VPS
// worker's own bkav_logs write (that code has no test runner).

import { getEnterpriseHistory } from "@/lib/vps-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ vps_url: "https://vps.test" }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("getEnterpriseHistory raw-response logging", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("logs the raw response with the real invoiceError when a failed invoice is present", async () => {
    const realReason = "SOAP fault: Client | MST không hợp lệ";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          orders: [
            {
              orderId: "ORD-FAILED",
              restaurantId: "R1",
              cusName: "A",
              cusPhone: "0900",
              amount: 70000,
              bookingStatus: "confirmed",
              paymentStatus: "paid",
              paymentMethod: "cash",
              invoiceStatus: "failed",
              invoiceError: realReason,
              createdAt: 1,
            },
          ],
          count: 1,
          total: 70000,
        }),
      ),
    );

    const res = await getEnterpriseHistory(
      "dev-acc",
      "01/01/2026",
      "02/01/2026",
      ["paid"],
    );

    expect(res.orders[0].invoiceError).toBe(realReason);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = warnSpy.mock.calls[0];
    expect(String(message)).toContain("enterprise-history raw response");
    expect(payload).toEqual([
      {
        orderId: "ORD-FAILED",
        invoiceStatus: "failed",
        invoiceError: realReason,
      },
    ]);
  });

  it("does not log when no failed invoice is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          orders: [
            {
              orderId: "ORD-OK",
              restaurantId: "R1",
              cusName: "A",
              cusPhone: "0900",
              amount: 70000,
              bookingStatus: "confirmed",
              paymentStatus: "paid",
              paymentMethod: "cash",
              invoiceStatus: "invoiced",
              createdAt: 1,
            },
          ],
          count: 1,
          total: 70000,
        }),
      ),
    );

    await getEnterpriseHistory("dev-acc", "01/01/2026", "02/01/2026", ["paid"]);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("preserves the order fields and keeps invoiceError only for a failed order", async () => {
    // Characterization of the consumer contract the accounting page relies on:
    // getEnterpriseHistory must pass each order through unchanged, carrying the
    // real invoiceError for a failed order and leaving it absent/empty for a
    // non-failed one. This is adjacent behavior the current request does not
    // intentionally change.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          orders: [
            {
              orderId: "ORD-FAILED",
              restaurantId: "R1",
              cusName: "A",
              cusPhone: "0900",
              amount: 70000,
              bookingStatus: "confirmed",
              paymentStatus: "paid",
              paymentMethod: "cash",
              invoiceStatus: "failed",
              invoiceError: "SOAP fault: Client | MST không hợp lệ",
              createdAt: 111,
            },
            {
              orderId: "ORD-INVOICED",
              restaurantId: "R2",
              cusName: "B",
              cusPhone: "0911",
              amount: 50000,
              bookingStatus: "confirmed",
              paymentStatus: "paid",
              paymentMethod: "transfer",
              invoiceStatus: "invoiced",
              createdAt: 222,
            },
          ],
          count: 2,
          total: 120000,
        }),
      ),
    );

    const res = await getEnterpriseHistory(
      "dev-acc",
      "01/01/2026",
      "02/01/2026",
      ["paid"],
    );

    expect(res.count).toBe(2);
    expect(res.total).toBe(120000);
    expect(res.orders).toHaveLength(2);

    const failed = res.orders.find((o) => o.orderId === "ORD-FAILED");
    expect(failed).toMatchObject({
      restaurantId: "R1",
      cusName: "A",
      cusPhone: "0900",
      amount: 70000,
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "cash",
      invoiceStatus: "failed",
      invoiceError: "SOAP fault: Client | MST không hợp lệ",
      createdAt: 111,
    });

    const invoiced = res.orders.find((o) => o.orderId === "ORD-INVOICED");
    expect(invoiced?.invoiceStatus).toBe("invoiced");
    // A non-failed order carries no rejection reason.
    expect(invoiced?.invoiceError ?? "").toBe("");
  });

  it("sends the device id, dd/mm/yyyy range and statuses to the VPS endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ok: true, orders: [], count: 0, total: 0 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getEnterpriseHistory("dev-acc", "01/02/2026", "03/02/2026", [
      "paid",
      "cancelled",
    ]);

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/orders/enterprise-history?");
    expect(String(url)).toContain("deviceId=dev-acc");
    expect(String(url)).toContain("from=01%2F02%2F2026");
    expect(String(url)).toContain("to=03%2F02%2F2026");
    expect(String(url)).toContain("status=paid%2Ccancelled");
  });
});
