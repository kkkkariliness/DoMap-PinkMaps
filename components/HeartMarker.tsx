import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker, type MapMarkerProps } from 'react-native-maps';

import type { AppTheme } from '@/constants/Colors';
import type { MapMarker } from '@/types';

type Props = {
  marker: MapMarker;
  theme: AppTheme;
  onCalloutPress: MapMarkerProps['onCalloutPress'];
  children?: React.ReactNode;
};

/**
 * Метка в виде сердечка.
 *
 * Закрашенное сердце — у места есть фотографии, контурное — пока нет.
 *
 * tracksViewChanges: Android перерисовывает картинку метки на каждый кадр,
 * пока этот флаг включён, и карта начинает тормозить. Поэтому держим его включённым
 * пару секунд (чтобы иконка успела отрисоваться) и выключаем.
 */
export default function HeartMarker({ marker, theme, onCalloutPress, children }: Props) {
  const hasImages = marker.imageCount > 0;
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const [trackedHasImages, setTrackedHasImages] = useState(hasImages);

  // Иконка меняется при добавлении первой фотографии — снимок метки нужно обновить.
  // Включаем флаг прямо при рендере, а не в эффекте: так не бывает лишнего прохода перерисовки.
  if (trackedHasImages !== hasImages) {
    setTrackedHasImages(hasImages);
    setTracksViewChanges(true);
  }

  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), 2000);
    return () => clearTimeout(timer);
  }, [hasImages]);

  return (
    <Marker
      coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
      // Остриё сердца снизу по центру — так метка стоит ровно на своей точке.
      anchor={{ x: 0.5, y: 0.95 }}
      tracksViewChanges={tracksViewChanges}
      onCalloutPress={onCalloutPress}>
      <View style={styles.container}>
        <MaterialIcons
          name={hasImages ? 'favorite' : 'favorite-border'}
          size={38}
          color={theme.tint}
          // Белая обводка, чтобы сердце читалось на любой карте.
          style={styles.icon}
        />
      </View>
      {children}
    </Marker>
  );
}

const styles = StyleSheet.create({
  // Запас вокруг иконки: без него Android обрезает тень по краям.
  container: { padding: 4, alignItems: 'center', justifyContent: 'center' },
  icon: {
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
});
