import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { errorMessage, useDatabase } from '@/contexts/DatabaseContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { MapMarker } from '@/types';

/** Список сохранённых мест: превью последней фотографии, название и координаты. */
export default function MarkerList() {
  // Данные приходят из контекста: отдельного запроса здесь нет — список
  // перечитывается сам после любого изменения (см. afterWrite в DatabaseContext).
  const { markers, isLoading, error, retry, deleteMarker } = useDatabase();
  const theme = Colors[useColorScheme() ?? 'light'];

  const openMarker = (id: number) => {
    try {
      // Типизированные маршруты требуют шаблон адреса и параметры отдельно.
      router.push({ pathname: '/marker/[id]', params: { id: String(id) } });
    } catch (navigationError: unknown) {
      console.warn('Переход на экран места не удался', navigationError);
      Alert.alert('Не удалось открыть место', 'Попробуйте ещё раз.');
    }
  };

  const remove = async (marker: MapMarker) => {
    try {
      await deleteMarker(marker.id);
    } catch (deleteError: unknown) {
      Alert.alert('Не удалось удалить место', errorMessage(deleteError, 'Попробуйте ещё раз.'));
    }
  };

  const confirmRemove = (marker: MapMarker) => {
    // Удаление необратимо: сначала подтверждение, действие — только по кнопке.
    // void нужен потому, что Alert не ждёт async onPress; ошибки ловит remove.
    Alert.alert('Удалить место?', `«${marker.title}» и все его фотографии.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void remove(marker) },
    ]);
  };

  return (
    <FlatList
      data={markers}
      // key по id, а не по индексу: после удаления элемента из середины индексы
      // съезжают, и React переиспользовал бы чужие карточки.
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      // ListEmptyComponent рендерится и при пустом списке, и при ошибке загрузки —
      // поэтому внутри проверяем, что именно показать.
      ListEmptyComponent={
        // Пока данные читаются, не пишем «пусто» — это было бы неправдой.
        isLoading ? null : error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.empty, { color: theme.danger }]}>{error.userMessage}</Text>
            <Pressable
              style={[styles.retryButton, { backgroundColor: theme.tint }]}
              onPress={retry}>
              <Text style={[styles.retryButtonText, { color: theme.onTint }]}>Повторить</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            Пока пусто. Откройте карту и задержите палец на нужной точке.
          </Text>
        )
      }
      renderItem={({ item }) => (
        // style как функция: Pressable получает pressed, и карточка
        // приглушается на время касания.
        <Pressable
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.cardPressed,
          ]}
          onPress={() => openMarker(item.id)}
          // Долгое нажатие — удаление. Так основной жест (тап) остаётся открытием,
          // а деструктивное действие спрятано за долгим удержанием.
          onLongPress={() => confirmRemove(item)}>
          <View style={[styles.thumbnail, { backgroundColor: theme.background }]}>
            {/* Превью — последнее добавленное фото, его отдаёт selectMarkers одним запросом.
                Если фото нет, показываем контурное сердечко — тот же визуальный язык,
                что и на карте. */}
            {item.previewUri ? (
              <Image source={{ uri: item.previewUri }} style={styles.thumbnailImage} />
            ) : (
              <MaterialIcons name="favorite-border" size={26} color={theme.tint} />
            )}
          </View>

          <View style={styles.cardText}>
            {/* numberOfLines={1} — длинное название обрезается многоточием,
                а не переносится на вторую строку и не ломает высоту карточки. */}
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {/* toFixed(4) — примерно 10 метров точности: достаточно, чтобы
                отличить два соседних места, но не перегружает карточку цифрами. */}
            <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>
              {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
            </Text>
            <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>
              {item.imageCount > 0 ? `Фотографий: ${item.imageCount}` : 'Фотографий нет'}
            </Text>
          </View>

          <Text style={[styles.chevron, { color: theme.tint }]}>›</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  // paddingBottom: 120 — запас под плавающую панель вкладок, иначе последняя
  // карточка уходит под неё.
  list: { paddingHorizontal: 20, paddingBottom: 120, gap: 12 },
  empty: { fontSize: 15, paddingTop: 40, textAlign: 'center', lineHeight: 22 },
  errorBox: { alignItems: 'center', gap: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryButtonText: { fontSize: 15, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  // Эффект нажатия только через opacity: тень и фон не пересчитываются — дешевле.
  cardPressed: { opacity: 0.7 },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: { width: '100%', height: '100%' },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSubtitle: { fontSize: 13 },
  chevron: { fontSize: 28, paddingRight: 4 },
});
