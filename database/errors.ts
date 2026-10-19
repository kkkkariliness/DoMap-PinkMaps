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
    super(message, { cause: options?.cause });
    this.name = 'DatabaseError';
    this.kind = kind;
    this.userMessage = options?.userMessage ?? USER_MESSAGES[kind];
  }
}

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
  if (error instanceof DatabaseError) {
    return error;
  }

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
  if (/constraint failed/i.test(message)) {
    return new DatabaseError('constraint', details, { cause: error });
  }
  if (/database is locked|unable to open|not open|closed|no such table/i.test(message)) {
    return new DatabaseError('connection', details, { cause: error });
  }
  return new DatabaseError(inTransaction ? 'transaction' : 'unknown', details, { cause: error });
}
