import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_API_KEY?.trim();

  return NextResponse.json(
    {
      browserKeyConfigured: Boolean(browserKey),
      browserKey: browserKey || undefined,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
