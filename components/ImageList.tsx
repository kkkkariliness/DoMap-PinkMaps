import { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { MarkerImage } from '@/types';

type Props = {
  images: MarkerImage[];
  onRemove: (imageId: number) => void;
};

/** Сетка фотографий места: два столбца, тап — просмотр, кнопка в углу — удаление. */
export default function ImageList({ images, onRemove }: Props) {
  const theme = Colors[useColorScheme() ?? 'light'];
  // Ширину берём из окна, а не из onLayout: сетка должна пересчитываться
  // при повороте экрана и на планшетах, где ширина другая.
  const { width } = useWindowDimensions();
  // Ширина экрана минус отступы по краям (по 20 с каждой стороны) и промежуток между столбцами.
  const tileSize = (width - 40 - 12) / 2;

  // Фотография, открытая на весь экран. 
  const [preview, setPreview] = useState<MarkerImage | null>(null);

  const confirmRemove = (image: MarkerImage) => {
    // Удаление необратимо, поэтому сначала подтверждение.
    Alert.alert('Удалить фотографию?', 'Файл будет удалён из приложения.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => onRemove(image.id) },
    ]);
  };

  // Пустое состояние возвращаем до рендера сетки — не рисуем лишний View ради одного Text.
  if (images.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.textMuted }]}>
        Фотографий пока нет. Нажмите «Добавить изображение».
      </Text>
    );
  }

  return (
    <View style={styles.grid}>
      {/* key по id, а не по индексу: после удаления фото в середине списка
          индексы съезжают, и React переиспользовал бы чужие картинки. */}
      {images.map((image) => (
        <View key={image.id} style={{ width: tileSize }}>
          <Pressable onPress={() => setPreview(image)}>
            <Image
              source={{ uri: image.uri }}
              style={[
                styles.tile,
                { width: tileSize, height: tileSize, backgroundColor: theme.surface },
              ]}
              // Если файл пропал, пользователь увидит пустую плитку, а не сбой приложения.
              onError={() => console.warn('Не удалось загрузить фото', image.uri)}
            />
          </Pressable>
          {/* Кнопка удаления — отдельный Pressable, а не часть основного:
              иначе тап по «x» одновременно открывал бы полноэкранный просмотр.
              position: absolute выносит её из потока, поэтому она не влияет на сетку. */}
          <Pressable
            style={[styles.removeBadge, { backgroundColor: theme.tint }]}
            hitSlop={8}
            onPress={() => confirmRemove(image)}
            accessibilityLabel="Удалить фотографию">
            <Text style={[styles.removeBadgeText, { color: theme.onTint }]}>×</Text>
          </Pressable>
        </View>
      ))}

      {/* Просмотр на весь экран. */}
      <Modal
        visible={preview !== null}
        transparent
        animationType="fade"
        // onRequestClose — кнопка «назад» на Android: без него модалку нельзя закрыть аппаратной кнопкой.
        onRequestClose={() => setPreview(null)}>
        {/* Тап по фону закрывает просмотр: Pressable растянут на весь экран. */}
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          {preview && (
            // contain — фото целиком, без обрезки по краям. cover обрезал бы,
            // а для просмотра важнее видеть всё изображение.
            <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" />
          )}
          <Text style={styles.previewHint}>Нажмите, чтобы закрыть</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  empty: { fontSize: 15, lineHeight: 22 },
  tile: { borderRadius: 14 },
  removeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: { fontSize: 18, lineHeight: 20, fontWeight: '600' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 11, 18, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  previewImage: { width: '92%', height: '75%' },
  previewHint: { color: '#C9A0B1', fontSize: 13 },
});
