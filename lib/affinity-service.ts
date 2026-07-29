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
    population?: number;
    income?: number;
    features?: AirportCharm[];
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
  population: number;
  income: number;
  charms: AirportCharm[];
};

export type AirportCharm = {
  type: string;
  strength: number;
  title: string;
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
      population:
        typeof airport.population === "number" ? airport.population : 0,
      income: typeof airport.income === "number" ? airport.income : 0,
      charms: Array.isArray(airport.features)
        ? airport.features.filter(
            (charm) =>
              charm &&
              typeof charm.type === "string" &&
              charm.type.length > 0 &&
              typeof charm.strength === "number",
          )
        : [],
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

function charmLabel(type: string) {
  return type
    .toLocaleLowerCase("en")
    .split("_")
    .map((word) => word.charAt(0).toLocaleUpperCase("en") + word.slice(1))
    .join(" ");
}

export function getCharmCatalog(airports: AirportResult[]) {
  const counts = new Map<string, number>();

  for (const airport of airports) {
    for (const charm of airport.charms) {
      counts.set(charm.type, (counts.get(charm.type) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([type, airportCount]) => ({
      type,
      label: charmLabel(type),
      airportCount,
    }))
    .sort(
      (a, b) =>
        b.airportCount - a.airportCount ||
        a.label.localeCompare(b.label, "en"),
    );
}

export function getCountryCatalog(airports: AirportResult[]) {
  const countries = new Map<string, string>();

  for (const airport of airports) {
    if (airport.countryCode) {
      countries.set(airport.countryCode, airport.country);
    }
  }

  return [...countries.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function getCharmResults(
  requestedCharm: string,
  requestedCountry: string | null,
  airports: AirportResult[],
) {
  const charm = getCharmCatalog(airports).find(
    ({ type }) =>
      type.toLocaleLowerCase("en") ===
      requestedCharm.trim().toLocaleLowerCase("en"),
  );
  if (!charm) return undefined;

  const countryCode = requestedCountry?.trim().toLocaleUpperCase("en") || null;
  const country = countryCode
    ? getCountryCatalog(airports).find(({ code }) => code === countryCode)
    : null;
  if (countryCode && !country) return undefined;

  const matching = airports
    .flatMap((airport) => {
      const airportCharm = airport.charms.find(
        ({ type }) => type === charm.type,
      );
      if (!airportCharm || (countryCode && airport.countryCode !== countryCode)) {
        return [];
      }

      return [{ ...airport, charmStrength: airportCharm.strength }];
    })
    .sort(
      (a, b) =>
        b.charmStrength - a.charmStrength ||
        b.size - a.size ||
        a.iata.localeCompare(b.iata, "en"),
    );

  return {
    charm,
    country,
    totalCount: matching.length,
    count: Math.min(matching.length, 200),
    airports: matching.slice(0, 200),
  };
}
