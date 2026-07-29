# MFC Info

Simple dashboards for exploring live [My Fly Club](https://play.myfly.club/)
airport data.

## Dashboards

- **Trade Affinities** — select one trade affinity and list all matching active
  airports.
- **Airport Charms** — rank up to 200 airports by charm strength, with optional
  country filtering.
- **Population & Elites** — rank up to 200 airports by population or elite
  population, with optional country filtering.

The UI is in English and intentionally uses a compact, table-first design.

## Data sources

- The live airport catalog and dynamic boosts come from `play.myfly.club`.
- Trade affinity definitions are generated from the adjacent `airline` source
  repository.
- Country Gini values and population overrides are versioned as a compact
  generated index so elite rankings can reproduce the game's calculation.

Generated runtime indexes are committed under `data/`. Their source generators
live under `scripts/`.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm test
npm run data:generate
npm run data:demographics
```

`data:generate` and `data:demographics` expect the `airline` repository to be
available next to this repository unless `AIRLINE_DATA_DIR` is provided.

## Configuration

The live MFC endpoint defaults to:

- Base URL: `https://play.myfly.club`
- API version: `v5.1.2`

Override them with `MFC_API_BASE` and `MFC_API_VERSION`.

`.openai/hosting.json` is intentionally versioned. It contains the Sites project
association and non-secret binding declarations; environment values and
credentials must not be stored there.
