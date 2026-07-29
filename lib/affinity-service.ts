import affinityData from "@/data/trade-affinities.json";

type AffinityIndex = {
  meta: {
    sourceCommit: string;
    generatedAt: string;
    apiVersion: string;
  };
  affinities: Record<string, string[]>;
};

type AirportFeature = {
  id: number;
  properties: {
    id: number;
    iata: string;
    name: string;
    city: string;
    size: number;
    countryCode: string;
  };
};

type AirportFeatureCollection = {
  type: "FeatureCollection";
  features: AirportFeature[];
};

export type AirportResult = {
  id: number;
  iata: string;
  name: string;
  city: string;
  countryCode: string;
  country: string;
  size: number;
};

const index = affinityData as AffinityIndex;
const defaultApiBase = "https://play.myfly.club";
const defaultApiVersion = "v5.1.2";
const catalogTtlMs = 60 * 60 * 1000;

let catalogCache:
  | {
      key: string;
      expiresAt: number;
      airports: AirportResult[];
    }
  | undefined;

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function getCatalogUrl() {
  const base = (process.env.MFC_API_BASE ?? defaultApiBase).replace(/\/+$/, "");
  const version = process.env.MFC_API_VERSION ?? defaultApiVersion;
  return `${base}/api/${version}/airports-static`;
}

export async function loadActiveAirports(): Promise<AirportResult[]> {
  const url = getCatalogUrl();
  const now = Date.now();

  if (
    catalogCache &&
    catalogCache.key === url &&
    catalogCache.expiresAt > now
  ) {
    return catalogCache.airports;
  }

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`MFC airport catalog returned ${response.status}.`);
  }

  const payload = (await response.json()) as AirportFeatureCollection;
  if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("MFC airport catalog returned an unexpected response.");
  }

  const airports = payload.features
    .map((feature) => feature.properties)
    .filter(
      (airport) =>
        airport &&
        typeof airport.id === "number" &&
        typeof airport.iata === "string" &&
        airport.iata.length > 0,
    )
    .map((airport) => ({
      id: airport.id,
      iata: airport.iata,
      name: airport.name,
      city: airport.city,
      countryCode: airport.countryCode,
      country: countryName(airport.countryCode),
      size: airport.size,
    }));

  catalogCache = {
    key: url,
    expiresAt: now + catalogTtlMs,
    airports,
  };

  return airports;
}

function canonicalAffinity(requested: string) {
  const normalized = requested.trim().toLocaleLowerCase("en");
  return Object.keys(index.affinities).find(
    (name) => name.toLocaleLowerCase("en") === normalized,
  );
}

function airportMap(airports: AirportResult[]) {
  return new Map(airports.map((airport) => [airport.iata, airport]));
}

export function getAffinityCatalog(airports: AirportResult[]) {
  const activeAirports = airportMap(airports);

  return Object.entries(index.affinities)
    .map(([name, iatas]) => ({
      name,
      airportCount: iatas.filter((iata) => activeAirports.has(iata)).length,
    }))
    .filter((affinity) => affinity.airportCount > 0)
    .sort(
      (a, b) =>
        b.airportCount - a.airportCount ||
        a.name.localeCompare(b.name, "en"),
    );
}

export function getAffinityResults(
  requested: string,
  airports: AirportResult[],
) {
  const affinity = canonicalAffinity(requested);
  if (!affinity) return undefined;

  const activeAirports = airportMap(airports);
  const results = index.affinities[affinity]
    .map((iata) => activeAirports.get(iata))
    .filter((airport): airport is AirportResult => Boolean(airport))
    .sort((a, b) => b.size - a.size || a.iata.localeCompare(b.iata, "en"));

  return {
    affinity,
    count: results.length,
    airports: results,
  };
}

export function getSourceMetadata() {
  return {
    affinityIndexCommit: index.meta.sourceCommit,
    affinityIndexGeneratedAt: index.meta.generatedAt,
    apiVersion:
      process.env.MFC_API_VERSION ?? index.meta.apiVersion ?? defaultApiVersion,
  };
}
