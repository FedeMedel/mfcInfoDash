import assert from "node:assert/strict";
import test from "node:test";
import {
  isTradeAffinity,
  isCulturalPoliticalAffinity,
  isDiasporaAffinity,
  normalizedAffinityName,
  parseCsvLine,
} from "../scripts/generate-affinity-index.mjs";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

function request(path) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: {
        accept: path.startsWith("/api/") ? "application/json" : "text/html",
      },
    }),
    environment,
    executionContext,
  );
}

test("classifies all supported MFC affinities and parses quoted CSV values", () => {
  assert.equal(isTradeAffinity("Investment banking"), true);
  assert.equal(isTradeAffinity("Golden Triangle x2"), true);
  assert.equal(isTradeAffinity("Anglophone|"), false);
  assert.equal(isTradeAffinity("|US|Indian"), false);
  assert.equal(isTradeAffinity("None|"), false);
  assert.equal(isCulturalPoliticalAffinity("Anglophone|"), true);
  assert.equal(isCulturalPoliticalAffinity("EU|"), true);
  assert.equal(isCulturalPoliticalAffinity("|US|Indian"), false);
  assert.equal(isDiasporaAffinity("|US|Indian"), true);
  assert.equal(isDiasporaAffinity("|AE|Malayali"), true);
  assert.equal(isDiasporaAffinity("Indian"), false);
  assert.equal(normalizedAffinityName("Anglophone|"), "Anglophone");
  assert.equal(
    normalizedAffinityName("|US|Indian"),
    "Indian diaspora",
  );
  assert.equal(
    normalizedAffinityName("Investment banking"),
    "Investment banking",
  );
  assert.deepEqual(parseCsvLine('1,"Airport, International","JFK"'), [
    "1",
    "Airport, International",
    "JFK",
  ]);
});

test("server-renders the affinity finder", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /MFC Airport Data Dashboards \| MFC Info/);
  assert.match(html, /rel="icon" href="\/favicon\.png"/);
  assert.match(html, /og-affinities\.png/);
  assert.match(html, /Affinity Finder/);
  assert.doesNotMatch(html, /Find airports by commercial affinity/);
  assert.match(html, />Affinities</);
  assert.doesNotMatch(html, /Trade Affinities/);
  assert.match(html, /Airport Charms/);
  assert.match(html, /Population &amp; Elites/);
  assert.doesNotMatch(html, /Coming soon|Airport Explorer|Network Insights/);
  assert.match(html, /refresh the list automatically/);
  assert.doesNotMatch(html, /Find airports<\/button>/);
  assert.match(html, /role="combobox"/);
  assert.doesNotMatch(html, /<datalist/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the airport charm ranking tab", async () => {
  const response = await request("/charms");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Airport Charm Rankings/);
  assert.match(html, /All countries/);
  assert.match(html, /show up to 100 active airports/i);
  assert.doesNotMatch(html, /show up to 200 active airports/i);
});

test("server-renders the population and elite ranking tab", async () => {
  const response = await request("/demographics");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Population &amp; Elite Rankings/);
  assert.match(html, /Population/);
  assert.match(html, /Elites/);
  assert.match(html, /All countries/);
  assert.match(html, /show up to 100 active airports/i);
  assert.doesNotMatch(html, /show up to 200 active airports/i);
});

test("APIs cache MFC snapshots and return sorted top 100 rankings", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const originalDateNow = Date.now;
  const originalFetchTimeout = process.env.MFC_FETCH_TIMEOUT_MS;
  let now = originalDateNow();
  let staticFetches = 0;
  let dynamicFetches = 0;
  const persistentEntries = new Map();

  try {
    Date.now = () => now;
    process.env.MFC_FETCH_TIMEOUT_MS = "10";
    globalThis.caches = {
      async open() {
        return {
          async match(key) {
            return persistentEntries.get(String(key))?.clone();
          },
          async put(key, response) {
            persistentEntries.set(String(key), response.clone());
          },
        };
      },
    };
    globalThis.fetch = async (_input, init) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("Expected an abort signal."));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    const unavailable = await request("/api/affinities");
    assert.equal(unavailable.status, 502);

    globalThis.fetch = async (input) => {
      if (/play\.myfly\.club\/airports$/.test(String(input))) {
        dynamicFetches += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Response.json({
          boosts: {
            100: {
              boostFactorsByType: {
                population: [{ source: "Test facility", value: 1_000_000 }],
                elite: [{ source: "Test facility", value: 500 }],
              },
            },
          },
        });
      }

      assert.match(
        String(input),
        /play\.myfly\.club\/api\/v5\.1\.2\/airports-static/,
      );
      staticFetches += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Response.json({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: 100,
            geometry: { type: "Point", coordinates: [-73, 40] },
            properties: {
              id: 100,
              iata: "JFK",
              name: "John F. Kennedy International Airport",
              city: "New York",
              size: 8,
              countryCode: "US",
              population: 12_000_000,
              income: 85_000,
              features: [
                {
                  type: "ELITE_CHARM",
                  strength: 6,
                  title: "Elite Destination",
                },
                {
                  type: "GATEWAY_AIRPORT",
                  strength: 1,
                  title: "Gateway Airport",
                },
                {
                  type: "DOMESTIC_AIRPORT",
                  strength: 1,
                  title: "Domestic Airport",
                },
              ],
            },
          },
          {
            type: "Feature",
            id: 200,
            geometry: { type: "Point", coordinates: [-79, 43] },
            properties: {
              id: 200,
              iata: "YYZ",
              name: "Toronto Pearson International Airport",
              city: "Toronto",
              size: 9,
              countryCode: "CA",
              population: 10_000_000,
              income: 90_000,
              features: [
                {
                  type: "ELITE_CHARM",
                  strength: 9,
                  title: "Elite Destination",
                },
                {
                  type: "FINANCIAL_HUB",
                  strength: 3,
                  title: "Business Hub",
                },
              ],
            },
          },
          ...Array.from({ length: 120 }, (_, index) => {
            const iata = `X${index.toString(36).padStart(2, "0")}`.toUpperCase();
            return {
              type: "Feature",
              id: 1_000 + index,
              geometry: { type: "Point", coordinates: [-80, 35] },
              properties: {
                id: 1_000 + index,
                iata,
                name: `Test Airport ${iata}`,
                city: `Test City ${index}`,
                size: 7 + (index % 3),
                countryCode: "US",
                population: 1_000_000 + index,
                income: 50_000,
                features: [
                  {
                    type: "ELITE_CHARM",
                    strength: 6,
                    title: "Elite Destination",
                  },
                ],
              },
            };
          }),
        ],
      });
    };

    const [catalog, charmCatalog, demographicCatalog] = await Promise.all([
      request("/api/affinities"),
      request("/api/charms"),
      request("/api/demographics"),
    ]);
    assert.equal(catalog.status, 200);
    assert.equal(charmCatalog.status, 200);
    assert.equal(demographicCatalog.status, 200);
    assert.equal(staticFetches, 1);
    assert.equal(dynamicFetches, 1);
    assert.equal(persistentEntries.size, 2);

    const catalogBody = await catalog.json();
    assert.ok(
      catalogBody.affinities.every(
        ({ name }) => !name.startsWith("|") && !name.endsWith("|"),
      ),
    );
    assert.ok(
      catalogBody.affinities.every(
        (affinity, index, affinities) =>
          index === 0 ||
          affinities[index - 1].name.localeCompare(affinity.name, "en") <= 0,
      ),
    );
    assert.ok(
      catalogBody.affinities.some(({ name }) => name === "Anglophone"),
    );
    assert.ok(
      catalogBody.affinities.some(({ name }) => name.endsWith(" diaspora")),
    );

    const match = await request(
      "/api/affinities?affinity=investment%20BANKING",
    );
    assert.equal(match.status, 200);
    const matchBody = await match.json();
    assert.equal(matchBody.affinity, "Investment banking");
    assert.deepEqual(
      matchBody.airports.map(({ iata }) => iata),
      ["YYZ", "JFK"],
    );

    const culturalMatch = await request(
      "/api/affinities?affinity=anglophone",
    );
    assert.equal(culturalMatch.status, 200);
    assert.deepEqual(
      (await culturalMatch.json()).airports.map(({ iata }) => iata),
      ["YYZ", "JFK"],
    );

    const diasporaMatch = await request(
      "/api/affinities?affinity=bengali%20diaspora",
    );
    assert.equal(diasporaMatch.status, 200);
    assert.deepEqual(
      (await diasporaMatch.json()).airports.map(({ iata }) => iata),
      ["YYZ"],
    );

    const charmCatalogBody = await charmCatalog.json();
    assert.equal(charmCatalogBody.charms[0].type, "ELITE_CHARM");
    assert.ok(
      charmCatalogBody.charms.every(
        ({ type }) =>
          type !== "GATEWAY_AIRPORT" && type !== "DOMESTIC_AIRPORT",
      ),
    );

    const [gatewayAirport, domesticAirport] = await Promise.all([
      request("/api/charms?charm=gateway_airport"),
      request("/api/charms?charm=domestic_airport"),
    ]);
    assert.equal(gatewayAirport.status, 404);
    assert.equal(domesticAirport.status, 404);

    const charmResults = await request(
      "/api/charms?charm=elite_charm&country=CA",
    );
    assert.equal(charmResults.status, 200);
    const charmBody = await charmResults.json();
    assert.equal(charmBody.charm.label, "Elite Charm");
    assert.equal(charmBody.country.name, "Canada");
    assert.deepEqual(
      charmBody.airports.map(({ iata, charmStrength }) => ({
        iata,
        charmStrength,
      })),
      [{ iata: "YYZ", charmStrength: 9 }],
    );

    const demographicCatalogBody = await demographicCatalog.json();
    assert.deepEqual(
      demographicCatalogBody.metrics.map(({ key }) => key),
      ["population", "elites"],
    );

    const populationResults = await request(
      "/api/demographics?metric=population",
    );
    assert.equal(populationResults.status, 200);
    const populationBody = await populationResults.json();
    assert.equal(populationBody.airports[0].iata, "JFK");
    assert.equal(populationBody.airports[0].population, 13_000_000);
    assert.ok(populationBody.airports[0].elites > 0);

    const eliteResults = await request(
      "/api/demographics?metric=elites&country=CA",
    );
    assert.equal(eliteResults.status, 200);
    const eliteBody = await eliteResults.json();
    assert.equal(eliteBody.metric.label, "Elites");
    assert.equal(eliteBody.country.name, "Canada");
    assert.deepEqual(
      eliteBody.airports.map(({ iata }) => iata),
      ["YYZ"],
    );

    const charmTop = await request(
      "/api/charms?charm=elite_charm&country=US",
    );
    assert.equal(charmTop.status, 200);
    const charmTopBody = await charmTop.json();
    assert.equal(charmTopBody.totalCount, 121);
    assert.equal(charmTopBody.count, 100);
    assert.equal(charmTopBody.airports.length, 100);
    assert.ok(
      charmTopBody.airports.every(
        ({ countryCode }) => countryCode === "US",
      ),
    );
    assert.ok(
      charmTopBody.airports.every(
        (airport, index, airports) =>
          index === 0 ||
          airports[index - 1].charmStrength > airport.charmStrength ||
          (airports[index - 1].charmStrength === airport.charmStrength &&
            (airports[index - 1].size > airport.size ||
              (airports[index - 1].size === airport.size &&
                airports[index - 1].iata.localeCompare(airport.iata, "en") <=
                  0))),
      ),
    );

    const populationTop = await request(
      "/api/demographics?metric=population&country=US",
    );
    assert.equal(populationTop.status, 200);
    const populationTopBody = await populationTop.json();
    assert.equal(populationTopBody.totalCount, 121);
    assert.equal(populationTopBody.count, 100);
    assert.equal(populationTopBody.airports.length, 100);
    assert.ok(
      populationTopBody.airports.every(
        ({ countryCode }) => countryCode === "US",
      ),
    );
    assert.ok(
      populationTopBody.airports.every(
        (airport, index, airports) =>
          index === 0 ||
          airports[index - 1].population > airport.population ||
          (airports[index - 1].population === airport.population &&
            (airports[index - 1].size > airport.size ||
              (airports[index - 1].size === airport.size &&
                airports[index - 1].iata.localeCompare(airport.iata, "en") <=
                  0))),
      ),
    );

    const unknown = await request("/api/affinities?affinity=Not%20real");
    assert.equal(unknown.status, 404);

    now += 24 * 60 * 60 * 1000 + 1;
    const refreshedResults = await request(
      "/api/demographics?metric=population&country=US",
    );
    assert.equal(refreshedResults.status, 200);
    assert.equal((await refreshedResults.json()).airports.length, 100);
    assert.equal(staticFetches, 2);
    assert.equal(dynamicFetches, 2);

    now += 24 * 60 * 60 * 1000 + 1;
    globalThis.fetch = async (input) => {
      if (/play\.myfly\.club\/airports$/.test(String(input))) {
        dynamicFetches += 1;
      } else {
        staticFetches += 1;
      }
      return new Response("Unavailable", { status: 503 });
    };

    const staleResults = await request(
      "/api/demographics?metric=population&country=US",
    );
    assert.equal(staleResults.status, 200);
    assert.equal((await staleResults.json()).airports.length, 100);
    assert.equal(staticFetches, 3);
    assert.equal(dynamicFetches, 3);

    const retryDeferred = await request(
      "/api/demographics?metric=population&country=CA",
    );
    assert.equal(retryDeferred.status, 200);
    assert.equal(staticFetches, 3);
    assert.equal(dynamicFetches, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = originalCaches;
    }
    Date.now = originalDateNow;
    if (originalFetchTimeout === undefined) {
      delete process.env.MFC_FETCH_TIMEOUT_MS;
    } else {
      process.env.MFC_FETCH_TIMEOUT_MS = originalFetchTimeout;
    }
  }
});
