import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ImageList from '@/components/ImageList';
import { Colors } from '@/constants/Colors';
import { errorMessage, useDatabase } from '@/contexts/DatabaseContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { MarkerDetailsParams, MarkerImage } from '@/types';

/** Экран деталей места: координаты, дата, фотографии. */
export default function MarkerDetailsScreen() {
  const { id } = useLocalSearchParams<MarkerDetailsParams>();
  const {
    markers,
    revision,
    isLoading,
    getMarkerImages,
    addImage,
    deleteImage,
    deleteMarker,
    renameMarker,
  } = useDatabase();
  const theme = Colors[useColorScheme() ?? 'light'];

  // Пока фотография копируется в папку приложения, кнопку блокируем.
  const [isAddingImage, setIsAddingImage] = useState(false);
  // Черновик нового названия; null — окно переименования закрыто.
  const [draftTitle, setDraftTitle] = useState<string | null>(null);

  const [images, setImages] = useState<MarkerImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imagesError, setImagesError] = useState<string | null>(null);
  // Смена номера перечитывает фото — это кнопка «Повторить».
  const [imagesAttempt, setImagesAttempt] = useState(0);

  // Параметр адреса — строка; в базе id — целое число. Мусор в адресе — «не найдено».
  const markerId = Number(id);
  const marker = Number.isInteger(markerId)
    ? markers.find((item) => item.id === markerId)
    : undefined;
  const markerExists = marker !== undefined;

  // Фото читаем из базы при открытии и после каждого изменения данных (revision).
  useEffect(() => {
    if (!markerExists) {
      return;
    }
    let cancelled = false;

    getMarkerImages(markerId)
      .then((list) => {
        if (!cancelled) {
          setImages(list);
          setImagesError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setImagesError(errorMessage(loadError, 'Не удалось загрузить фотографии.'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setImagesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [markerId, markerExists, revision, imagesAttempt, getMarkerImages]);

  // Возврат назад: если стека нет (экран открыт по ссылке), уходим на карту.
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Место' }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  // Маркера может не быть: его удалили или ссылка устарела.
  if (!marker) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Место не найдено' }} />
        <Text style={[styles.notFoundTitle, { color: theme.text }]}>Место не найдено</Text>
        <Text style={[styles.notFoundText, { color: theme.textMuted }]}>
          Возможно, оно было удалено.
        </Text>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.tint }]}
          onPress={goBack}>
          <Text style={[styles.primaryButtonText, { color: theme.onTint }]}>Вернуться к карте</Text>
        </Pressable>
      </View>
    );
  }

  const pickImage = async () => {
    try {
      setIsAddingImage(true);

      // На iOS доступ к галерее нужно спросить, на Android современных версий — нет,
      // но вызов безопасен на обеих платформах.
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Нет доступа к фотографиям',
          'Разрешите доступ в настройках телефона, чтобы добавить изображение.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      // Пользователь закрыл выбор — это не ошибка, молча выходим.
      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        throw new Error('Выбор изображения вернул пустой результат');
      }

      await addImage(marker.id, asset.uri);
    } catch (addError: unknown) {
      console.warn('Не удалось добавить изображение', addError);
      Alert.alert(
        'Не удалось добавить изображение',
        errorMessage(addError, 'Попробуйте выбрать другой файл.'),
      );
    } finally {
      setIsAddingImage(false);
    }
  };

  const removeImage = async (imageId: number) => {
    try {
      await deleteImage(imageId);
    } catch (removeError: unknown) {
      Alert.alert('Не удалось удалить фотографию', errorMessage(removeError, 'Попробуйте ещё раз.'));
    }
  };

  const saveTitle = async () => {
    const nextTitle = draftTitle;
    setDraftTitle(null);
    if (nextTitle === null || !nextTitle.trim()) {
      return;
    }
    try {
      await renameMarker(marker.id, nextTitle);
    } catch (renameError: unknown) {
      Alert.alert('Не удалось переименовать место', errorMessage(renameError, 'Попробуйте ещё раз.'));
    }
  };

  const confirmRemoveMarker = () => {
    Alert.alert('Удалить место?', `«${marker.title}» и все его фотографии.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMarker(marker.id);
            goBack();
          } catch (deleteError: unknown) {
            Alert.alert('Не удалось удалить место', errorMessage(deleteError, 'Попробуйте ещё раз.'));
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      {/* Заголовок экрана берём из названия места. */}
      <Stack.Screen options={{ title: marker.title }} />

      <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.infoLabel, { color: theme.textMuted }]}>Название</Text>
        <View style={styles.titleRow}>
          <Text style={[styles.infoValue, styles.titleValue, { color: theme.text }]}>
            {marker.title}
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => setDraftTitle(marker.title)}
            accessibilityLabel="Переименовать место">
            <Text style={[styles.renameLink, { color: theme.tint }]}>Изменить</Text>
          </Pressable>
        </View>

        <Text style={[styles.infoLabel, { color: theme.textMuted }]}>Координаты</Text>
        <Text style={[styles.infoValue, { color: theme.text }]}>
          {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
        </Text>

        <Text style={[styles.infoLabel, { color: theme.textMuted }]}>Добавлено</Text>
        <Text style={[styles.infoValue, { color: theme.text }]}>
          {new Date(marker.createdAt).toLocaleString()}
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Фотографии</Text>
        <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{marker.imageCount}</Text>
      </View>

      {imagesError ? (
        <View style={styles.imagesState}>
          <Text style={[styles.notFoundText, { color: theme.danger }]}>{imagesError}</Text>
          <Pressable hitSlop={8} onPress={() => setImagesAttempt((value) => value + 1)}>
            <Text style={[styles.renameLink, { color: theme.tint }]}>Повторить</Text>
          </Pressable>
        </View>
      ) : imagesLoading && images.length === 0 ? (
        <ActivityIndicator color={theme.tint} />
      ) : (
        <ImageList images={images} onRemove={(imageId) => void removeImage(imageId)} />
      )}

      <Pressable
        style={[
          styles.primaryButton,
          { backgroundColor: theme.tint },
          isAddingImage && styles.buttonDisabled,
        ]}
        onPress={pickImage}
        disabled={isAddingImage}>
        {isAddingImage ? (
          <ActivityIndicator color={theme.onTint} />
        ) : (
          <Text style={[styles.primaryButtonText, { color: theme.onTint }]}>
            Добавить изображение
          </Text>
        )}
      </Pressable>

      {/* Окно переименования. */}
      <Modal
        visible={draftTitle !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDraftTitle(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Новое название</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
              ]}
              value={draftTitle ?? ''}
              onChangeText={setDraftTitle}
              placeholder="Название места"
              placeholderTextColor={theme.textMuted}
              autoFocus={Platform.OS !== 'android'}
              returnKeyType="done"
              onSubmitEditing={() => void saveTitle()}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.surface }]}
                onPress={() => setDraftTitle(null)}>
                <Text style={[styles.modalButtonText, { color: theme.text }]}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.tint }]}
                onPress={() => void saveTitle()}>
                <Text style={[styles.modalButtonText, { color: theme.onTint, fontWeight: '600' }]}>
                  Сохранить
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Pressable style={styles.dangerButton} onPress={confirmRemoveMarker}>
        <Text style={[styles.dangerButtonText, { color: theme.danger }]}>Удалить место</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 60, gap: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  notFoundTitle: { fontSize: 20, fontWeight: '600' },
  notFoundText: { fontSize: 15, textAlign: 'center' },
  infoCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
  },
  infoLabel: { fontSize: 13, paddingTop: 6 },
  infoValue: { fontSize: 16, fontWeight: '500' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleValue: { flexShrink: 1 },
  renameLink: { fontSize: 15, fontWeight: '600' },
  imagesState: { alignItems: 'center', gap: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(58, 16, 32, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: { borderRadius: 20, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
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
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  sectionCount: { fontSize: 15 },
  primaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  dangerButton: { alignItems: 'center', paddingVertical: 12 },
  dangerButtonText: { fontSize: 15 },
});
