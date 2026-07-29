import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const airlineDataRoot =
  process.env.AIRLINE_DATA_DIR ??
  path.resolve(projectRoot, "..", "airline", "airline-data");

const countryLines = (
  await readFile(path.join(airlineDataRoot, "country-data.csv"), "utf8")
).split(/\r?\n/);
const overrideLines = (
  await readFile(path.join(airlineDataRoot, "population_override.csv"), "utf8")
).split(/\r?\n/);

const ginis = Object.fromEntries(
  countryLines
    .map((line) => line.split(","))
    .filter((tokens) => /^[A-Z]{2}$/.test(tokens[0] ?? ""))
    .map((tokens) => [tokens[0], Number(tokens[3]) || 39]),
);

const overrides = Object.fromEntries(
  overrideLines
    .map((line) => line.split(","))
    .filter((tokens) => (tokens[0] ?? "").length > 0)
    .map((tokens) => [
      tokens[0],
      {
        income: Number(tokens[2]) || 0,
        population: Number(tokens[4]) || 0,
        elites: Number(tokens[5]) || 0,
      },
    ]),
);

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "airline-data/country-data.csv + population_override.csv",
  },
  ginis,
  overrides,
};

await writeFile(
  path.join(projectRoot, "data", "demographic-source.json"),
  `${JSON.stringify(output)}\n`,
  "utf8",
);

console.log(
  `Generated demographic source with ${Object.keys(ginis).length} countries and ${Object.keys(overrides).length} overrides.`,
);
