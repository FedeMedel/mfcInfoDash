import {
  getAffinityCatalog,
  getAffinityResults,
  getSourceMetadata,
  loadActiveAirports,
} from "@/lib/affinity-service";

const cacheHeaders = {
  "Cache-Control":
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(request: Request) {
  const requestedAffinity = new URL(request.url).searchParams.get("affinity");

  try {
    const airports = await loadActiveAirports();

    if (requestedAffinity?.trim()) {
      const results = getAffinityResults(requestedAffinity, airports);
      if (!results) {
        return Response.json(
          { error: "Unknown trade affinity." },
          { status: 404, headers: cacheHeaders },
        );
      }

      return Response.json(
        { ...results, source: getSourceMetadata() },
        { headers: cacheHeaders },
      );
    }

    return Response.json(
      {
        affinities: getAffinityCatalog(airports),
        source: getSourceMetadata(),
      },
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
