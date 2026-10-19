import type { SQLiteDatabase } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { DatabaseError, toDatabaseError } from '@/database/errors';
import * as operations from '@/database/operations';
import { initDatabase } from '@/database/schema';
import { deleteImageFile, persistImageFile } from '@/lib/storage';
import type { MapMarker, MarkerImage } from '@/types';

const DEFAULT_TITLE = 'Новое место';

export interface DatabaseContextType {
  // Операции с базой данных
  addMarker: (latitude: number, longitude: number, title?: string) => Promise<number>;
  deleteMarker: (id: number) => Promise<void>;
  getMarkers: () => Promise<MapMarker[]>;
  addImage: (markerId: number, uri: string) => Promise<void>;
  deleteImage: (id: number) => Promise<void>;
  getMarkerImages: (markerId: number) => Promise<MarkerImage[]>;
  renameMarker: (id: number, title: string) => Promise<void>;

  /** Последний прочитанный список маркеров — его показывают карта и вкладка «Места». */
  markers: MapMarker[];
  /** Растёт после каждого изменения — по нему экраны понимают, что данные надо перечитать. */
  revision: number;

  // Статусы
  /** true, пока база открывается и читается первый раз. */
  isLoading: boolean;
  /** Ошибка открытия базы или потери соединения. Ошибки отдельных операций бросаются вызывающему. */
  error: DatabaseError | null;
  /** Открыть базу заново после ошибки. */
  retry: () => void;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

function logFileError(error: unknown) {
  console.warn('Не удалось удалить файл фотографии', error);
}

/**
 * Единственная точка доступа к базе на всё приложение.
 *
 * Провайдер открывает соединение, держит его, пока приложение открыто, и закрывает
 * при размонтировании. Экраны не видят SQL — только методы из контекста.
 */
export function DatabaseProvider({ children }: PropsWithChildren) {
  // Соединение в ref, а не в state: методам нужно актуальное значение в момент вызова,
  // а перерисовывать экраны из-за смены соединения незачем.
  const dbRef = useRef<SQLiteDatabase | null>(null);
  // Цепочка обещаний: операции идут строго по одной и не попадают в чужую транзакцию.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [revision, setRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<DatabaseError | null>(null);
  // Смена номера попытки перезапускает эффект открытия базы.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let opened: SQLiteDatabase | null = null;

    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const db = await initDatabase();
        if (cancelled) {
          // Экран успели закрыть, пока база открывалась.
          await db.closeAsync();
          return;
        }
        opened = db;
        dbRef.current = db;
        const list = await operations.selectMarkers(db);
        if (!cancelled) {
          setMarkers(list);
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          setError(toDatabaseError(caught, 'init'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      dbRef.current = null;
      if (opened) {
        const db = opened;
        // Закрываем после того, как доработают уже начатые операции.
        queueRef.current
          .finally(() => db.closeAsync())
          .catch((closeError: unknown) => console.warn('Не удалось закрыть базу', closeError));
      }
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  /** Ставит операцию в очередь и выполняет её с текущим соединением. */
  const enqueue = useCallback(
    <T,>(task: (db: SQLiteDatabase) => Promise<T>): Promise<T> => {
      const run = queueRef.current.then(() => {
        const db = dbRef.current;
        if (!db) {
          throw new DatabaseError('connection', 'База данных не открыта');
        }
        return task(db);
      });
      queueRef.current = run.catch(() => undefined);

      return run.catch((caught: unknown) => {
        const dbError = toDatabaseError(caught, 'operation');
        // Потеря соединения касается всего приложения — показываем её на экранах.
        if (dbError.kind === 'connection') {
          setError(dbError);
        }
        throw dbError;
      });
    },
    [],
  );

  const getMarkers = useCallback(async () => {
    const list = await enqueue(operations.selectMarkers);
    setMarkers(list);
    return list;
  }, [enqueue]);

  /**
   * После записи перечитываем список. Если чтение не удалось, сама запись всё равно
   * прошла — поэтому ошибку только логируем, а не бросаем вызывающему.
   */
  const afterWrite = useCallback(async () => {
    setRevision((value) => value + 1);
    await getMarkers().catch((caught: unknown) =>
      console.warn('Не удалось перечитать список мест', caught),
    );
  }, [getMarkers]);

  const addMarker = useCallback(
    async (latitude: number, longitude: number, title = DEFAULT_TITLE) => {
      const id = await enqueue((db) =>
        operations.insertMarker(db, latitude, longitude, title.trim() || DEFAULT_TITLE),
      );
      await afterWrite();
      return id;
    },
    [enqueue, afterWrite],
  );

  const renameMarker = useCallback(
    async (id: number, title: string) => {
      const trimmed = title.trim();
      // Пустое название не сохраняем: у места должно остаться хоть какое-то имя.
      if (!trimmed) {
        return;
      }
      await enqueue((db) => operations.updateMarkerTitle(db, id, trimmed));
      await afterWrite();
    },
    [enqueue, afterWrite],
  );

  const deleteMarker = useCallback(
    async (id: number) => {
      const uris = await enqueue((db) => operations.deleteMarker(db, id));
      await afterWrite();
      // Файлы удаляем после базы: если не выйдет, список на экране уже верный.
      await Promise.all(uris.map((uri) => deleteImageFile(uri))).catch(logFileError);
    },
    [enqueue, afterWrite],
  );

  const addImage = useCallback(
    async (markerId: number, sourceUri: string) => {
      // Копию делаем до записи в базу: если копирование упадёт, в базе не будет битой ссылки.
      const uri = await persistImageFile(sourceUri);
      try {
        await enqueue((db) => operations.insertImage(db, markerId, uri));
      } catch (caught: unknown) {
        // Запись не удалась — копия никому не нужна, убираем её, чтобы не копился мусор.
        await deleteImageFile(uri).catch(logFileError);
        throw caught;
      }
      await afterWrite();
    },
    [enqueue, afterWrite],
  );

  const deleteImage = useCallback(
    async (id: number) => {
      const uri = await enqueue((db) => operations.deleteImage(db, id));
      await afterWrite();
      if (uri) {
        await deleteImageFile(uri).catch(logFileError);
      }
    },
    [enqueue, afterWrite],
  );

  const getMarkerImages = useCallback(
    (markerId: number) => enqueue((db) => operations.selectMarkerImages(db, markerId)),
    [enqueue],
  );

  const value = useMemo<DatabaseContextType>(
    () => ({
      addMarker,
      deleteMarker,
      getMarkers,
      addImage,
      deleteImage,
      getMarkerImages,
      renameMarker,
      markers,
      revision,
      isLoading,
      error,
      retry,
    }),
    [
      addMarker,
      deleteMarker,
      getMarkers,
      addImage,
      deleteImage,
      getMarkerImages,
      renameMarker,
      markers,
      revision,
      isLoading,
      error,
      retry,
    ],
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

/** Доступ к базе. Вне DatabaseProvider вызывать нельзя — это ошибка разработчика. */
export function useDatabase(): DatabaseContextType {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase должен вызываться внутри <DatabaseProvider>');
  }
  return context;
}

/** Текст ошибки для пользователя: у DatabaseError он готов, для прочих — общий. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof DatabaseError ? error.userMessage : fallback;
}
