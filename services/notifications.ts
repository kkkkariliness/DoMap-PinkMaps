import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { calculateDistance } from '@/lib/geo';
import type { ActiveNotification, MapMarker } from '@/types';

/** Радиус, в котором пользователь считается «рядом» с меткой (метры). */
export const PROXIMITY_THRESHOLD_METERS = 100;

/**
 * Радиус выхода из зоны (метры). Он больше радиуса входа: иначе на границе зоны дрожание
 * GPS показывало бы и убирало уведомление снова и снова.
 */
export const EXIT_THRESHOLD_METERS = 150;

const ANDROID_CHANNEL_ID = 'proximity';

/** Создан ли свой канал Android. Если нет — уведомления идут в канал по умолчанию. */
let channelReady = false;

/**
 * Обработчик показа уведомлений. Без него уведомления, пришедшие пока приложение
 * на переднем плане, не показываются совсем.
 */
function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // Два флага, а не один: shouldShowBanner — полоска сверху, когда приложение
      // открыто; shouldShowList — запись в шторке, когда свёрнуто. Нужны оба,
      // чтобы уведомление появлялось в любом состоянии приложения.
      shouldShowBanner: true,
      shouldShowList: true,
      // Без звука и бейджа: уведомление информационное, не срочное.
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android требует канал до показа первого уведомления, а на Android без канала система
 * даже не покажет запрос разрешения. На iOS функция ничего не делает.
 *
 * В Expo Go на Android создание своего канала падает внутри самого Expo Go
 * (NullPointerException в его менеджере каналов). Это не мешает уведомлениям: у Expo Go
 * есть свой канал, туда они и уйдут, — поэтому ошибку только пишем в лог.
 */
async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Приближение к месту',
      importance: Notifications.AndroidImportance.HIGH,
      // [задержка, вибрация, пауза, вибрация] в миллисекундах: два коротких «толчка».
      vibrationPattern: [0, 250, 250, 250],
      // Розовый из светлой темы. Канал создаётся в _layout до того, как станет
      // известна активная тема, поэтому цвет захардкожен, а не взят из Colors.
      lightColor: '#C2185B',
    });
    channelReady = true;
  } catch (error: unknown) {
    channelReady = false;
    // console.log, а не warn: в Expo Go это ожидаемо, жёлтая плашка на экране ни к чему.
    console.log('Свой канал уведомлений не создан, используется канал по умолчанию', error);
  }
}

/**
 * Подготовка при запуске приложения: обработчик показа и уведомления,
 * оставшиеся в шторке с прошлого запуска. Вызывается один раз в корневом макете.
 */
export function initNotifications(): void {
  configureNotificationHandler();
  notificationManager
    .restorePresented()
    .catch((error: unknown) => console.warn('Не удалось прочитать показанные уведомления', error));
}

/** Нет разрешения на уведомления. */
export class NotificationPermissionError extends Error {
  /** false — система больше не покажет запрос, разрешить можно только в настройках. */
  readonly canAskAgain: boolean;

  constructor(message: string, canAskAgain: boolean) {
    super(message);
    this.name = 'NotificationPermissionError';
    this.canAskAgain = canAskAgain;
  }
}

/**
 * Создаёт канал, проверяет разрешение на уведомления и при необходимости запрашивает его.
 * @throws NotificationPermissionError, если разрешение не выдано.
 */
export async function ensureNotificationPermission(): Promise<void> {
  // Сначала канал: на Android без него система не покажет диалог разрешения.
  await setupNotificationChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return;
  }
  // canAskAgain различает «ещё не спрашивали / не отказали навсегда» и
  // «пользователь выбрал Больше не спрашивать». Во втором случае
  // requestPermissionsAsync вернёт отказ без диалога — сразу ведём в настройки.
  if (!current.canAskAgain) {
    throw new NotificationPermissionError('Уведомления отключены в настройках телефона.', false);
  }
  const next = await Notifications.requestPermissionsAsync();
  if (!next.granted) {
    throw new NotificationPermissionError(
      'Уведомления не разрешены — о приближении к местам приложение не сообщит.',
      next.canAskAgain,
    );
  }
}

/**
 * Хранит активные уведомления в памяти и предотвращает дубликаты.
 * Один экземпляр на приложение — см. `notificationManager` ниже.
 */
export class NotificationManager {
  private activeNotifications = new Map<number, ActiveNotification>();
  /**
   * Очередь операций. Проверки приходят из эффектов и могут наложиться друг на друга:
   * без очереди обе увидели бы «уведомления ещё нет» и показали бы его дважды.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    // Гасим ошибку до undefined: следующая операция должна выполниться,
    // а не унаследовать rejected-обещание предыдущей. Вызывающему ошибка
    // всё равно вернётся через run.catch в show/remove/checkProximity.
    this.queue = run.catch(() => undefined);
    return run;
  }

  has(markerId: number): boolean {
    return this.activeNotifications.has(markerId);
  }

  /** Идентификаторы меток, для которых сейчас висит уведомление. */
  activeMarkerIds(): number[] {
    return Array.from(this.activeNotifications.keys());
  }

  showNotification(marker: MapMarker): Promise<void> {
    return this.enqueue(() => this.show(marker));
  }

  removeNotification(markerId: number): Promise<void> {
    return this.enqueue(() => this.remove(markerId));
  }

  /** Убирает все активные уведомления. */
  removeAll(): Promise<void> {
    return this.enqueue(async () => {
      for (const markerId of this.activeMarkerIds()) {
        await this.remove(markerId);
      }
    });
  }

  /**
   * Подхватывает уведомления, которые уже висят в шторке. Память очищается при перезапуске
   * приложения, а шторка — нет: без этого шага пользователь, который всё ещё рядом с местом,
   * получил бы второе такое же уведомление.
   */
  restorePresented(): Promise<void> {
    return this.enqueue(async () => {
      const presented = await Notifications.getPresentedNotificationsAsync();
      for (const notification of presented) {
        const markerId = Number(notification.request.content.data?.markerId);
        if (Number.isInteger(markerId) && !this.activeNotifications.has(markerId)) {
          this.activeNotifications.set(markerId, {
            markerId,
            notificationId: notification.request.identifier,
            // notification.date — реальное время показа из системы, а не момент
            // восстановления: timestamp соответствует событию, а не перезапуску.
            timestamp: notification.date,
          });
        }
      }
    });
  }

  /**
   * Сверяет текущее положение со всеми метками.
   * Ближе радиуса входа — показать уведомление, дальше радиуса выхода — убрать,
   * между ними — оставить как есть. Если метку удалили — убрать её уведомление.
   */
  checkProximity(latitude: number, longitude: number, markers: MapMarker[]): Promise<void> {
    return this.enqueue(async () => {
      const currentIds = new Set(markers.map((marker) => marker.id));

      // Метки, которые удалили, пока уведомление было активно. Без этой проверки
      // уведомление висело бы, пока пользователь не выйдет из зоны, — а зоны уже нет.
      for (const markerId of this.activeMarkerIds()) {
        if (!currentIds.has(markerId)) {
          await this.remove(markerId);
        }
      }

      for (const marker of markers) {
        const distance = calculateDistance(latitude, longitude, marker.latitude, marker.longitude);
        if (distance <= PROXIMITY_THRESHOLD_METERS) {
          await this.show(marker);
        } else if (distance > EXIT_THRESHOLD_METERS) {
          await this.remove(marker.id);
        }
        // Между радиусами — ничего не делаем: иначе на границе зоны GPS-дрожание
        // показывало и убирало бы уведомление снова и снова.
      }
    });
  }

  private async show(marker: MapMarker): Promise<void> {
    if (this.activeNotifications.has(marker.id)) {
      return;
    }

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Вы рядом с меткой!',
          body: `Вы находитесь рядом с «${marker.title}».`,
          // markerId в data — чтобы restorePresented после перезапуска
          // мог понять, по какой метке уведомление уже висит.
          data: { markerId: marker.id },
        },
        // Сразу. Если свой канал создан — в него: у него высокая важность, и уведомление
        // всплывает поверх экрана. Иначе (Expo Go) — в канал по умолчанию.
        // На iOS channelId игнорируется, и channelReady всегда false — там всегда null.
        trigger: channelReady ? { channelId: ANDROID_CHANNEL_ID } : null,
      });

      this.activeNotifications.set(marker.id, {
        markerId: marker.id,
        notificationId,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Не бросаем наружу: сбой показа одного уведомления не должен ломать
      // проверку близости остальных меток. На следующем обновлении координат
      // попробуем снова.
      console.warn('Не удалось показать уведомление', error);
    }
  }

  private async remove(markerId: number): Promise<void> {
    const notification = this.activeNotifications.get(markerId);
    if (!notification) {
      return;
    }
    try {
      // Уведомление уже показано, поэтому dismiss, а не cancel.
      await Notifications.dismissNotificationAsync(notification.notificationId);
    } catch (error) {
      console.warn('Не удалось убрать уведомление', error);
    } finally {
      // Удаляем из Map даже при ошибке: следующая проверка близости попробует снова.
      // Иначе при сбое dismiss запись застряла бы и блокировала повторное уведомление.
      this.activeNotifications.delete(markerId);
    }
  }
}

/** Один экземпляр на приложение: активные уведомления должны переживать смену экранов. */
export const notificationManager = new NotificationManager();
