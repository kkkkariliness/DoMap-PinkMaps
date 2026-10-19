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
  const { width } = useWindowDimensions();
  // Ширина экрана минус отступы по краям и промежуток между столбцами.
  const tileSize = (width - 40 - 12) / 2;

  // Фотография, открытая на весь экран.
  const [preview, setPreview] = useState<MarkerImage | null>(null);

  const confirmRemove = (image: MarkerImage) => {
    Alert.alert('Удалить фотографию?', 'Файл будет удалён из приложения.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => onRemove(image.id) },
    ]);
  };

  if (images.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.textMuted }]}>
        Фотографий пока нет. Нажмите «Добавить изображение».
      </Text>
    );
  }

  return (
    <View style={styles.grid}>
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
      <Modal visible={preview !== null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          {preview && (
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
