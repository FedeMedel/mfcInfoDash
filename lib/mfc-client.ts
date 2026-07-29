const snapshotTtlMs = 24 * 60 * 60 * 1000;
const refreshRetryMs = 60 * 60 * 1000;
const snapshotTtlSeconds = snapshotTtlMs / 1000;

type CloudflareRequestInit = RequestInit & {
  cf?: {
    cacheEverything?: boolean;
    cacheTtl?: number;
  };
};

type Snapshot = {
  expiresAt: number;
  value: unknown;
};

const snapshots = new Map<string, Snapshot>();
const inFlightLoads = new Map<string, Promise<unknown>>();

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cf: {
      cacheEverything: true,
      cacheTtl: snapshotTtlSeconds,
    },
  } as CloudflareRequestInit);

  if (!response.ok) {
    throw new Error(`MFC returned ${response.status} for ${url}.`);
  }

  return response.json();
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

  const load = fetchJson(url)
    .then((rawValue) => {
      const value = parse(rawValue);
      snapshots.set(url, {
        expiresAt: Date.now() + snapshotTtlMs,
        value,
      });
      return value;
    })
    .catch((error) => {
      if (!snapshot) throw error;

      snapshots.set(url, {
        expiresAt: Date.now() + refreshRetryMs,
        value: snapshot.value,
      });
      return snapshot.value;
    })
    .finally(() => {
      inFlightLoads.delete(url);
    });

  inFlightLoads.set(url, load);
  return load as Promise<T>;
}
