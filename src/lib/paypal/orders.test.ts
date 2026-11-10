// The executor's retry logic depends on SDK errors becoming PayPalError with the right status (4xx = definite).
import { ApiError } from "@paypal/paypal-server-sdk";
import { describe, expect, it } from "vitest";
import { PayPalError } from "./client";
import { call } from "./orders";

const apiError = (statusCode: number) =>
  new ApiError({ request: { method: "POST", url: "x" }, response: { statusCode, headers: { "Paypal-Debug-Id": "dbg1" }, body: '{"name":"UNPROCESSABLE_ENTITY"}' } } as never, "sdk");

describe("SDK call wrapper", () => {
  it("maps an SDK ApiError to PayPalError with status, debug id and parsed body", async () => {
    const e = await call("refund", () => Promise.reject(apiError(422))).catch((x) => x);
    expect(e).toBeInstanceOf(PayPalError);
    expect(e.res).toMatchObject({ status: 422, ok: false, debugId: "dbg1", body: { name: "UNPROCESSABLE_ENTITY" } });
  });
  it("passes timeouts through unchanged (unknown outcome, not a definite refusal)", async () => {
    const t = new DOMException("timed out", "TimeoutError");
    await expect(call("refund", () => Promise.reject(t))).rejects.toBe(t);
  });
});
