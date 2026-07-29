"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AffinityOption = {
  name: string;
  airportCount: number;
};

type Airport = {
  id: number;
  iata: string;
  name: string;
  city: string;
  countryCode: string;
  country: string;
  size: number;
};

type AffinityCatalogResponse = {
  affinities: AffinityOption[];
};

type AffinityResultsResponse = {
  affinity: string;
  count: number;
  airports: Airport[];
};

export function AffinityFinder() {
  const [affinities, setAffinities] = useState<AffinityOption[]>([]);
  const [value, setValue] = useState("");
  const [selectedAffinity, setSelectedAffinity] = useState("");
  const [airports, setAirports] = useState<Airport[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAffinities() {
      try {
        const response = await fetch("/api/affinities", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("The affinity catalog is currently unavailable.");
        }
        const data = (await response.json()) as AffinityCatalogResponse;
        setAffinities(data.affinities);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError(
            "The affinity catalog is currently unavailable. Please try again.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCatalogLoading(false);
        }
      }
    }

    loadAffinities();
    return () => controller.abort();
  }, []);

  const canonicalNames = useMemo(
    () =>
      new Map(
        affinities.map((affinity) => [
          affinity.name.toLocaleLowerCase("en"),
          affinity.name,
        ]),
      ),
    [affinities],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const canonicalName = canonicalNames.get(
      value.trim().toLocaleLowerCase("en"),
    );

    if (!canonicalName) {
      setError("Choose one trade affinity from the suggestions.");
      return;
    }

    setError("");
    setResultsLoading(true);
    setHasSearched(true);

    try {
      const response = await fetch(
        `/api/affinities?affinity=${encodeURIComponent(canonicalName)}`,
      );
      const data = (await response.json()) as
        | AffinityResultsResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Airport results are currently unavailable.",
        );
      }

      const results = data as AffinityResultsResponse;
      setSelectedAffinity(results.affinity);
      setValue(results.affinity);
      setAirports(results.airports);
    } catch (requestError) {
      setAirports([]);
      setSelectedAffinity(canonicalName);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Airport results are currently unavailable.",
      );
    } finally {
      setResultsLoading(false);
    }
  }

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="intro">
        <p className="eyebrow">Trade affinity finder</p>
        <h1 id="dashboard-title">Find airports by commercial affinity</h1>
        <p>
          Select one trade affinity to see every active MFC airport connected to
          that industry or commercial ecosystem.
        </p>
      </div>

      <form className="finder-form" onSubmit={submit}>
        <label htmlFor="affinity">Trade affinity</label>
        <div className="field-row">
          <input
            id="affinity"
            name="affinity"
            list="affinity-options"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError("");
            }}
            placeholder={
              catalogLoading
                ? "Loading affinities…"
                : "Start typing, for example: Investment banking"
            }
            autoComplete="off"
            disabled={catalogLoading}
            aria-describedby={error ? "affinity-error" : "affinity-help"}
            aria-invalid={Boolean(error)}
          />
          <datalist id="affinity-options">
            {affinities.map((affinity) => (
              <option key={affinity.name} value={affinity.name}>
                {affinity.airportCount} airports
              </option>
            ))}
          </datalist>
          <button
            className="primary-button"
            type="submit"
            disabled={catalogLoading || resultsLoading}
          >
            {resultsLoading ? "Searching…" : "Find airports"}
          </button>
        </div>
        {error ? (
          <p className="form-error" id="affinity-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="field-help" id="affinity-help">
            One affinity at a time. Results use the live MFC airport catalog.
          </p>
        )}
      </form>

      <section className="results" aria-live="polite" aria-busy={resultsLoading}>
        <div className="results-header">
          <h2>
            {selectedAffinity
              ? `Airports for ${selectedAffinity}`
              : "Airport results"}
          </h2>
          {hasSearched && !resultsLoading && !error ? (
            <span className="result-count">
              {airports.length} {airports.length === 1 ? "airport" : "airports"}
            </span>
          ) : null}
        </div>

        {resultsLoading ? (
          <div className="empty-state" role="status">
            <div>
              <div className="loading-line" aria-hidden="true" />
              <strong>Matching active airports</strong>
              <p>Checking the selected affinity against the live MFC catalog.</p>
            </div>
          </div>
        ) : airports.length > 0 ? (
          <div className="table-scroll">
            <table className="airport-table">
              <thead>
                <tr>
                  <th scope="col">IATA</th>
                  <th scope="col">Airport</th>
                  <th scope="col">City</th>
                  <th scope="col">Country</th>
                  <th scope="col">Size</th>
                </tr>
              </thead>
              <tbody>
                {airports.map((airport) => (
                  <tr key={airport.id}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div>
              <strong>
                {hasSearched && !error
                  ? "No active airports found"
                  : "Choose a trade affinity"}
              </strong>
              <p>
                {hasSearched && !error
                  ? "The affinity exists in the source data, but no matching airports are active in the current MFC catalog."
                  : "Use the searchable field above to select one affinity and load its airport list."}
              </p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
