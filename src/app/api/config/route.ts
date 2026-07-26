import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_API_KEY?.trim();
  const serverKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  const liveEnabled =
    process.env.ACCESSTWIN_LIVE_ENABLED?.trim().toLowerCase() !== "false";

  return NextResponse.json(
    {
      browserKeyConfigured: Boolean(browserKey),
      liveEnabled: liveEnabled && Boolean(browserKey) && Boolean(serverKey),
      browserKey:
        liveEnabled && serverKey && browserKey ? browserKey : undefined,
      limits: {
        candidatesPerSearch: 4,
        analysesPerTenMinutes: 12,
        dailyAnalyses: Number(
          process.env.ACCESSTWIN_DAILY_ANALYSIS_LIMIT ?? 100,
        ),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
