"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

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
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

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

  const filteredAffinities = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("en");
    const isCurrentSelection =
      selectedAffinity.toLocaleLowerCase("en") === query;

    if (!query || isCurrentSelection) return affinities;

    return affinities.filter((affinity) =>
      affinity.name.toLocaleLowerCase("en").includes(query),
    );
  }, [affinities, selectedAffinity, value]);

  useEffect(() => {
    if (isOpen) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  useEffect(() => {
    const canonicalName = canonicalNames.get(
      value.trim().toLocaleLowerCase("en"),
    );

    if (!canonicalName || canonicalName === selectedAffinity) return;
    const resolvedName = canonicalName;

    const controller = new AbortController();

    async function loadAirports() {
      setError("");
      setResultsLoading(true);
      setHasSearched(true);

      try {
        const response = await fetch(
          `/api/affinities?affinity=${encodeURIComponent(resolvedName)}`,
          { signal: controller.signal },
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
        if ((requestError as Error).name !== "AbortError") {
          setAirports([]);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Airport results are currently unavailable.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setResultsLoading(false);
        }
      }
    }

    loadAirports();
    return () => controller.abort();
  }, [canonicalNames, selectedAffinity, value]);

  function selectAffinity(name: string) {
    setValue(name);
    setError("");
    setIsOpen(false);
  }

  function handleComboboxKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) =>
        isOpen
          ? Math.min(index + 1, filteredAffinities.length - 1)
          : 0,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) =>
        isOpen ? Math.max(index - 1, 0) : 0,
      );
    } else if (
      event.key === "Enter" &&
      isOpen &&
      filteredAffinities[activeIndex]
    ) {
      event.preventDefault();
      selectAffinity(filteredAffinities[activeIndex].name);
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="intro">
        <h1 id="dashboard-title">Trade Affinity Finder</h1>
      </div>

      <div className="finder-form">
        <label htmlFor="affinity">Trade affinity</label>
        <div className="affinity-combobox">
          <div className="affinity-input-shell">
            <input
              id="affinity"
              name="affinity"
              role="combobox"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setActiveIndex(0);
                setIsOpen(true);
                if (error) setError("");
              }}
              onFocus={() => {
                setActiveIndex(0);
                setIsOpen(true);
              }}
              onBlur={() => setIsOpen(false)}
              onKeyDown={handleComboboxKeyDown}
              placeholder={
                catalogLoading
                  ? "Loading affinities…"
                  : "Start typing, for example: Investment banking"
              }
              autoComplete="off"
              disabled={catalogLoading}
              aria-autocomplete="list"
              aria-controls="affinity-options"
              aria-expanded={isOpen}
              aria-activedescendant={
                isOpen && filteredAffinities[activeIndex]
                  ? `affinity-option-${activeIndex}`
                  : undefined
              }
              aria-describedby={error ? "affinity-error" : "affinity-help"}
              aria-invalid={Boolean(error)}
            />
            <button
              className="combobox-toggle"
              type="button"
              aria-label={isOpen ? "Close affinity options" : "Open affinity options"}
              aria-expanded={isOpen}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setIsOpen((open) => !open)}
              disabled={catalogLoading}
            >
              <span aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
            </button>
          </div>

          {isOpen && !catalogLoading ? (
            <ul
              className="affinity-options"
              id="affinity-options"
              role="listbox"
              aria-label="Trade affinities"
            >
              {filteredAffinities.length > 0 ? (
                filteredAffinities.map((affinity, index) => (
                  <li
                    className={`affinity-option${
                      index === activeIndex ? " active" : ""
                    }`}
                    id={`affinity-option-${index}`}
                    key={affinity.name}
                    role="option"
                    aria-selected={affinity.name === selectedAffinity}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectAffinity(affinity.name);
                    }}
                  >
                    <span>{affinity.name}</span>
                    <small>
                      {affinity.airportCount}{" "}
                      {affinity.airportCount === 1 ? "airport" : "airports"}
                    </small>
                  </li>
                ))
              ) : (
                <li className="affinity-no-results">No affinities found</li>
              )}
            </ul>
          ) : null}
        </div>
        {error ? (
          <p className="form-error" id="affinity-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="field-help" id="affinity-help">
            Select one affinity to refresh the list automatically. Options are
            ordered by active airport count.
          </p>
        )}
      </div>

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
