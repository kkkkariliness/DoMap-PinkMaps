import type { SQLiteDatabase } from 'expo-sqlite';

import { DatabaseError } from '@/database/errors';
import { withLogging } from '@/database/logger';
import * as initial from '@/database/migrations/001_initial';

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

/**
 * Все версии схемы по порядку. Новая версия — новый файл и новая строка здесь;
 * уже выпущенные миграции не меняются, иначе базы у пользователей разойдутся.
 */
const MIGRATIONS: Migration[] = [{ version: 1, up: initial.up }];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Доводит схему до последней версии.
 *
 * Номер версии хранится в самой базе (PRAGMA user_version, у новой базы он 0).
 * Каждая миграция идёт в своей транзакции вместе с записью нового номера:
 * если она упадёт, база откатится и останется на предыдущей версии, а не «наполовину».
 */
export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion > LATEST_VERSION) {
    // База создана более новой версией приложения — старый код может её испортить.
    throw new DatabaseError(
      'init',
      `Версия базы ${currentVersion} новее поддерживаемой ${LATEST_VERSION}`,
      { userMessage: 'База данных создана более новой версией приложения. Обновите приложение.' },
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }
    await withLogging(
      `migration v${migration.version}`,
      () =>
        db.withTransactionAsync(async () => {
          await migration.up(db);
          // PRAGMA не принимает параметры «?», но здесь число из нашего же кода.
          await db.execAsync(`PRAGMA user_version = ${migration.version}`);
        }),
      { inTransaction: true },
    );
  }
}
