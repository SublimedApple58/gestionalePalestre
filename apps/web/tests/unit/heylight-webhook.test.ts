import { verifyWebhookSignature } from "@/lib/payments/heylight";

// Vettore ufficiale dalla doc HeyLight (Webhooks Implementation Guide).
const SECRET = "0f8c1a52-3d94-4e7b-9c26-5b7a1f0e8d43";
const BODY = '{"status": "awaiting_confirmation", "token": "6G1c-4Auj-7aFm-1Wzm-6IU1-25PY-1YVz-8nGb"}';
const SIGNATURE = "6aad3fb2cf4839bc536c22ad296999095747f7038328bb06eecf893e05791bff";

describe("heylight verifyWebhookSignature", () => {
  const original = process.env.HEYLIGHT_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.HEYLIGHT_WEBHOOK_SECRET = SECRET;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.HEYLIGHT_WEBHOOK_SECRET;
    else process.env.HEYLIGHT_WEBHOOK_SECRET = original;
  });

  it("accetta la firma valida (vettore ufficiale)", () => {
    expect(verifyWebhookSignature(BODY, SIGNATURE)).toBe(true);
  });

  it("è case-insensitive sull'hex della firma", () => {
    expect(verifyWebhookSignature(BODY, SIGNATURE.toUpperCase())).toBe(true);
  });

  it("rifiuta il body manomesso (anche solo uno spazio in coda)", () => {
    expect(verifyWebhookSignature(`${BODY} `, SIGNATURE)).toBe(false);
  });

  it("rifiuta una firma sbagliata", () => {
    expect(verifyWebhookSignature(BODY, "00" + SIGNATURE.slice(2))).toBe(false);
  });

  it("rifiuta firma mancante quando il secret è impostato", () => {
    expect(verifyWebhookSignature(BODY, null)).toBe(false);
  });
});
