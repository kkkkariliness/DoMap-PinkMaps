/**
 * Ошибки базы данных.
 *
 * SQLite сообщает об ошибках строкой вроде «FOREIGN KEY constraint failed».
 * Здесь такие строки превращаются в ошибку с понятным видом и текстом для пользователя,
 * чтобы экраны не разбирали тексты SQLite сами.
 */

export type DatabaseErrorKind =
  /** База не открылась или не прошла миграцию. */
  | 'init'
  /** Соединения нет, оно закрыто или база занята. */
  | 'connection'
  /** Нарушено ограничение схемы: внешний ключ, CHECK, NOT NULL. */
  | 'constraint'
  /** Сбой внутри транзакции — изменения откатились. */
  | 'transaction'
  | 'unknown';

const USER_MESSAGES: Record<DatabaseErrorKind, string> = {
  init: 'Не удалось открыть базу данных.',
  connection: 'Нет доступа к базе данных. Попробуйте ещё раз.',
  constraint: 'Данные не прошли проверку.',
  transaction: 'Не удалось сохранить изменения, они отменены.',
  unknown: 'Не удалось выполнить операцию с базой данных.',
};

export class DatabaseError extends Error {
  readonly kind: DatabaseErrorKind;
  /** Текст, который можно показать пользователю. */
  readonly userMessage: string;

  constructor(kind: DatabaseErrorKind, message: string, options?: { cause?: unknown; userMessage?: string }) {
    // cause — стандартное поле Error (Node 16.9+): хранит исходное исключение
    // и печатается в стеке. Экраны его не видят, но в логах видно, что было внизу.
    super(message, { cause: options?.cause });
    // Без этого name останется 'Error', и в логах наш класс будет неотличим от прочих.
    this.name = 'DatabaseError';
    this.kind = kind;
    this.userMessage = options?.userMessage ?? USER_MESSAGES[kind];
  }
}

// Единая точка извлечения текста: исключение может быть не Error (строкой, объектом),
// а для логов нужен именно текст.
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Приводит любую ошибку к DatabaseError.
 *
 * @param operation имя операции — попадает в текст ошибки для логов.
 * @param inTransaction ошибка случилась внутри транзакции, значит изменения откатились.
 */
export function toDatabaseError(error: unknown, operation: string, inTransaction = false): DatabaseError {
  // Уже наш класс — не оборачиваем повторно, иначе пользовательский текст потеряется.
  if (error instanceof DatabaseError) {
    return error;
  }

  // details — то, что увидит разработчик в логе: операция + оригинальный текст SQLite.
  // Пользователю уходит отдельно (userMessage), иначе он увидит «FOREIGN KEY...».
  const message = messageOf(error);
  const details = `${operation}: ${message}`;

  if (/FOREIGN KEY constraint failed/i.test(message)) {
    // Фото добавляют к месту, которое уже удалили.
    return new DatabaseError('constraint', details, {
      cause: error,
      userMessage: 'Место уже удалено.',
    });
  }
  if (/CHECK constraint failed/i.test(message)) {
    return new DatabaseError('constraint', details, {
      cause: error,
      userMessage: 'Некорректные данные: проверьте координаты и файл.',
    });
  }
  // Общий constraint (NOT NULL, UNIQUE и т. п.): специфического текста нет,
  // пользователю уходит дефолтное «Данные не прошли проверку».
  if (/constraint failed/i.test(message)) {
    return new DatabaseError('constraint', details, { cause: error });
  }
  // not open|closed — expo-sqlite шлёт их, когда соединение закрыли раньше операции
  // (например, экран размонтировался во время запроса). Это тот же класс проблемы,
  // что и «database is locked», поэтому и вид тот же — connection.
  if (/database is locked|unable to open|not open|closed|no such table/i.test(message)) {
    return new DatabaseError('connection', details, { cause: error });
  }
  // Всё остальное: внутри транзакции изменения уже откатились, значит вид — transaction;
  // вне транзакции причина неизвестна, помечаем unknown.
  return new DatabaseError(inTransaction ? 'transaction' : 'unknown', details, { cause: error });
}
