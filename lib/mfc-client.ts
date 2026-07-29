const snapshotTtlMs = 24 * 60 * 60 * 1000;
const refreshRetryMs = 60 * 60 * 1000;
const persistentCacheTtlSeconds = 7 * 24 * 60 * 60;
const persistentCacheName = "mfc-info-snapshots-v1";
const defaultFetchTimeoutMs = 10_000;

type Snapshot = {
  expiresAt: number;
  value: unknown;
};

type PersistentSnapshot = {
  cachedAt: number;
  rawValue: unknown;
};

type ParsedPersistentSnapshot<T> = {
  cache: Cache;
  cachedAt: number;
  value: T;
};

const snapshots = new Map<string, Snapshot>();
const inFlightLoads = new Map<string, Promise<unknown>>();

function fetchTimeoutMs() {
  const configured = Number(process.env.MFC_FETCH_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 60_000)
    : defaultFetchTimeoutMs;
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs());

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`MFC returned ${response.status} for ${url}.`);
    }

    return response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`MFC timed out while loading ${url}.`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function openPersistentCache() {
  try {
    return typeof caches === "undefined"
      ? undefined
      : await caches.open(persistentCacheName);
  } catch {
    return undefined;
  }
}

async function readPersistentSnapshot<T>(
  url: string,
  parse: (value: unknown) => T,
): Promise<ParsedPersistentSnapshot<T> | undefined> {
  const cache = await openPersistentCache();
  if (!cache) return undefined;

  try {
    const response = await cache.match(url);
    if (!response?.ok) return undefined;

    const snapshot = (await response.json()) as PersistentSnapshot;
    if (
      !snapshot ||
      typeof snapshot.cachedAt !== "number" ||
      !Object.hasOwn(snapshot, "rawValue")
    ) {
      return undefined;
    }

    return {
      cache,
      cachedAt: snapshot.cachedAt,
      value: parse(snapshot.rawValue),
    };
  } catch {
    return undefined;
  }
}

async function writePersistentSnapshot(
  cache: Cache | undefined,
  url: string,
  snapshot: PersistentSnapshot,
) {
  const targetCache = cache ?? (await openPersistentCache());
  if (!targetCache) return;

  try {
    await targetCache.put(
      url,
      new Response(JSON.stringify(snapshot), {
        headers: {
          "Cache-Control": `public, max-age=${persistentCacheTtlSeconds}`,
          "Content-Type": "application/json",
        },
      }),
    );
  } catch {
    // The in-memory snapshot still keeps the current request healthy.
  }
}

export async function loadMfcJson<T>(
  url: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const now = Date.now();
  const snapshot = snapshots.get(url);

  if (snapshot && snapshot.expiresAt > now) {
    return snapshot.value as T;
  }

  const existingLoad = inFlightLoads.get(url);
  if (existingLoad) {
    return existingLoad as Promise<T>;
  }

  const load = (async () => {
    const persistent = await readPersistentSnapshot(url, parse);
    const persistentExpiresAt = persistent
      ? persistent.cachedAt + snapshotTtlMs
      : 0;

    if (persistent && persistentExpiresAt > Date.now()) {
      snapshots.set(url, {
        expiresAt: persistentExpiresAt,
        value: persistent.value,
      });
      return persistent.value;
    }

    try {
      const rawValue = await fetchJson(url);
      const value = parse(rawValue);
      const cachedAt = Date.now();

      snapshots.set(url, {
        expiresAt: cachedAt + snapshotTtlMs,
        value,
      });
      await writePersistentSnapshot(persistent?.cache, url, {
        cachedAt,
        rawValue,
      });
      return value;
    } catch (error) {
      const staleValue = snapshot?.value ?? persistent?.value;
      if (staleValue === undefined) throw error;

      snapshots.set(url, {
        expiresAt: Date.now() + refreshRetryMs,
        value: staleValue,
      });
      return staleValue as T;
    }
  })().finally(() => {
    inFlightLoads.delete(url);
  });

  inFlightLoads.set(url, load);
  return load;
}
