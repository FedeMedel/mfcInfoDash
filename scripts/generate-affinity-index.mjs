import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
}

export function isTradeAffinity(value) {
  const affinity = value.trim();
  return (
    affinity.length > 0 &&
    affinity !== "None" &&
    affinity !== "None|" &&
    !affinity.startsWith("|") &&
    !affinity.endsWith("|")
  );
}

function zoneParts(values) {
  return values
    .filter(Boolean)
    .join("-")
    .split("-")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function csvRows(path) {
  const content = await readFile(path, "utf8");
  return content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(parseCsvLine);
}

function sourceCommit(dataDirectory) {
  const repositoryDirectory = resolve(dataDirectory, "..");
  try {
    return execFileSync(
      "git",
      [
        "-c",
        `safe.directory=${repositoryDirectory.replaceAll("\\", "/")}`,
        "-C",
        repositoryDirectory,
        "rev-parse",
        "HEAD",
      ],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "unknown";
  }
}

async function apiVersion(dataDirectory) {
  const packageSource = await readFile(
    resolve(
      dataDirectory,
      "..",
      "airline-web",
      "app",
      "controllers",
      "package.scala",
    ),
    "utf8",
  );
  return (
    packageSource.match(/currentApiVersion\s*=\s*"([^"]+)"/)?.[1] ?? "v5.1.2"
  );
}

export async function generateAffinityIndex({ dataDirectory, outputPath }) {
  const [countryRows, patchRows, airportRows, additionalRows] =
    await Promise.all([
      csvRows(resolve(dataDirectory, "country-data.csv")),
      csvRows(resolve(dataDirectory, "affinity-patch-list.csv")),
      csvRows(resolve(dataDirectory, "airports.csv")),
      csvRows(resolve(dataDirectory, "additional-airports.csv")),
    ]);

  const countryAffinities = new Map(
    countryRows.map((row) => [row[0], zoneParts(row.slice(5, 9))]),
  );

  const airportPatches = new Map();
  for (const [iata, affinity] of patchRows) {
    const current = airportPatches.get(iata) ?? [];
    current.push(affinity);
    airportPatches.set(iata, current);
  }

  const affinities = new Map();
  const canonicalByKey = new Map();
  function addAirport(iata, rawAffinities) {
    for (const affinity of zoneParts(rawAffinities).filter(isTradeAffinity)) {
      const normalizedKey = affinity.toLocaleLowerCase("en");
      const canonicalAffinity =
        canonicalByKey.get(normalizedKey) ?? affinity;
      canonicalByKey.set(normalizedKey, canonicalAffinity);
      const airports = affinities.get(canonicalAffinity) ?? new Set();
      airports.add(iata);
      affinities.set(canonicalAffinity, airports);
    }
  }

  for (const row of airportRows) {
    const iata = row[13];
    const countryCode = row[8];
    const scheduledService = row[11] === "yes";
    if (!iata || !scheduledService) continue;

    addAirport(iata, [
      ...(countryAffinities.get(countryCode) ?? []),
      ...(airportPatches.get(iata) ?? []),
    ]);
  }

  for (const row of additionalRows) {
    const iata = row[0];
    const zone = row[7];
    if (iata && zone) addAirport(iata, [zone]);
  }

  const sortedAffinities = Object.fromEntries(
    [...affinities.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([affinity, airports]) => [
        affinity,
        [...airports].sort((left, right) => left.localeCompare(right, "en")),
      ]),
  );

  const document = {
    meta: {
      sourceCommit: sourceCommit(dataDirectory),
      generatedAt: new Date().toISOString(),
      apiVersion: await apiVersion(dataDirectory),
      affinityCount: Object.keys(sortedAffinities).length,
      mappingCount: Object.values(sortedAffinities).reduce(
        (total, airportCodes) => total + airportCodes.length,
        0,
      ),
    },
    affinities: sortedAffinities,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return document;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dataDirectory = resolve(
    process.env.AIRLINE_DATA_DIR ?? "../airline/airline-data",
  );
  const outputPath = resolve("data/trade-affinities.json");
  const document = await generateAffinityIndex({ dataDirectory, outputPath });
  process.stdout.write(
    `Generated ${document.meta.affinityCount} affinities and ${document.meta.mappingCount} airport mappings.\n`,
  );
}
