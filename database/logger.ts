import { toDatabaseError } from '@/database/errors';

/**
 * Обёртка для каждой операции с базой.
 *
 * В режиме разработки пишет в консоль имя операции и время выполнения,
 * а любую ошибку превращает в DatabaseError — дальше по коду другие ошибки не уходят.
 * В релизной сборке (__DEV__ === false) логов нет.
 */
export async function withLogging<T>(
  operation: string,
  task: () => Promise<T>,
  options: { inTransaction?: boolean } = {},
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await task();
    if (__DEV__) {
      console.log(`[db] ${operation} — ${Date.now() - startedAt} мс`);
    }
    return result;
  } catch (error: unknown) {
    const dbError = toDatabaseError(error, operation, options.inTransaction);
    if (__DEV__) {
      console.warn(`[db] ${operation} — ошибка (${dbError.kind})`, dbError.message);
    }
    throw dbError;
  }
}
