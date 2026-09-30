// Characterization tests for the VPS worker's contract with the Bkav decrypt
// proxy (vps-worker/src/lib/bkav.js `parseProxyResponse`).
//
// Why this seam: the accepted request changes what vps-worker/bkav-proxy/
// server.js returns for an encrypted Bkav response — a successfully decrypted
// XML/JSON payload instead of the raw ciphertext, and a clear error instead of
// the raw body when decryption cannot succeed. The worker's parseProxyResponse
// is the direct consumer of that output and is NOT part of the change, so the
// response shapes it already understands must keep working. These tests pin
// those shapes.
//
// Deliberately NOT asserted here: the proxy's own decrypt logic
// (decryptBkavResponse / processEncryptedResponse / the 'Giải mã thất bại'
// fallback in bkav-proxy/server.js). That module is a standalone systemd
// service with no test runner, starts an HTTP listener at import time, and is
// not reachable from any lane — see the coverage limits in the report. The
// raw-ciphertext fallback is the behavior the request intentionally changes and
// is therefore not characterized as correct.
//
// The worker is a CommonJS module outside the frontend TypeScript project
// (allowJs: false, include: ["src"]), and its own dependencies are not installed
// in this workspace. It is loaded through Node's require with a one-shot stub
// for the single module it requires at load time (axios); parseProxyResponse
// itself performs no I/O.

import Module, { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface ProxyResult {
  success: boolean;
  invoiceNo?: string;
  invoiceDate?: string;
  maCQT?: string;
  maTraCuu?: string;
  error?: string;
  errorCode?: string | number;
  raw?: unknown;
}

const nodeRequire = createRequire(import.meta.url);

const moduleInternals = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

function loadWorkerBkav(): {
  parseProxyResponse: (bodyText: string) => ProxyResult;
} {
  const originalLoad = moduleInternals._load;
  moduleInternals._load = function (
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "axios") {
      return { post: async () => ({ data: "" }) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return nodeRequire("../../../../vps-worker/src/lib/bkav.js") as {
      parseProxyResponse: (bodyText: string) => ProxyResult;
    };
  } finally {
    moduleInternals._load = originalLoad;
  }
}

const { parseProxyResponse } = loadWorkerBkav();

describe("parseProxyResponse — proxy output contract", () => {
  it("preserves a normalized SOAP fault's code and real reason (never UNKNOWN)", () => {
    const text =
      "<R><E>FAULT:Client | Mã số thuế không hợp lệ hoặc không tồn tại</E></R>";
    const result = parseProxyResponse(text);

    expect(result.success).toBe(false);
    // The code is preserved separately; the human-readable error carries the
    // real reason (never the old 'UNKNOWN' placeholder).
    expect(result.errorCode).toBe("Client");
    expect(result.error).toBe(
      "SOAP fault: Mã số thuế không hợp lệ hoặc không tồn tại",
    );
    expect(result.error).not.toContain("UNKNOWN");
    expect(result.raw).toBe(text);
  });

  it("uses the fault reason as the error code when Bkav supplied no faultcode", () => {
    // The fixed proxy emits 'reason' alone (no ' | ') when there is no code.
    const text = "<R><E>FAULT:MST không hợp lệ</E></R>";
    const result = parseProxyResponse(text);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("MST không hợp lệ");
    expect(result.error).toBe("SOAP fault: MST không hợp lệ");
    expect(result.error).not.toContain("UNKNOWN");
  });

  it("maps the proxy's PROXY_ERROR marker to a network error result", () => {
    const result = parseProxyResponse("<R><E>PROXY_ERROR</E></R>");

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PROXY_ERROR");
    expect(result.error).toContain("bkav-proxy");
  });

  it("reports an empty proxy response instead of throwing", () => {
    const result = parseProxyResponse("");

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("EMPTY_RESPONSE");
  });

  it("maps the proxy's DECRYPT_ERROR marker to a clear error with the verbatim reason", () => {
    // The fixed proxy no longer returns raw ciphertext on decrypt failure; it
    // emits '<R><E>DECRYPT_ERROR:<reason></E></R>' (bkav-proxy/server.js L313).
    // The worker must surface the real reason (e.g. the AES/PKCS#7 failure)
    // instead of falling through to the generic PARSE_FAILED message.
    const text = "<R><E>DECRYPT_ERROR:wrong final block length</E></R>";
    const result = parseProxyResponse(text);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DECRYPT_ERROR");
    expect(result.error).toContain("wrong final block length");
    expect(result.error).not.toContain("Không parse được phản hồi Bkav");
    expect(result.raw).toBe(text);
  });

  it("keeps the DECRYPT_ERROR reason verbatim, including the empty-payload variant", () => {
    // The proxy's empty-ExecCommandResult branch emits the reason
    // 'EMPTY_PAYLOAD | ExecCommandResult không có nội dung Base64' (L300).
    // The worker preserves that reason verbatim under errorCode DECRYPT_ERROR.
    const text =
      "<R><E>DECRYPT_ERROR:EMPTY_PAYLOAD | ExecCommandResult không có nội dung Base64</E></R>";
    const result = parseProxyResponse(text);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DECRYPT_ERROR");
    expect(result.error).toContain(
      "EMPTY_PAYLOAD | ExecCommandResult không có nội dung Base64",
    );
    expect(result.raw).toBe(text);
  });

  it("maps the proxy's EMPTY_PAYLOAD marker to a clear error", () => {
    // The proxy's dedicated empty-payload marker (bkav-proxy/server.js L300
    // emits the DECRYPT_ERROR:EMPTY_PAYLOAD variant; this pins the bare
    // EMPTY_PAYLOAD marker the worker also understands).
    const text = "<R><E>EMPTY_PAYLOAD</E></R>";
    const result = parseProxyResponse(text);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("EMPTY_PAYLOAD");
    expect(result.error).toContain("rỗng");
    expect(result.raw).toBe(text);
  });

  it("parses a decrypted payload wrapped in <ExecCommandResult>Base64(JSON)</ExecCommandResult>", () => {
    // Shape the proxy produces after decrypting one layer: the decrypted XML
    // still carries the ExecCommandResult wrapper around a Base64 JSON body.
    const json = {
      Status: 0,
      isOk: true,
      Object: JSON.stringify([
        {
          Status: 0,
          InvoiceNo: "00008780",
          InvoiceDate: "2026-05-21T10:00:00",
          MaCQT: "MCQT-1",
          MaTraCuu: "TRA-1",
        },
      ]),
    };
    const text = `<soap:Envelope><ExecCommandResult>${Buffer.from(
      JSON.stringify(json),
      "utf8",
    ).toString("base64")}</ExecCommandResult></soap:Envelope>`;

    const result = parseProxyResponse(text);

    expect(result.success).toBe(true);
    expect(result.invoiceNo).toBe("00008780");
    expect(result.invoiceDate).toBe("2026-05-21T10:00:00");
    expect(result.maCQT).toBe("MCQT-1");
    expect(result.maTraCuu).toBe("TRA-1");
    expect(result.error).toBe("");
  });

  it("parses a decrypted payload that is already direct JSON", () => {
    const text = JSON.stringify({
      Status: 0,
      isOk: true,
      Object: JSON.stringify([{ Status: 0, InvoiceNo: "00009999" }]),
    });

    const result = parseProxyResponse(text);

    expect(result.success).toBe(true);
    expect(result.invoiceNo).toBe("00009999");
  });

  it("surfaces the real per-invoice rejection reason when the envelope is OK but the item failed", () => {
    const text = JSON.stringify({
      Status: 0,
      isOk: true,
      Object: JSON.stringify([{ Status: 1, MessLog: "Số hoá đơn đã tồn tại" }]),
    });

    const result = parseProxyResponse(text);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Số hoá đơn đã tồn tại");
    expect(result.errorCode).toBe(1);
  });

  it("treats a draft invoice (InvoiceNo '0') as not yet numbered", () => {
    const text = JSON.stringify({
      Status: 0,
      isOk: true,
      Object: JSON.stringify([{ Status: 0, InvoiceNo: "0" }]),
    });

    const result = parseProxyResponse(text);

    expect(result.success).toBe(true);
    expect(result.invoiceNo).toBe("");
  });
});
