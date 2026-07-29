import { getCountryCatalog } from "@/lib/affinity-service";
import {
  getDemographicResults,
  loadAirportDemographics,
} from "@/lib/demographic-service";

const cacheHeaders = {
  "Cache-Control":
    "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
};

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const requestedMetric = parameters.get("metric");
  const requestedCountry = parameters.get("country");

  try {
    const airports = await loadAirportDemographics();

    if (!requestedMetric?.trim()) {
      return Response.json(
        {
          metrics: [
            { key: "population", label: "Population" },
            { key: "elites", label: "Elites" },
          ],
          countries: getCountryCatalog(airports),
        },
        { headers: cacheHeaders },
      );
    }

    const results = getDemographicResults(
      requestedMetric,
      requestedCountry,
      airports,
    );
    if (!results) {
      return Response.json(
        { error: "Unknown demographic metric or country." },
        { status: 404, headers: cacheHeaders },
      );
    }

    return Response.json(results, { headers: cacheHeaders });
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
