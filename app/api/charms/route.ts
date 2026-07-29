import {
  getCharmCatalog,
  getCharmResults,
  getCountryCatalog,
  getSourceMetadata,
  loadActiveAirports,
} from "@/lib/affinity-service";

const cacheHeaders = {
  "Cache-Control":
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const requestedCharm = parameters.get("charm");
  const requestedCountry = parameters.get("country");

  try {
    const airports = await loadActiveAirports();

    if (!requestedCharm?.trim()) {
      return Response.json(
        {
          charms: getCharmCatalog(airports),
          countries: getCountryCatalog(airports),
          source: getSourceMetadata(),
        },
        { headers: cacheHeaders },
      );
    }

    const results = getCharmResults(
      requestedCharm,
      requestedCountry,
      airports,
    );
    if (!results) {
      return Response.json(
        { error: "Unknown charm or country." },
        { status: 404, headers: cacheHeaders },
      );
    }

    return Response.json(
      { ...results, source: getSourceMetadata() },
      { headers: cacheHeaders },
    );
  } catch {
    return Response.json(
      {
        error:
          "The live MFC airport catalog is currently unavailable. Please try again.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
