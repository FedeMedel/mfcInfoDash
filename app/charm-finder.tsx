"use client";

import { useEffect, useState } from "react";

type CharmOption = {
  type: string;
  label: string;
  airportCount: number;
};

type CountryOption = {
  code: string;
  name: string;
};

type CharmAirport = {
  id: number;
  iata: string;
  name: string;
  city: string;
  countryCode: string;
  country: string;
  size: number;
  charmStrength: number;
};

type CharmCatalogResponse = {
  charms: CharmOption[];
  countries: CountryOption[];
};

type CharmResultsResponse = {
  charm: CharmOption;
  country: CountryOption | null;
  totalCount: number;
  count: number;
  airports: CharmAirport[];
};

export function CharmFinder() {
  const [charms, setCharms] = useState<CharmOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCharm, setSelectedCharm] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [results, setResults] = useState<CharmResultsResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadFilters() {
      try {
        const response = await fetch("/api/charms", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Charm filters are currently unavailable.");
        }

        const data = (await response.json()) as CharmCatalogResponse;
        setCharms(data.charms);
        setCountries(data.countries);
        setSelectedCharm(
          data.charms.find((charm) => charm.type === "ELITE_CHARM")?.type ??
            data.charms[0]?.type ??
            "",
        );
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError("Charm filters are currently unavailable. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }

    loadFilters();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedCharm) return;

    const controller = new AbortController();
    const parameters = new URLSearchParams({ charm: selectedCharm });
    if (selectedCountry) parameters.set("country", selectedCountry);

    async function loadResults() {
      setResultsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/charms?${parameters}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as
          | CharmResultsResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in data && data.error
              ? data.error
              : "Charm rankings are currently unavailable.",
          );
        }

        setResults(data as CharmResultsResponse);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setResults(null);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Charm rankings are currently unavailable.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setResultsLoading(false);
      }
    }

    loadResults();
    return () => controller.abort();
  }, [selectedCharm, selectedCountry]);

  return (
    <section className="dashboard" aria-labelledby="charms-title">
      <div className="intro">
        <h1 id="charms-title">Airport Charm Rankings</h1>
      </div>

      <div className="finder-form charm-filters">
        <div className="filter-field">
          <label htmlFor="charm">Charm</label>
          <select
            id="charm"
            value={selectedCharm}
            onChange={(event) => setSelectedCharm(event.target.value)}
            disabled={catalogLoading}
          >
            {catalogLoading ? <option>Loading charms…</option> : null}
            {charms.map((charm) => (
              <option key={charm.type} value={charm.type}>
                {charm.label} ({charm.airportCount})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="country">Country</label>
          <select
            id="country"
            value={selectedCountry}
            onChange={(event) => setSelectedCountry(event.target.value)}
            disabled={catalogLoading}
          >
            <option value="">All countries</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        <p className="field-help charm-filter-help">
          Rankings refresh automatically and show up to 200 active airports.
        </p>
        {error ? (
          <p className="form-error charm-filter-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <section className="results" aria-live="polite" aria-busy={resultsLoading}>
        <div className="results-header">
          <h2>
            {results
              ? `${results.charm.label}${
                  results.country ? ` in ${results.country.name}` : ""
                }`
              : "Top airports"}
          </h2>
          {results && !resultsLoading ? (
            <span className="result-count">
              Showing {results.count} of {results.totalCount}
            </span>
          ) : null}
        </div>

        {resultsLoading || catalogLoading ? (
          <div className="empty-state" role="status">
            <div>
              <div className="loading-line" aria-hidden="true" />
              <strong>Ranking active airports</strong>
              <p>Loading charm strength from the live MFC catalog.</p>
            </div>
          </div>
        ) : results && results.airports.length > 0 ? (
          <div className="table-scroll">
            <table className="airport-table charm-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">IATA</th>
                  <th scope="col">Airport</th>
                  <th scope="col">City</th>
                  <th scope="col">Country</th>
                  <th scope="col">Size</th>
                  <th scope="col">Strength</th>
                </tr>
              </thead>
              <tbody>
                {results.airports.map((airport, index) => (
                  <tr key={airport.id}>
                    <td className="rank-value">{index + 1}</td>
                    <td>
                      <span className="iata">{airport.iata}</span>
                    </td>
                    <td>
                      <span className="airport-name">{airport.name}</span>
                    </td>
                    <td>{airport.city}</td>
                    <td title={airport.countryCode}>{airport.country}</td>
                    <td>
                      <span className="size-value">{airport.size}</span>
                    </td>
                    <td>
                      <strong className="strength-value">
                        {airport.charmStrength}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <strong>No active airports found</strong>
              <p>No airports match this charm and country combination.</p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
