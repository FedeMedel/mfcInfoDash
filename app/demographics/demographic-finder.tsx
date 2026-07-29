"use client";

import { useEffect, useMemo, useState } from "react";

type MetricOption = {
  key: "population" | "elites";
  label: string;
};

type CountryOption = {
  code: string;
  name: string;
};

type DemographicAirport = {
  id: number;
  iata: string;
  name: string;
  city: string;
  countryCode: string;
  country: string;
  size: number;
  population: number;
  elites: number;
};

type DemographicCatalogResponse = {
  metrics: MetricOption[];
  countries: CountryOption[];
};

type DemographicResultsResponse = {
  metric: MetricOption;
  country: CountryOption | null;
  totalCount: number;
  count: number;
  airports: DemographicAirport[];
};

const numberFormatter = new Intl.NumberFormat("en");

export function DemographicFinder() {
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedMetric, setSelectedMetric] =
    useState<MetricOption["key"]>("population");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [results, setResults] =
    useState<DemographicResultsResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadFilters() {
      try {
        const response = await fetch("/api/demographics", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Demographic filters are currently unavailable.");
        }

        const data = (await response.json()) as DemographicCatalogResponse;
        setMetrics(data.metrics);
        setCountries(data.countries);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError(
            "Demographic filters are currently unavailable. Please try again.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }

    loadFilters();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (catalogLoading) return;

    const controller = new AbortController();
    const parameters = new URLSearchParams({ metric: selectedMetric });
    if (selectedCountry) parameters.set("country", selectedCountry);

    async function loadResults() {
      setResultsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/demographics?${parameters}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as
          | DemographicResultsResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in data && data.error
              ? data.error
              : "Demographic rankings are currently unavailable.",
          );
        }

        setResults(data as DemographicResultsResponse);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setResults(null);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Demographic rankings are currently unavailable.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setResultsLoading(false);
      }
    }

    loadResults();
    return () => controller.abort();
  }, [catalogLoading, selectedCountry, selectedMetric]);

  const metricLabel = useMemo(
    () =>
      metrics.find(({ key }) => key === selectedMetric)?.label ??
      (selectedMetric === "population" ? "Population" : "Elites"),
    [metrics, selectedMetric],
  );

  return (
    <section className="dashboard" aria-labelledby="demographics-title">
      <div className="intro">
        <h1 id="demographics-title">Population &amp; Elite Rankings</h1>
      </div>

      <div className="finder-form charm-filters">
        <div className="filter-field">
          <label htmlFor="metric">Ranking</label>
          <select
            id="metric"
            value={selectedMetric}
            onChange={(event) =>
              setSelectedMetric(event.target.value as MetricOption["key"])
            }
            disabled={catalogLoading}
          >
            {metrics.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {metric.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="demographic-country">Country</label>
          <select
            id="demographic-country"
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
              ? `${results.metric.label}${
                  results.country ? ` in ${results.country.name}` : ""
                }`
              : metricLabel}
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
              <p>Loading population and elite data from MFC.</p>
            </div>
          </div>
        ) : results && results.airports.length > 0 ? (
          <div className="table-scroll">
            <table className="airport-table demographic-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">IATA</th>
                  <th scope="col">Airport</th>
                  <th scope="col">City</th>
                  <th scope="col">Country</th>
                  <th scope="col">Size</th>
                  <th scope="col">Population</th>
                  <th scope="col">Elites</th>
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
                    <td className="demographic-value">
                      {numberFormatter.format(airport.population)}
                    </td>
                    <td className="demographic-value">
                      {numberFormatter.format(airport.elites)}
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
              <p>No airports match this ranking and country combination.</p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
