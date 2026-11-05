import type { Job, JobView } from '../types';

export function toJobView(job: Job): JobView {
  const { titles, done, pool, failures, listed: _listed, ...rest } = job;
  return {
    ...rest,
    total: titles?.length ?? 0,
    processed: done?.length ?? 0,
    failed: Object.keys(failures ?? {}).length,
    uniqueCharacters: Object.keys(pool ?? {}).length,
    ratedFavoriteCounts: Object.values(pool ?? {}).map((c) => c.favorites ?? null),
    favoriteCounts: Object.values(pool ?? {}).flatMap((c) =>
      typeof c.favorites === 'number' ? [c.favorites] : []
    ),
    unknownFavorites: Object.values(pool ?? {}).filter((c) => typeof c.favorites !== 'number').length,
    failures: Object.entries(failures ?? {}).map(([key, message]) => ({
      title: titles?.find((t) => `${t.kind}:${t.id}` === key)?.name || key,
      message
    }))
  };
}

const DB_NAME = 'malgacha_db';
const DB_VERSION = 1;
const STORE_JOBS = 'jobs';
const STORE_META = 'meta';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_JOBS)) {
        db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persists a full Job object (including pool and team) into browser IndexedDB.
 */
export async function saveJobToClient(job: Job): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_JOBS], 'readwrite');
      const store = transaction.objectStore(STORE_JOBS);
      const request = store.put(job);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to save job to IndexedDB:', error);
  }
}

/**
 * Retrieves a Job object from browser IndexedDB by ID.
 */
export async function getJobFromClient(id: string): Promise<Job | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_JOBS], 'readonly');
      const store = transaction.objectStore(STORE_JOBS);
      const request = store.get(id);

      request.onsuccess = () => resolve((request.result as Job) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get job from IndexedDB:', error);
    return null;
  }
}

/**
 * Removes a Job object from browser IndexedDB.
 */
export async function deleteJobFromClient(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_JOBS], 'readwrite');
      const store = transaction.objectStore(STORE_JOBS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to delete job from IndexedDB:', error);
  }
}

/**
 * Saves a key-value pair in the metadata store (e.g. active journey ID).
 */
export async function setMeta(key: string, value: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_META], 'readwrite');
      const store = transaction.objectStore(STORE_META);
      const request = store.put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to set meta in IndexedDB:', error);
  }
}

/**
 * Retrieves a metadata value from IndexedDB.
 */
export async function getMeta(key: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_META], 'readonly');
      const store = transaction.objectStore(STORE_META);
      const request = store.get(key);

      request.onsuccess = () => resolve((request.result as string) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get meta from IndexedDB:', error);
    return null;
  }
}
