import type { SQLiteDatabase } from 'expo-sqlite';

import { DatabaseError } from '@/database/errors';
import { withLogging } from '@/database/logger';
import type { MapMarker, MarkerImage } from '@/types';

/**
 * Все запросы приложения к базе. Функции ничего не знают о React:
 * получают соединение, выполняют SQL, возвращают данные в формате types.ts.
 * Значения всегда передаются параметрами «?» — никакой склейки SQL из строк.
 */

interface MarkerRow {
  id: number;
  title: string;
  latitude: number;
  longitude: number;
  created_at: string | null;
  image_count: number;
  preview_uri: string | null;
}

interface ImageRow {
  id: number;
  marker_id: number;
  uri: string;
  created_at: string | null;
}

/** CURRENT_TIMESTAMP в SQLite — строка 'YYYY-MM-DD HH:MM:SS' в UTC. */
function parseTimestamp(value: string | null): number {
  if (!value) {
    return 0;
  }
  const ms = Date.parse(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? 0 : ms;
}

function toMarker(row: MarkerRow): MapMarker {
  return {
    id: row.id,
    title: row.title,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: parseTimestamp(row.created_at),
    imageCount: row.image_count,
    previewUri: row.preview_uri,
  };
}

function toImage(row: ImageRow): MarkerImage {
  return {
    id: row.id,
    markerId: row.marker_id,
    uri: row.uri,
    createdAt: parseTimestamp(row.created_at),
  };
}

/**
 * Выполняет задачу в транзакции: всё или ничего. Ошибка внутри — откат.
 *
 * Используется withTransactionAsync, а не withExclusiveTransactionAsync: эксклюзивная
 * транзакция учитывает только запросы через объект txn, а здесь запросы идут через db.
 * Чтобы посторонние запросы не вклинились в транзакцию, DatabaseContext выполняет
 * все операции строго по очереди.
 */
async function inTransaction<T>(db: SQLiteDatabase, task: () => Promise<T>): Promise<T> {
  let result: T | undefined;
  await db.withTransactionAsync(async () => {
    result = await task();
  });
  return result as T;
}

// ---------- Маркеры ----------

export function insertMarker(
  db: SQLiteDatabase,
  latitude: number,
  longitude: number,
  title: string,
): Promise<number> {
  return withLogging('addMarker', async () => {
    const result = await db.runAsync(
      'INSERT INTO markers (title, latitude, longitude) VALUES (?, ?, ?)',
      title,
      latitude,
      longitude,
    );
    return result.lastInsertRowId;
  });
}

export function updateMarkerTitle(db: SQLiteDatabase, id: number, title: string): Promise<void> {
  return withLogging('renameMarker', async () => {
    const result = await db.runAsync('UPDATE markers SET title = ? WHERE id = ?', title, id);
    if (result.changes === 0) {
      throw new DatabaseError('constraint', `renameMarker: маркера ${id} нет`, {
        userMessage: 'Место уже удалено.',
      });
    }
  });
}

/**
 * Удаляет маркер; его фото удаляет сам SQLite (ON DELETE CASCADE).
 *
 * Затрагивает обе таблицы, поэтому идёт в транзакции: пути файлов читаются и строки
 * удаляются как одно целое, и фото, добавленное «между», не останется без файла.
 *
 * @returns пути файлов удалённых фото — их нужно стереть с диска.
 */
export function deleteMarker(db: SQLiteDatabase, id: number): Promise<string[]> {
  return withLogging(
    'deleteMarker',
    () =>
      inTransaction(db, async () => {
        const images = await db.getAllAsync<{ uri: string }>(
          'SELECT uri FROM marker_images WHERE marker_id = ?',
          id,
        );
        await db.runAsync('DELETE FROM markers WHERE id = ?', id);
        return images.map((image) => image.uri);
      }),
    { inTransaction: true },
  );
}

/** Все маркеры, новые сверху, с количеством фото и последним фото для превью. */
export function selectMarkers(db: SQLiteDatabase): Promise<MapMarker[]> {
  return withLogging('getMarkers', async () => {
    const rows = await db.getAllAsync<MarkerRow>(`
      SELECT
        m.id, m.title, m.latitude, m.longitude, m.created_at,
        (SELECT COUNT(*) FROM marker_images i WHERE i.marker_id = m.id) AS image_count,
        (SELECT i.uri FROM marker_images i WHERE i.marker_id = m.id
          ORDER BY i.id DESC LIMIT 1) AS preview_uri
      FROM markers m
      ORDER BY m.id DESC
    `);
    return rows.map(toMarker);
  });
}

// ---------- Фотографии ----------

/** Внешний ключ не даст привязать фото к несуществующему маркеру — будет ошибка 'constraint'. */
export function insertImage(db: SQLiteDatabase, markerId: number, uri: string): Promise<number> {
  return withLogging('addImage', async () => {
    const result = await db.runAsync(
      'INSERT INTO marker_images (marker_id, uri) VALUES (?, ?)',
      markerId,
      uri,
    );
    return result.lastInsertRowId;
  });
}

/** @returns путь файла удалённого фото или null, если такой строки уже не было. */
export function deleteImage(db: SQLiteDatabase, id: number): Promise<string | null> {
  return withLogging(
    'deleteImage',
    () =>
      inTransaction(db, async () => {
        const row = await db.getFirstAsync<{ uri: string }>(
          'SELECT uri FROM marker_images WHERE id = ?',
          id,
        );
        await db.runAsync('DELETE FROM marker_images WHERE id = ?', id);
        return row?.uri ?? null;
      }),
    { inTransaction: true },
  );
}

/** Фото одного маркера, новые первыми. */
export function selectMarkerImages(db: SQLiteDatabase, markerId: number): Promise<MarkerImage[]> {
  return withLogging('getMarkerImages', async () => {
    const rows = await db.getAllAsync<ImageRow>(
      'SELECT id, marker_id, uri, created_at FROM marker_images WHERE marker_id = ? ORDER BY id DESC',
      markerId,
    );
    return rows.map(toImage);
  });
}
