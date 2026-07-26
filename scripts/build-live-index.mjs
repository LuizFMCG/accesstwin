import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.ACCESSTWIN_BASE_URL ?? "http://127.0.0.1:3000")
  .replace(/\/$/, "");
const permission = process.env.ACCESSTWIN_ALLOW_PAID_INDEX_BUILD;
const maxProfiles = Math.max(
  1,
  Number(process.env.ACCESSTWIN_INDEX_MAX_PROFILES ?? 5),
);
const durationMinutes = Math.max(
  1,
  Number(process.env.ACCESSTWIN_INDEX_DURATION_MINUTES ?? 15),
);
const travelMode = process.env.ACCESSTWIN_INDEX_TRAVEL_MODE ?? "WALK";

if (permission !== "YES") {
  throw new Error(
    "Paid index build blocked. Set ACCESSTWIN_ALLOW_PAID_INDEX_BUILD=YES explicitly.",
  );
}

if (!["WALK", "BICYCLE", "DRIVE"].includes(travelMode)) {
  throw new Error("ACCESSTWIN_INDEX_TRAVEL_MODE must be WALK, BICYCLE or DRIVE.");
}

const catalogResponse = await fetch(`${baseUrl}/api/catalog`);
if (!catalogResponse.ok) {
  throw new Error(`Could not load catalog (${catalogResponse.status}).`);
}
const catalog = await catalogResponse.json();
const territories = catalog.territories.slice(0, maxProfiles);
const profiles = [];

for (const [index, territory] of territories.entries()) {
  process.stdout.write(
    `[${index + 1}/${territories.length}] ${territory.label}, ${territory.city}\n`,
  );
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: territory,
      durationMinutes,
      travelMode,
      demo: false,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Analysis failed for ${territory.id}: ${payload.error ?? response.status}`,
    );
  }
  profiles.push({
    id: territory.id,
    territory,
    counts: Object.fromEntries(
      payload.categories.map((category) => [category.id, category.count]),
    ),
    total: payload.total,
    density: payload.density,
    areaKm2: payload.areaKm2,
    source: "google",
    indexedAt: payload.generatedAt,
    indexVersion: `google-${new Date().toISOString().slice(0, 10)}`,
    taxonomyVersion: payload.taxonomyVersion,
  });
}

const outputDirectory = path.resolve("data");
const outputPath = path.join(
  outputDirectory,
  `territorial-index-${travelMode.toLowerCase()}-${durationMinutes}m.generated.json`,
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      indexVersion: catalog.indexVersion,
      taxonomyVersion: catalog.taxonomyVersion,
      durationMinutes,
      travelMode,
      profileCount: profiles.length,
      profiles,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`Saved ${profiles.length} profiles to ${outputPath}\n`);
