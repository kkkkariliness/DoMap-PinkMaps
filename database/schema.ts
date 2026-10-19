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
  // db объявлен снаружи try: нужен в catch, чтобы закрыть соединение,
  // если оно успело открыться до сбоя на PRAGMA или миграции.
  let db: SQLiteDatabase | null = null;
  try {
    db = await withLogging('open', () => openDatabaseAsync(DATABASE_NAME));
    // Копия в локальную переменную: TypeScript не сужает тип после await,
    // а в замыканиях ниже нужен гарантированно не-null opened.
    const opened = db;

    await withLogging('pragmas', async () => {
      // Обе PRAGMA в одном exec — одна настройка соединения, одна операция в логах.
      await opened.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      // SQLite не сообщает об ошибке, если foreign_keys не включилась (например,
      // из-за ограничений сборки). Проверяем явно: без каскада удаление фото
      // и связность данных молча сломаются.
      const row = await opened.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
      if (row?.foreign_keys !== 1) {
        throw new Error('PRAGMA foreign_keys не включилась');
      }
    });

    await migrateDatabase(opened);
    return opened;
  } catch (error: unknown) {
    // Что бы ни упало — open, PRAGMA или миграция, — соединение уже открыто
    // и утечёт, если его не закрыть. Ошибку закрытия глотаем: главная ошибка
    // уже летит выше, и подменять её на «не удалось закрыть» бессмысленно.
    await db?.closeAsync().catch(() => undefined);
    // Уже наш DatabaseError вида init (например, из migrateDatabase про базу
    // от новой версии) — не оборачиваем повторно, чтобы сохранить точный userMessage.
    if (error instanceof DatabaseError && error.kind === 'init') {
      throw error;
    }
    // Всё остальное (open, PRAGMA, случайные сбои) превращаем в 'init' —
    // экран покажет одно сообщение «Не удалось открыть базу данных» с «Повторить».
    throw new DatabaseError(
      'init',
      `Инициализация базы: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}