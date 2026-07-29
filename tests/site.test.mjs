import assert from "node:assert/strict";
import test from "node:test";
import {
  isTradeAffinity,
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

test("classifies MFC trade affinities and parses quoted CSV values", () => {
  assert.equal(isTradeAffinity("Investment banking"), true);
  assert.equal(isTradeAffinity("Golden Triangle x2"), true);
  assert.equal(isTradeAffinity("Anglophone|"), false);
  assert.equal(isTradeAffinity("|US|Indian"), false);
  assert.equal(isTradeAffinity("None|"), false);
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
  assert.match(html, /Trade Affinity Airport Finder \| MFC Info/);
  assert.match(html, /Trade Affinity Finder/);
  assert.doesNotMatch(html, /Find airports by commercial affinity/);
  assert.match(html, /Trade Affinities/);
  assert.match(html, /Airport Charms/);
  assert.match(html, /Coming soon/);
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
  assert.match(html, /show up to 200 active airports/i);
});

test("affinity API handles upstream failure, matching, sorting, and unknown values", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response("Unavailable", { status: 503 });
    const unavailable = await request("/api/affinities");
    assert.equal(unavailable.status, 502);

    globalThis.fetch = async (input) => {
      assert.match(
        String(input),
        /play\.myfly\.club\/api\/v5\.1\.2\/airports-static/,
      );
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
              features: [
                {
                  type: "ELITE_CHARM",
                  strength: 6,
                  title: "Elite Destination",
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
        ],
      });
    };

    const catalog = await request("/api/affinities");
    assert.equal(catalog.status, 200);
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
          affinities[index - 1].airportCount >= affinity.airportCount,
      ),
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

    const charmCatalog = await request("/api/charms");
    assert.equal(charmCatalog.status, 200);
    const charmCatalogBody = await charmCatalog.json();
    assert.equal(charmCatalogBody.charms[0].type, "ELITE_CHARM");

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

    const unknown = await request("/api/affinities?affinity=Not%20real");
    assert.equal(unknown.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
