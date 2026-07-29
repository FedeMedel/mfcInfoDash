import affinityData from "@/data/trade-affinities.json";
import { loadMfcJson } from "@/lib/mfc-client";

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
export const RANKING_LIMIT = 100;
const excludedCharmTypes = new Set(["domestic_airport", "gateway_airport"]);

type CountryOption = {
  code: string;
  name: string;
};

type CharmOption = {
  type: string;
  label: string;
  airportCount: number;
};

type CharmRankingAirport = AirportResult & {
  charmStrength: number;
};

type RankedAirportSet<T> = {
  totalCount: number;
  airports: T[];
};

type CharmIndexEntry = {
  option: CharmOption;
  global: RankedAirportSet<CharmRankingAirport>;
  countries: Map<string, RankedAirportSet<CharmRankingAirport>>;
};

type ActiveAirportIndex = {
  byIata: Map<string, AirportResult>;
  charms: CharmOption[];
  charmByNormalizedType: Map<string, CharmIndexEntry>;
  countries: CountryOption[];
  countryByCode: Map<string, CountryOption>;
};

const activeAirportIndexes = new WeakMap<AirportResult[], ActiveAirportIndex>();

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

  return loadMfcJson(url, (rawPayload) => {
    const payload = rawPayload as AirportFeatureCollection;
    if (
      payload?.type !== "FeatureCollection" ||
      !Array.isArray(payload.features)
    ) {
      throw new Error("MFC airport catalog returned an unexpected response.");
    }

    return payload.features
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
  });
}

function canonicalAffinity(requested: string) {
  const normalized = requested.trim().toLocaleLowerCase("en");
  return Object.keys(index.affinities).find(
    (name) => name.toLocaleLowerCase("en") === normalized,
  );
}

function rankedSet<T>(
  airports: T[],
  compare: (a: T, b: T) => number,
): RankedAirportSet<T> {
  const sorted = airports.sort(compare);
  return {
    totalCount: sorted.length,
    airports: sorted.slice(0, RANKING_LIMIT),
  };
}

function charmRankingOrder(
  a: CharmRankingAirport,
  b: CharmRankingAirport,
) {
  return (
    b.charmStrength - a.charmStrength ||
    b.size - a.size ||
    a.iata.localeCompare(b.iata, "en")
  );
}

function activeAirportIndex(airports: AirportResult[]) {
  const cached = activeAirportIndexes.get(airports);
  if (cached) return cached;

  const byIata = new Map(
    airports.map((airport) => [airport.iata, airport] as const),
  );
  const countryByCode = new Map<string, CountryOption>();
  const charmBuilders = new Map<
    string,
    {
      label: string;
      global: CharmRankingAirport[];
      countries: Map<string, CharmRankingAirport[]>;
    }
  >();

  for (const airport of airports) {
    if (airport.countryCode) {
      countryByCode.set(airport.countryCode, {
        code: airport.countryCode,
        name: airport.country,
      });
    }

    const seenCharmTypes = new Set<string>();
    for (const charm of airport.charms) {
      if (
        excludedCharmTypes.has(charm.type.trim().toLocaleLowerCase("en"))
      ) {
        continue;
      }
      if (seenCharmTypes.has(charm.type)) continue;
      seenCharmTypes.add(charm.type);

      const builder = charmBuilders.get(charm.type) ?? {
        label: charmLabel(charm.type),
        global: [],
        countries: new Map<string, CharmRankingAirport[]>(),
      };
      const rankedAirport = {
        ...airport,
        charmStrength: charm.strength,
      };

      builder.global.push(rankedAirport);
      const countryAirports =
        builder.countries.get(airport.countryCode) ?? [];
      countryAirports.push(rankedAirport);
      builder.countries.set(airport.countryCode, countryAirports);
      charmBuilders.set(charm.type, builder);
    }
  }

  const charmEntries = [...charmBuilders.entries()]
    .map(([type, builder]) => {
      const option = {
        type,
        label: builder.label,
        airportCount: builder.global.length,
      };
      const countries = new Map(
        [...builder.countries.entries()].map(([code, countryAirports]) => [
          code,
          rankedSet(countryAirports, charmRankingOrder),
        ]),
      );

      return {
        option,
        global: rankedSet(builder.global, charmRankingOrder),
        countries,
      } satisfies CharmIndexEntry;
    })
    .sort(
      (a, b) =>
        b.option.airportCount - a.option.airportCount ||
        a.option.label.localeCompare(b.option.label, "en"),
    );

  const built = {
    byIata,
    charms: charmEntries.map(({ option }) => option),
    charmByNormalizedType: new Map(
      charmEntries.map((entry) => [
        entry.option.type.toLocaleLowerCase("en"),
        entry,
      ]),
    ),
    countries: [...countryByCode.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    ),
    countryByCode,
  };

  activeAirportIndexes.set(airports, built);
  return built;
}

export function getAffinityCatalog(airports: AirportResult[]) {
  const activeAirports = activeAirportIndex(airports).byIata;

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

  const activeAirports = activeAirportIndex(airports).byIata;
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
  return activeAirportIndex(airports).charms;
}

export function getCountryCatalog(airports: AirportResult[]) {
  return activeAirportIndex(airports).countries;
}

export function getCharmResults(
  requestedCharm: string,
  requestedCountry: string | null,
  airports: AirportResult[],
) {
  const airportIndex = activeAirportIndex(airports);
  const charmEntry = airportIndex.charmByNormalizedType.get(
    requestedCharm.trim().toLocaleLowerCase("en"),
  );
  if (!charmEntry) return undefined;

  const countryCode = requestedCountry?.trim().toLocaleUpperCase("en") || null;
  const country = countryCode
    ? airportIndex.countryByCode.get(countryCode)
    : null;
  if (countryCode && !country) return undefined;

  const ranking = countryCode
    ? charmEntry.countries.get(countryCode) ?? {
        totalCount: 0,
        airports: [],
      }
    : charmEntry.global;

  return {
    charm: charmEntry.option,
    country,
    totalCount: ranking.totalCount,
    count: ranking.airports.length,
    airports: ranking.airports,
  };
}
