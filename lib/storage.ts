// Классический API файлов. В SDK 57 основной импорт 'expo-file-system' — новый объектный API,
// а documentDirectory, copyAsync и остальные функции ниже лежат в '/legacy'.
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Файлы фотографий. Сами записи о фото живут в базе (database/), а здесь — только файлы на диске.
 */

/** Папка, куда копируются выбранные фотографии. */
const IMAGES_DIRECTORY = `${FileSystem.documentDirectory}marker-images/`;

/** Короткий уникальный идентификатор для имени файла. */
function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Копирует выбранное фото в папку приложения.
 *
 * Выбор изображения отдаёт файл во временной папке, которую система может очистить
 * в любой момент. Своя копия переживает перезапуск телефона.
 */
export async function persistImageFile(sourceUri: string): Promise<string> {
  const directory = await FileSystem.getInfoAsync(IMAGES_DIRECTORY);
  if (!directory.exists) {
    await FileSystem.makeDirectoryAsync(IMAGES_DIRECTORY, { intermediates: true });
  }

  // Расширение берём из исходного имени, иначе картинка может не открыться.
  const extension = sourceUri.split('.').pop()?.split('?')[0] ?? 'jpg';
  const targetUri = `${IMAGES_DIRECTORY}${createId()}.${extension}`;

  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

/** Удаляет файл фотографии. Отсутствующий файл — не ошибка. */
export async function deleteImageFile(uri: string): Promise<void> {
  if (!uri.startsWith(IMAGES_DIRECTORY)) {
    // Чужие файлы (например, оставшиеся от старых версий) не трогаем.
    return;
  }
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
