import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Версия 1: таблицы маркеров и фотографий.
 *
 * Схема из задания плюс:
 * - title — название места (было в задании 1, его можно менять);
 * - CHECK на координаты и путь — мусор не попадёт в базу даже при ошибке в коде;
 * - индекс по marker_id — фото места и подсчёт фото не перебирают всю таблицу.
 *
 * ON DELETE CASCADE удаляет фото вместе с маркером, но работает только при
 * PRAGMA foreign_keys = ON (включается при каждом открытии базы в schema.ts).
 */
export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE markers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
      longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE marker_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marker_id INTEGER NOT NULL,
      uri TEXT NOT NULL CHECK (length(uri) > 0),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (marker_id) REFERENCES markers (id) ON DELETE CASCADE
    );

    CREATE INDEX idx_marker_images_marker_id ON marker_images (marker_id);
  `);
}
