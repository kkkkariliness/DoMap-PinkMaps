import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import MapSurface from '@/components/MapSurface';
import type { MapSurfaceHandle } from '@/components/map-surface.types';
import { Colors, type AppTheme } from '@/constants/Colors';
import { errorMessage, useDatabase } from '@/contexts/DatabaseContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  ensureLocationServicesEnabled,
  LocationError,
  requestLocationPermissions,
  startLocationUpdates,
} from '@/services/location';
import {
  ensureNotificationPermission,
  NotificationPermissionError,
  notificationManager,
} from '@/services/notifications';
import type { Coordinate, LocationState } from '@/types';

/** Куда смотрит карта при первом открытии, пока неизвестно, где пользователь. */
const INITIAL_COORDINATE = { latitude: 58.0105, longitude: 56.2502 };

/** Масштаб первого показа: город целиком. */
const INITIAL_ZOOM = 11;

/** Через сколько считаем, что карта не загрузилась (нет сети, не отвечают тайлы). */
const MAP_READY_TIMEOUT = 10000;

export default function Map() {
  const { markers, isLoading, error, retry, addMarker } = useDatabase();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const mapRef = useRef<MapSurfaceHandle>(null);

  // Координаты, выбранные долгим нажатием, но ещё не подтверждённые названием.
  const [draftCoordinate, setDraftCoordinate] = useState<Coordinate | null>(null);
  const [title, setTitle] = useState('');
  // Включается по кнопке «Где я»: точка видна сразу после разрешения, ещё до первого фикса трекера.
  const [showsUserLocation, setShowsUserLocation] = useState(false);

  const [location, setLocation] = useState<LocationState>({
    coordinate: null,
    error: null,
    isTracking: false,
  });
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [notificationError, setNotificationError] = useState<NotificationPermissionError | null>(
    null,
  );

  const [isMapReady, setIsMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  // Меняя ключ, пересоздаём карту — это и есть «повторить попытку».
  const [mapKey, setMapKey] = useState(0);

  // Со списка мест сюда приходит id маркера, к которому надо подлететь.
  const { focusId } = useLocalSearchParams<{ focusId?: string }>();

  // Если карта не сообщила о готовности за отведённое время, показываем ошибку.
  useEffect(() => {
    if (isMapReady) {
      return;
    }
    const timer = setTimeout(() => setMapFailed(true), MAP_READY_TIMEOUT);
    return () => clearTimeout(timer);
  }, [isMapReady, mapKey]);

  // Перелёт к метке из вкладки «Места».
  useEffect(() => {
    if (!focusId || isLoading) {
      return;
    }
    // Параметры адреса — всегда строки, а id в базе — число.
    const marker = markers.find((item) => String(item.id) === focusId);
    if (marker) {
      mapRef.current?.focus({ latitude: marker.latitude, longitude: marker.longitude });
    }
  }, [focusId, isLoading, markers]);

  /** Отслеживание местоположения */
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    // cancelled защищает от позднего setState: пользователь мог уйти с экрана,
    // пока шёл запрос разрешения или ждали первый фикс.
    let cancelled = false;

    // Одна точка записи ошибки в state: сюда приходят и отказ в разрешении,
    // и сбой watchPosition. cancelled здесь, а не в вызывающем коде — чтобы
    // размонтированный экран не пытался обновить состояние.
    const fail = (locationError: LocationError) => {
      if (!cancelled) {
        setLocation({ coordinate: null, error: locationError, isTracking: false });
      }
    };

    const setup = async () => {
      try {
        await ensureLocationServicesEnabled();
        await requestLocationPermissions();
        // Разрешение на уведомления запрашиваем отдельно, чтобы отказ
        // не блокировал карту — только показываем предупреждение.
        try {
          await ensureNotificationPermission();
          if (!cancelled) setNotificationError(null);
        } catch (notifyError: unknown) {
          if (!cancelled) {
            if (!(notifyError instanceof NotificationPermissionError)) {
              console.warn('Не удалось подготовить уведомления', notifyError);
            }
            // Неожиданную ошибку оборачиваем в наш класс, чтобы UI не зависел
            // от того, что именно пошло не так внутри сервиса.
            setNotificationError(
              notifyError instanceof NotificationPermissionError
                ? notifyError
                : new NotificationPermissionError('Уведомления недоступны.', true),
            );
          }
        }

        if (cancelled) return;

        const sub = await startLocationUpdates(
          (update) => {
            if (cancelled) return;
            setLocation({
              coordinate: {
                latitude: update.coords.latitude,
                longitude: update.coords.longitude,
              },
              error: null,
              isTracking: true,
            });
          },
          (watchError) => {
            console.warn('Сбой отслеживания местоположения', watchError.cause);
            fail(watchError);
          },
        );

        // Пока шло отслеживание, экран могли закрыть — сразу прекращаем,
        // иначе трекер остался бы работать в фоне.
        if (cancelled) {
          sub.remove();
          return;
        }
        subscription = sub;
      } catch (setupError: unknown) {
        fail(
          setupError instanceof LocationError
            ? setupError
            : new LocationError('unavailable', 'Не удалось определить местоположение.', {
                cause: setupError,
              }),
        );
      }
    };

    setup();

    // remove() — единственный способ остановить watchPositionAsync.
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [locationAttempt]);

  /** Проверка близости к меткам */
  useEffect(() => {
    const coordinate = location.coordinate;
    if (!coordinate || isLoading) return;

    // Не показываем уведомления, если пользователь не дал разрешение.
    if (notificationError) return;

    notificationManager
      .checkProximity(coordinate.latitude, coordinate.longitude, markers)
      .catch((proximityError: unknown) =>
        console.warn('Не удалось проверить близость к меткам', proximityError),
      );
  }, [location.coordinate, markers, isLoading, notificationError]);

  /** Запустить отслеживание заново: кнопка «Повторить» на плашках ошибок. */
  const retryLocation = () => {
    // Старую ошибку гасим сразу: иначе плашка висит поверх индикатора, пока
    // setup делает запрос разрешения.
    setLocation((current) => ({ ...current, error: null }));
    setLocationAttempt((value) => value + 1);
  };

  /** Настройки приложения: в Expo Go откроются настройки самого Expo Go — разрешения выдаются ему. */
  const openSettings = () => {
    Linking.openSettings().catch(() =>
      Alert.alert('Не удалось открыть настройки', 'Откройте настройки телефона вручную.'),
    );
  };

  const retryAction: BannerAction = { label: 'Повторить', onPress: retryLocation };
  const settingsAction: BannerAction = { label: 'Настройки', onPress: openSettings };

  const openMarker = useCallback((id: number) => {
    try {
      // Типизированные маршруты требуют шаблон адреса и параметры отдельно.
      router.push({ pathname: '/marker/[id]', params: { id: String(id) } });
    } catch (error: unknown) {
      console.warn('Переход на экран места не удался', error);
      Alert.alert('Не удалось открыть место', 'Попробуйте ещё раз.');
    }
  }, []);

  const onLongPress = (coordinate: Coordinate) => {
    setDraftCoordinate(coordinate);
    setTitle('');
  };

  const closeDraft = () => {
    setDraftCoordinate(null);
    setTitle('');
  };

  const confirmDraft = async () => {
    if (!draftCoordinate) {
      return;
    }
    const { latitude, longitude } = draftCoordinate;
    // Без названия место всё равно сохранится — подставим дату.
    const markerTitle = title.trim() || `Место от ${new Date().toLocaleDateString()}`;
    closeDraft();

    try {
      const id = await addMarker(latitude, longitude, markerTitle);
      openMarker(id);
    } catch (addError: unknown) {
      Alert.alert('Не удалось сохранить место', errorMessage(addError, 'Попробуйте ещё раз.'));
    }
  };

  const goToMyLocation = async () => {
    // Координаты уже отслеживаются — просто показываем их.
    if (location.coordinate) {
      mapRef.current?.focus(location.coordinate);
      return;
    }

    // Отслеживание не запущено (например, не было разрешения) — определяем место сами.
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Нет доступа к геолокации',
          'Разрешите доступ в настройках, чтобы увидеть себя на карте.',
        );
        return;
      }
      if (location.error) {
        // Разрешение появилось — запускаем отслеживание заново.
        retryLocation();
      }

      setShowsUserLocation(true);
      const position = await Location.getCurrentPositionAsync({});
      const coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      mapRef.current?.setUserLocation(coordinate);
      mapRef.current?.focus(coordinate);
    } catch (error: unknown) {
      console.warn('Определение местоположения не удалось', error);
      Alert.alert('Не удалось определить местоположение', 'Проверьте, включена ли геолокация.');
    }
  };

  const retryMap = () => {
    setMapFailed(false);
    setIsMapReady(false);
    setMapKey((key) => key + 1);
  };

  return (
    <View style={styles.container}>
      {/* Какая карта подключится, решает Metro: на Android — Leaflet в WebView,
          на iOS — карта Apple через react-native-maps. */}
      <MapSurface
        key={mapKey}
        ref={mapRef}
        markers={markers}
        theme={theme}
        initialCoordinate={INITIAL_COORDINATE}
        initialZoom={INITIAL_ZOOM}
        // Точка появляется либо по кнопке «Где я» (showsUserLocation), либо как
        // только трекер прислал первую координату (location.isTracking). Оба нужны:
        // кнопка работает без активного трекинга, трекер — без нажатия на кнопку.
        showsUserLocation={showsUserLocation || location.isTracking}
        userCoordinate={location.coordinate}
        onReady={() => setIsMapReady(true)}
        onLongPress={onLongPress}
        onMarkerPress={openMarker}
      />

      {/* Пока карта не готова, показываем индикатор поверх неё. */}
      {!isMapReady && !mapFailed && (
        <View style={[styles.overlay, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.tint} />
          <Text style={[styles.overlayText, { color: theme.textMuted }]}>Загружаем карту…</Text>
        </View>
      )}

      {mapFailed && (
        <View style={[styles.overlay, { backgroundColor: theme.background }]}>
          <Text style={[styles.overlayTitle, { color: theme.text }]}>Карта не загрузилась</Text>
          <Text style={[styles.overlayText, { color: theme.textMuted }]}>
            Проверьте подключение к интернету.
          </Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.tint }]}
            onPress={retryMap}>
            <Text style={[styles.retryButtonText, { color: theme.onTint }]}>Повторить</Text>
          </Pressable>
        </View>
      )}

      {/* Плашки с ошибками: база данных, геолокация, уведомления.
          box-none: контейнер прозрачен для касаний, ловят только сами плашки —
          иначе он блокировал бы карту под пустыми местами между баннерами. */}
      <View style={styles.banners} pointerEvents="box-none">
        {error && (
          <Banner
            theme={theme}
            message={error.userMessage}
            actions={[{ label: 'Повторить', onPress: retry }]}
          />
        )}
        {location.error && (
          <Banner
            theme={theme}
            message={location.error.message}
            // На заблокированное разрешение «Повторить» не поможет: система уже
            // не покажет диалог. Единственный путь — настройки, поэтому они первыми.
            actions={
              location.error.kind === 'permission-blocked'
                ? [settingsAction, retryAction]
                : [retryAction]
            }
          />
        )}
        {notificationError && (
          <Banner
            theme={theme}
            message={notificationError.message}
            // canAskAgain: если диалог ещё возможен — хватит «Повторить»;
            // если пользователь выбрал «Больше не спрашивать» — нужны настройки.
            actions={notificationError.canAskAgain ? [retryAction] : [settingsAction, retryAction]}
          />
        )}
      </View>

      <View style={[styles.hint, { backgroundColor: theme.tint }]} pointerEvents="none">
        <Text style={[styles.hintText, { color: theme.onTint }]}>
          Долгое нажатие по карте — новое место
        </Text>
      </View>

      <Pressable
        style={[styles.locationButton, { backgroundColor: theme.background }]}
        onPress={goToMyLocation}>
        <Text style={[styles.locationButtonText, { color: theme.tint }]}>Где я</Text>
      </Pressable>

      {/* Ввод названия для нового места. */}
      <Modal
        visible={draftCoordinate !== null}
        animationType="fade"
        transparent
        onRequestClose={closeDraft}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Новое место</Text>
            {draftCoordinate && (
              <Text style={[styles.modalCoords, { color: theme.textMuted }]}>
                {draftCoordinate.latitude.toFixed(5)}, {draftCoordinate.longitude.toFixed(5)}
              </Text>
            )}
            <TextInput
              style={[
                styles.input,
                { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
              ]}
              placeholder="Название"
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
              autoFocus={Platform.OS !== 'android'}
              returnKeyType="done"
              onSubmitEditing={confirmDraft}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.surface }]}
                onPress={closeDraft}>
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.tint }]}
                onPress={confirmDraft}>
                <Text style={[styles.modalButtonText, { color: theme.onTint, fontWeight: '600' }]}>
                  Сохранить
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface BannerAction {
  label: string;
  onPress: () => void;
}

/** Плашка поверх карты: сообщение об ошибке и кнопки действий. */
function Banner({
  theme,
  message,
  actions,
}: {
  theme: AppTheme;
  message: string;
  actions: BannerAction[];
}) {
  return (
    <View style={[styles.banner, { backgroundColor: theme.surface }]}>
      <Text style={[styles.bannerText, { color: theme.danger }]}>{message}</Text>
      {actions.map((action) => (
        <Pressable key={action.label} onPress={action.onPress} hitSlop={8}>
          <Text style={[styles.bannerAction, { color: theme.tint }]}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayTitle: { fontSize: 17, fontWeight: '600' },
  overlayText: { fontSize: 14 },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: { fontSize: 15, fontWeight: '600' },
  banners: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    gap: 8,
  },
  banner: {
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerText: { fontSize: 13, flex: 1 },
  bannerAction: { fontSize: 14, fontWeight: '600' },
  hint: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  hintText: { fontSize: 13, fontWeight: '500' },
  locationButton: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  locationButtonText: { fontSize: 15, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(58, 16, 32, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: { borderRadius: 20, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  modalCoords: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  modalButtonText: { fontSize: 15 },
});
