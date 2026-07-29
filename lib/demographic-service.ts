import demographicData from "@/data/demographic-source.json";
import {
  AirportResult,
  RANKING_LIMIT,
  loadActiveAirports,
} from "@/lib/affinity-service";
import { loadMfcJson } from "@/lib/mfc-client";

type DemographicSource = {
  ginis: Record<string, number>;
  overrides: Record<
    string,
    { income: number; population: number; elites: number }
  >;
};

type BoostEntry = {
  value: number;
};

type AirportBoosts = {
  boostFactorsByType?: {
    population?: BoostEntry[];
    elite?: BoostEntry[];
  };
};

type DynamicAirportPayload = {
  boosts?: Record<string, AirportBoosts>;
};

export type DemographicAirport = AirportResult & {
  elites: number;
};

const source = demographicData as DemographicSource;
const defaultApiBase = "https://play.myfly.club";

type Metric = {
  key: "population" | "elites";
  label: "Population" | "Elites";
};

type CountryOption = {
  code: string;
  name: string;
};

type RankedDemographicAirports = {
  totalCount: number;
  airports: DemographicAirport[];
};

type MetricRanking = {
  metric: Metric;
  global: RankedDemographicAirports;
  countries: Map<string, RankedDemographicAirports>;
};

type DemographicIndex = {
  countries: CountryOption[];
  countryByCode: Map<string, CountryOption>;
  rankings: Record<Metric["key"], MetricRanking>;
};

const underrepresentedCountries = new Set([
  "ES",
  "PT",
  "GB",
  "FR",
  "BE",
  "NL",
  "LU",
  "CH",
  "DE",
  "AT",
  "DK",
  "NO",
  "SE",
  "FI",
  "IT",
  "GR",
  "MT",
  "CA",
  "CN",
  "HK",
  "MO",
  "TW",
  "KR",
  "JP",
  "MA",
  "NA",
  "AE",
]);

const nationalCenters = new Set([
  "ALA",
  "TAS",
  "IKA",
  "KHI",
  "DEL",
  "BOM",
  "PVG",
  "FNJ",
  "ICN",
  "GMP",
  "HND",
  "NRT",
  "KIX",
  "ITM",
  "KUL",
  "SGN",
  "CGK",
  "DPS",
  "YYZ",
  "YVR",
  "SFO",
  "MIA",
  "FLL",
  "PBI",
  "MAD",
  "BCN",
  "LIS",
  "LHR",
  "LGW",
  "LTN",
  "EDI",
  "CDG",
  "ORY",
  "LUX",
  "CPH",
  "ARN",
  "FCO",
  "CIA",
  "MXP",
  "BGY",
  "LIN",
  "BUD",
  "ACC",
  "KGL",
  "LUN",
  "MPM",
  "NBO",
]);

const inequalityBoostAirports = new Set([
  "HYD",
  "BLR",
  "MAA",
  "PEK",
  "PKX",
  "SHA",
  "CAN",
  "SZX",
  "MNL",
  "BKK",
  "CAI",
  "ADD",
  "MEX",
  "YYC",
  "SJC",
  "JFK",
  "EWR",
  "LGA",
  "IAD",
  "IAH",
  "LAS",
  "LAX",
]);

const eliteAdjustments: Array<{
  iatas: Set<string>;
  add: number;
  multiply: number;
}> = [
  {
    iatas: new Set(["GVA", "NCE", "LCY", "SYD", "MEL", "AVV"]),
    add: 389,
    multiply: 11.9,
  },
  {
    iatas: new Set([
      "DOH",
      "SZG",
      "ACH",
      "BRN",
      "LUG",
      "INN",
      "MIA",
      "PER",
      "BNE",
      "OOL",
      "YYZ",
      "YVR",
    ]),
    add: 289,
    multiply: 4.9,
  },
  {
    iatas: new Set([
      "NRT",
      "ITM",
      "KIX",
      "FUK",
      "CTS",
      "BSL",
      "ZRH",
      "VCE",
      "BZO",
      "TRN",
      "FLO",
      "BRU",
      "AKL",
      "CNS",
      "SJC",
      "SBA",
      "PBI",
      "XNA",
      "PSP",
      "HTO",
      "HNL",
      "OGG",
      "KOA",
      "CPT",
      "SIN",
    ]),
    add: 179,
    multiply: 3,
  },
  {
    iatas: new Set([
      "HKG",
      "PEK",
      "PVG",
      "ARN",
      "OSL",
      "TRD",
      "MXP",
      "LIN",
      "BGY",
      "FCO",
      "SEA",
      "IAH",
      "ASE",
      "JAC",
      "YUL",
      "YYC",
      "TLV",
    ]),
    add: 149,
    multiply: 2.25,
  },
  {
    iatas: new Set([
      "HND",
      "ICN",
      "MFM",
      "HGH",
      "PKX",
      "SHA",
      "BOM",
      "AUH",
      "LIS",
      "MAD",
      "BCN",
      "CPH",
      "FRA",
      "CDG",
      "AMS",
      "LHR",
      "LGW",
      "LTN",
      "STN",
      "SBH",
      "BLL",
      "AAL",
      "GOT",
      "MMX",
      "BGO",
      "SVG",
      "BOS",
      "HOU",
      "SFO",
      "STS",
      "SNA",
      "BUR",
      "ASP",
      "ISP",
      "HTO",
      "HPN",
      "HVN",
      "BDL",
    ]),
    add: 99,
    multiply: 1.5,
  },
];

let demographicSnapshot:
  | {
      activeAirports: AirportResult[];
      dynamicPayload: DynamicAirportPayload;
      airports: DemographicAirport[];
    }
  | undefined;

const demographicIndexes = new WeakMap<
  DemographicAirport[],
  DemographicIndex
>();

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-x * x)));
  return 0.5 * (1 + erf);
}

function populationAboveThreshold(
  meanIncome: number,
  population: number,
  gini: number,
  threshold: number,
) {
  if (meanIncome <= 0 || population <= 0) return 0;

  const urbanModifier =
    population > 16_000_000
      ? 1.6
      : population > 8_000_000
        ? 1.5
        : population > 4_000_000
          ? 1.4
          : population > 2_000_000
            ? 1.3
            : population > 1_000_000
              ? 1.1
              : population > 100_000
                ? 0.9
                : 0.7;
  const standardDeviation = (gini / 100) * urbanModifier;
  const z =
    (Math.log(threshold) - Math.log(meanIncome)) / standardDeviation;

  return Math.ceil(population * (1 - normalCdf(z)));
}

function computeBaseElites(airport: AirportResult) {
  const override = source.overrides[airport.iata];
  if (override) return override.elites;

  const baseGini = source.ginis[airport.countryCode] ?? 39;
  const population = airport.population;
  const income = airport.income;
  let gini = baseGini;

  if (income <= 4_000 && !["IN", "ZA"].includes(airport.countryCode)) {
    gini += 17;
  } else if (
    income <= 9_000 &&
    population <= 8_000_000 &&
    !["IN", "ZA"].includes(airport.countryCode)
  ) {
    gini += 12;
  } else if (
    income < 6_000 &&
    population > 8_000_000 &&
    !["IN", "ZA"].includes(airport.countryCode)
  ) {
    gini += 9;
  } else if (
    income < 9_000 &&
    population > 8_000_000 &&
    !["IN", "ZA"].includes(airport.countryCode)
  ) {
    gini += 7;
  } else if (
    income < 15_000 &&
    population > 8_000_000 &&
    !["IN", "ZA", "BR"].includes(airport.countryCode)
  ) {
    gini += 5;
  } else if (nationalCenters.has(airport.iata)) {
    gini += 6;
  } else if (inequalityBoostAirports.has(airport.iata)) {
    gini += 2.5;
  }

  const threshold =
    airport.countryCode === "US"
      ? 3_225_000
      : underrepresentedCountries.has(airport.countryCode)
        ? 2_275_000
        : 3_175_000;
  const base = populationAboveThreshold(income, population, gini, threshold);
  const adjustment = eliteAdjustments.find(({ iatas }) =>
    iatas.has(airport.iata),
  );

  if (adjustment) {
    return Math.trunc((base + adjustment.add) * adjustment.multiply);
  }
  if (
    base > 0 &&
    base < 100 &&
    underrepresentedCountries.has(airport.countryCode) &&
    population > 5_000
  ) {
    return Math.min(Math.trunc(population * 0.6), base * 5);
  }
  return base < 10 ? 0 : base;
}

function sumBoosts(entries?: BoostEntry[]) {
  return Array.isArray(entries)
    ? entries.reduce(
        (sum, entry) =>
          sum + (typeof entry.value === "number" ? entry.value : 0),
        0,
      )
    : 0;
}

function roundedElites(value: number) {
  const integer = Math.max(0, Math.trunc(value));
  if (integer === 0) return 0;

  const digits = String(integer);
  return Number(
    digits.length <= 2
      ? `${digits.slice(0, 1)}${"0".repeat(digits.length - 1)}`
      : `${digits.slice(0, 2)}${"0".repeat(digits.length - 2)}`,
  );
}

export async function loadAirportDemographics() {
  const base = (process.env.MFC_API_BASE ?? defaultApiBase).replace(/\/+$/, "");
  const url = `${base}/airports`;

  const [airports, payload] = await Promise.all([
    loadActiveAirports(),
    loadMfcJson(url, (rawPayload) => {
      if (!rawPayload || typeof rawPayload !== "object") {
        throw new Error(
          "MFC dynamic airport catalog returned an unexpected response.",
        );
      }
      return rawPayload as DynamicAirportPayload;
    }),
  ]);

  if (
    demographicSnapshot?.activeAirports === airports &&
    demographicSnapshot.dynamicPayload === payload
  ) {
    return demographicSnapshot.airports;
  }

  const boosts = payload.boosts ?? {};
  const results = airports.map((airport) => {
    const boostTypes = boosts[String(airport.id)]?.boostFactorsByType;
    return {
      ...airport,
      population:
        airport.population + sumBoosts(boostTypes?.population),
      elites: roundedElites(
        computeBaseElites(airport) + sumBoosts(boostTypes?.elite),
      ),
    };
  });

  demographicSnapshot = {
    activeAirports: airports,
    dynamicPayload: payload,
    airports: results,
  };
  return results;
}

function rankedDemographicAirports(
  airports: DemographicAirport[],
  metric: Metric["key"],
) {
  const sorted = airports.sort(
    (a, b) =>
      b[metric] - a[metric] ||
      b.size - a.size ||
      a.iata.localeCompare(b.iata, "en"),
  );
  return {
    totalCount: sorted.length,
    airports: sorted.slice(0, RANKING_LIMIT),
  };
}

function buildMetricRanking(
  metric: Metric,
  airports: DemographicAirport[],
): MetricRanking {
  const matching = airports.filter((airport) => airport[metric.key] > 0);
  const countries = new Map<string, DemographicAirport[]>();

  for (const airport of matching) {
    const countryAirports = countries.get(airport.countryCode) ?? [];
    countryAirports.push(airport);
    countries.set(airport.countryCode, countryAirports);
  }

  return {
    metric,
    global: rankedDemographicAirports([...matching], metric.key),
    countries: new Map(
      [...countries.entries()].map(([code, countryAirports]) => [
        code,
        rankedDemographicAirports(countryAirports, metric.key),
      ]),
    ),
  };
}

function demographicIndex(airports: DemographicAirport[]) {
  const cached = demographicIndexes.get(airports);
  if (cached) return cached;

  const countryByCode = new Map<string, CountryOption>();
  for (const airport of airports) {
    if (airport.countryCode) {
      countryByCode.set(airport.countryCode, {
        code: airport.countryCode,
        name: airport.country,
      });
    }
  }

  const population: Metric = { key: "population", label: "Population" };
  const elites: Metric = { key: "elites", label: "Elites" };
  const built = {
    countries: [...countryByCode.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    ),
    countryByCode,
    rankings: {
      population: buildMetricRanking(population, airports),
      elites: buildMetricRanking(elites, airports),
    },
  };

  demographicIndexes.set(airports, built);
  return built;
}

export function getDemographicCountryCatalog(
  airports: DemographicAirport[],
) {
  return demographicIndex(airports).countries;
}

export function getDemographicResults(
  requestedMetric: string,
  requestedCountry: string | null,
  airports: DemographicAirport[],
) {
  const airportIndex = demographicIndex(airports);

  const metricKey = requestedMetric.trim().toLocaleLowerCase("en");
  if (metricKey !== "population" && metricKey !== "elites") return undefined;
  const ranking = airportIndex.rankings[metricKey];

  const countryCode = requestedCountry?.trim().toLocaleUpperCase("en") || null;
  const country = countryCode
    ? airportIndex.countryByCode.get(countryCode)
    : null;
  if (countryCode && !country) return undefined;

  const results = countryCode
    ? ranking.countries.get(countryCode) ?? {
        totalCount: 0,
        airports: [],
      }
    : ranking.global;

  return {
    metric: ranking.metric,
    country,
    totalCount: results.totalCount,
    count: results.airports.length,
    airports: results.airports,
  };
}
