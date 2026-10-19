import type { SQLiteDatabase } from 'expo-sqlite';

import { DatabaseError } from '@/database/errors';
import { withLogging } from '@/database/logger';
import * as initial from '@/database/migrations/001_initial';

interface Migration {
  version: number;
  // Только «вперёд»: откатов нет. Если миграция сломалась — база откатится
  // транзакцией и останется на предыдущей версии, чинить нужно код.
  up: (db: SQLiteDatabase) => Promise<void>;
}

/**
 * Все версии схемы по порядку. Новая версия — новый файл и новая строка здесь;
 * уже выпущенные миграции не меняются, иначе базы у пользователей разойдутся.
 */
const MIGRATIONS: Migration[] = [{ version: 1, up: initial.up }];

// Последняя версия схемы. По ней проверяется «база из будущего»:
// если в базе номер больше — приложение старое и трогать её нельзя.
export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Доводит схему до последней версии.
 *
 * Номер версии хранится в самой базе (PRAGMA user_version, у новой базы он 0).
 * Каждая миграция идёт в своей транзакции вместе с записью нового номера:
 * если она упадёт, база откатится и останется на предыдущей версии, а не «наполовину».
 */
export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  // PRAGMA user_version —служебное поле заголовка базы.
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion > LATEST_VERSION) {
    // База создана более новой версией приложения — старый код может её испортить.
    // Останавливаемся до любых изменений, чтобы не испортить данные пользователя.
    throw new DatabaseError(
      'init',
      `Версия базы ${currentVersion} новее поддерживаемой ${LATEST_VERSION}`,
      { userMessage: 'База данных создана более новой версией приложения. Обновите приложение.' },
    );
  }

  // Идём по всем миграциям по порядку и применяем только те, что новее текущей.
  // Условие <= currentVersion, а не < — так пропускаются уже применённые.
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }
    await withLogging(
      `migration v${migration.version}`,
      () =>
        // Транзакция охватывает и саму миграцию, и запись новой версии:
        // нельзя оказаться в состоянии «схема новая, а номер старый» (или наоборот).
        db.withTransactionAsync(async () => {
          await migration.up(db);
          // PRAGMA не принимает параметры «?», но здесь число из нашего же кода.
          await db.execAsync(`PRAGMA user_version = ${migration.version}`);
        }),
      { inTransaction: true },
    );
  }
}
