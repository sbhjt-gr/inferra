import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

let databasePromise: Promise<SQLiteDatabase> | null = null;

const ensureDatabase = async (): Promise<SQLiteDatabase> => {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await openDatabaseAsync('inferra_chat_history.db');
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY NOT NULL, title TEXT, messages TEXT NOT NULL, timestamp INTEGER NOT NULL, modelPath TEXT)'
      );
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT)'
      );
      return db;
    })();
  }
  return databasePromise;
};

export const withDatabase = async <T>(action: (db: SQLiteDatabase) => Promise<T>): Promise<T> => {
  const db = await ensureDatabase();
  return action(db);
};

export const resetDatabasePromise = () => {
  databasePromise = null;
};
