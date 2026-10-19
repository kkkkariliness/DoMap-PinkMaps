import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DatabaseError } from '@/database/errors';
import { withLogging } from '@/database/logger';
import { migrateDatabase } from '@/database/migrations';

/** Файл базы в папке приложения на телефоне. Сервер не нужен — это обычный файл. */
export const DATABASE_NAME = 'markers.db';

/**
 * Открывает базу и готовит её к работе.
 *
 * 1. WAL-журнал: чтение не ждёт записи, запись быстрее.
 * 2. foreign_keys = ON: SQLite по умолчанию не проверяет внешние ключи и не делает
 *    ON DELETE CASCADE. Настройка действует только на текущее соединение, поэтому
 *    включается при каждом открытии.
 * 3. Миграции до последней версии схемы.
 *
 * Любой сбой превращается в DatabaseError вида 'init'; открытое соединение при этом закрывается.
 */
export async function initDatabase(): Promise<SQLiteDatabase> {
  let db: SQLiteDatabase | null = null;
  try {
    db = await withLogging('open', () => openDatabaseAsync(DATABASE_NAME));
    const opened = db;

    await withLogging('pragmas', async () => {
      await opened.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const row = await opened.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
      if (row?.foreign_keys !== 1) {
        throw new Error('PRAGMA foreign_keys не включилась');
      }
    });

    await migrateDatabase(opened);
    return opened;
  } catch (error: unknown) {
    await db?.closeAsync().catch(() => undefined);
    if (error instanceof DatabaseError && error.kind === 'init') {
      throw error;
    }
    throw new DatabaseError(
      'init',
      `Инициализация базы: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
