import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { errorMessage, useDatabase } from '@/contexts/DatabaseContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { MapMarker } from '@/types';

/** Список сохранённых мест: превью последней фотографии, название и координаты. */
export default function MarkerList() {
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
    Alert.alert('Удалить место?', `«${marker.title}» и все его фотографии.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void remove(marker) },
    ]);
  };

  return (
    <FlatList
      data={markers}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
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
        <Pressable
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.cardPressed,
          ]}
          onPress={() => openMarker(item.id)}
          onLongPress={() => confirmRemove(item)}>
          <View style={[styles.thumbnail, { backgroundColor: theme.background }]}>
            {item.previewUri ? (
              <Image source={{ uri: item.previewUri }} style={styles.thumbnailImage} />
            ) : (
              <MaterialIcons name="favorite-border" size={26} color={theme.tint} />
            )}
          </View>

          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
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
