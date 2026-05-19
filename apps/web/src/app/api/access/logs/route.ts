import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/access/logs
 *
 * Previously used Tuya v2.0 Access Control API which does not work
 * with the F22-WRB1 keypad (mk category). Endpoint preserved as stub
 * to avoid breaking any frontend that calls it.
 */
export async function GET() {
  return NextResponse.json({
    records: [],
    message: "Access logs not available for this device type.",
  });
}
