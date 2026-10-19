import * as Location from 'expo-location';

/** Настройки отслеживания */
export interface LocationConfig {
  accuracy: Location.Accuracy;
  // Как часто присылать обновления — миллисекунды.
  timeInterval: number;
  // Минимальное расстояние между обновлениями — метры. Обновления чаще,
  // чем раз в 5 метров, не нужны: пользователь ещё на месте.
  distanceInterval: number;
}

export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  // Balanced даёт погрешность в единицы метров.
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 5000,
  distanceInterval: 5,
};

/**
 * Почему не удалось получить местоположение. От вида зависит, что предложить пользователю:
 * повторить попытку или открыть настройки телефона.
 */
export type LocationErrorKind =
  /** Геолокация выключена на телефоне. */
  | 'services-disabled'
  /** Пользователь отказал, но разрешение можно запросить ещё раз. */
  | 'permission-denied'
  /** Система больше не показывает запрос — разрешить можно только в настройках. */
  | 'permission-blocked'
  /** Служба геолокации не смогла выдать координаты. */
  | 'unavailable';

export class LocationError extends Error {
  readonly kind: LocationErrorKind;

  constructor(kind: LocationErrorKind, message: string, options?: { cause?: unknown }) {
    // cause — исходное исключение из expo-location: в логи полезно, в UI — нет.
    super(message, { cause: options?.cause });
    // Без явного name в логах класс неотличим от обычного Error.
    this.name = 'LocationError';
    this.kind = kind;
  }
}

/**
 * Проверяет, включены ли службы геолокации на телефоне.
 * Не требует разрешений — читает только системный флаг.
 */
export async function ensureLocationServicesEnabled(): Promise<void> {
  // hasServicesEnabledAsync проверяет системный переключатель, а не разрешение
  // для приложения. Это первая проверка: бессмысленно спрашивать разрешение,
  // если сервис выключен глобально.
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) {
    throw new LocationError(
      'services-disabled',
      'Геолокация выключена. Включите её в настройках телефона.',
    );
  }
}

/**
 * Запрашивает разрешение на доступ к местоположению.
 * @throws LocationError, если пользователь отказал.
 */
export async function requestLocationPermissions(): Promise<void> {
  // canAskAgain различает два случая отказа: «не сейчас» и «больше не спрашивать».
  // В первом система ещё покажет диалог, во втором — только настройки.
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status === 'granted') {
    return;
  }
  throw canAskAgain
    ? new LocationError('permission-denied', 'Доступ к местоположению не разрешён.')
    : new LocationError(
        'permission-blocked',
        'Доступ к местоположению запрещён. Разрешите его в настройках.',
      );
}

/**
 * Запускает поток обновлений местоположения. Обновления приходят, только пока приложение
 * на экране. Возвращает подписку, которую нужно освободить через `subscription.remove()`.
 *
 * @param onError вызывается, если служба геолокации сбоит уже после запуска отслеживания.
 */
export async function startLocationUpdates(
  onLocation: (location: Location.LocationObject) => void,
  onError: (error: LocationError) => void,
  config: LocationConfig = DEFAULT_LOCATION_CONFIG,
): Promise<Location.LocationSubscription> {
  try {
    return await Location.watchPositionAsync(
      {
        accuracy: config.accuracy,
        timeInterval: config.timeInterval,
        distanceInterval: config.distanceInterval,
      },
      onLocation,
      // Третий аргумент — колбэк ошибок уже после старта. Ошибки при самом
      // запуске (невалидные параметры, нет разрешения) поймает внешний try.
      // Оборачиваем в LocationError, чтобы Map.tsx работал с одним типом ошибки.
      (reason) =>
        onError(
          new LocationError(
            'unavailable',
            'Не удалось получить координаты. Проверьте, включена ли геолокация.',
            { cause: reason },
          ),
        ),
    );
  } catch (error: unknown) {
    // Сюда попадают сбои запуска. Оборачиваем в LocationError с тем же
    // kind = 'unavailable', что и в onError: снаружи не важно, случилось
    // это при запуске или во время работы, — важна реакция (повторить или настройки).
    throw new LocationError('unavailable', 'Не удалось запустить отслеживание местоположения.', {
      cause: error,
    });
  }
}
