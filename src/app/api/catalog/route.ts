import { NextResponse } from "next/server";
import {
  TERRITORIAL_INDEX_TAXONOMY,
  TERRITORIAL_INDEX_VERSION,
} from "@/lib/territorial-index";
import { TERRITORIES } from "@/lib/territories";

export async function GET() {
  return NextResponse.json(
    {
      indexVersion: TERRITORIAL_INDEX_VERSION,
      taxonomyVersion: TERRITORIAL_INDEX_TAXONOMY,
      territoryCount: TERRITORIES.length,
      territories: TERRITORIES,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
