// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TUYA_CLIENT_ID = "test-id";
  process.env.TUYA_CLIENT_SECRET = "test-secret-test-secret-test-sec";
});

import { TuyaBudgetError, tuyaRequest, withTuyaBudget } from "@/lib/tuya/client";

/**
 * Blindatura dopo l'incidente del 24/11/2026: la route di diagnostica non deve
 * poter scrivere sulla serratura, e il client Tuya deve fermarsi da solo oltre il
 * budget dell'invocazione.
 */

// Funzioni di access-control che fanno SOLO GET. Aggiungerne una qui significa
// dichiarare che non scrive: controllarlo nel sorgente prima.
const READ_ONLY_EXPORTS = new Set([
  "getAssignedKeys",
  "getDeviceStatus",
  "getDeviceUser",
  "getDeviceUserSchedule",
  "listDeviceUserSchedules",
  "listDoorLockOpenLogs",
  "listTuyaUsers",
]);

const DIAG_ROUTE = path.resolve(__dirname, "../../src/app/api/internal/tuya-diag/run/route.ts");

describe("route tuya-diag: sola lettura", () => {
  const src = readFileSync(DIAG_ROUTE, "utf8");

  it("importa da access-control solo funzioni di lettura", () => {
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/tuya\/access-control"/);
    expect(m?.[1]).toBeDefined();
    const names = (m?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    expect(names.filter((n) => !READ_ONLY_EXPORTS.has(n))).toEqual([]);
  });

  it("non importa servizi che scrivono né tuyaRequest diretto", () => {
    expect(src).not.toMatch(/tuya-pin-service|tuya-pin-health-job|tuya-pin-sync-job/);
    expect(src).not.toMatch(/\btuyaRequest\b/);
    expect(src).toMatch(/readOnly:\s*true/);
  });
});

describe("client Tuya: budget per invocazione", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const fetchMock = vi.fn(async (url: string) => ({
      json: async () =>
        url.includes("/v1.0/token")
          ? { success: true, result: { access_token: "a", refresh_token: "r", expire_time: 7200 } }
          : { success: true, result: { ok: true } },
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("in sola lettura rifiuta PUT/POST/DELETE senza chiamare la rete", async () => {
    const fetchMock = stubFetch();
    for (const method of ["PUT", "POST", "DELETE"] as const) {
      await expect(
        withTuyaBudget({ max: 10, readOnly: true }, () => tuyaRequest(method, "/x"))
      ).rejects.toBeInstanceOf(TuyaBudgetError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si ferma al tetto e conta anche il token", async () => {
    stubFetch();
    let calls = 0;
    await expect(
      withTuyaBudget({ max: 3 }, async () => {
        for (let i = 0; i < 10; i++) {
          await tuyaRequest("GET", "/y");
          calls++;
        }
      })
    ).rejects.toBeInstanceOf(TuyaBudgetError);
    // token (se non in cache) + richieste ≤ 3
    expect(calls).toBeLessThanOrEqual(3);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
