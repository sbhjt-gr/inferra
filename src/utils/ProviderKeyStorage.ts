import * as SQLite from 'expo-sqlite';

interface ProviderKeyRecord {
  provider: string;
  customKey: string | null;
  useDefault: number;
  modelName: string | null;
}

class ProviderKeyStorage {
  private db: SQLite.SQLiteDatabase | null = null;
  private dbName = 'app_settings.db';

  async initialize(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(this.dbName);
    await this.createTable();
  }

  private async createTable(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS api_keys (
        provider TEXT PRIMARY KEY,
        customKey TEXT,
        useDefault INTEGER,
        modelName TEXT
      );

      CREATE TABLE IF NOT EXISTS app_preferences (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  private getDatabase(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  async getEntry(provider: string): Promise<ProviderKeyRecord | null> {
    const db = this.getDatabase();
    const row = await db.getFirstAsync<ProviderKeyRecord>(
      'SELECT provider, customKey, useDefault, modelName FROM api_keys WHERE provider = ?',
      [provider]
    );

    if (!row) {
      return null;
    }

    return {
      provider: row.provider,
      customKey: row.customKey ?? null,
      useDefault: row.useDefault ?? 1,
      modelName: row.modelName ?? null,
    };
  }

  async upsertEntry(provider: string, updates: Partial<ProviderKeyRecord>): Promise<void> {
    const current = await this.getEntry(provider);
    const record: ProviderKeyRecord = {
      provider,
      customKey: updates.customKey !== undefined ? updates.customKey : current?.customKey ?? null,
      useDefault: updates.useDefault !== undefined ? updates.useDefault : current?.useDefault ?? 1,
      modelName: updates.modelName !== undefined ? updates.modelName : current?.modelName ?? null,
    };

    const db = this.getDatabase();
    await db.runAsync(
      'INSERT INTO api_keys (provider, customKey, useDefault, modelName) VALUES (?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET customKey=excluded.customKey, useDefault=excluded.useDefault, modelName=excluded.modelName',
      [record.provider, record.customKey, record.useDefault, record.modelName]
    );
  }

  async setPreference(key: string, value: string | null): Promise<void> {
    const db = this.getDatabase();
    if (value === null) {
      await db.runAsync('DELETE FROM app_preferences WHERE key = ?', [key]);
    } else {
      await db.runAsync(
        'INSERT OR REPLACE INTO app_preferences (key, value) VALUES (?, ?)',
        [key, value]
      );
    }
  }

  async getPreference(key: string): Promise<string | null> {
    const db = this.getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_preferences WHERE key = ?',
      [key]
    );
    return row?.value ?? null;
  }
}

export const providerKeyStorage = new ProviderKeyStorage();
export default providerKeyStorage;