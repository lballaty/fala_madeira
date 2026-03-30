import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'FalaMadeiraAudioCache';
const STORE_NAME = 'audio';

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
};

export const audioCache = {
  async get(key: string): Promise<ArrayBuffer | null> {
    const db = await getDB();
    return db.get(STORE_NAME, key);
  },

  async set(key: string, data: ArrayBuffer): Promise<void> {
    const db = await getDB();
    await db.put(STORE_NAME, data, key);
  },

  async clear(): Promise<void> {
    const db = await getDB();
    await db.clear(STORE_NAME);
  }
};
