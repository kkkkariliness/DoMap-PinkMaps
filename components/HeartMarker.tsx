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
  // Callout передаётся снаружи как children: метка не знает, что показывать
  // в облачке — это решает экран карты.
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
  // tracksViewChanges — отдельный стейт: им управляют два события (смена иконки и таймер).
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  // trackedHasImages запоминает, для какого состояния иконки сейчас снят снимок метки.
  // Сравнивая его с hasImages, замечаем момент, когда картинку нужно перерисовать.
  const [trackedHasImages, setTrackedHasImages] = useState(hasImages);

  // Иконка меняется при добавлении первой фотографии — снимок метки нужно обновить.
  // Включаем флаг прямо при рендере, а не в эффекте: так не бывает лишнего прохода перерисовки.
  if (trackedHasImages !== hasImages) {
    setTrackedHasImages(hasImages);
    setTracksViewChanges(true);
  }

  // Через 2 секунды после смены иконки выключаем перерисовку — метка уже отрисована.
  // Зависимость от hasImages, а не от tracksViewChanges: таймер должен перезапускаться
  // при смене иконки, а не при каждом переключении флага.
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
          style={styles.icon}
        />
      </View>
      {/* Дочерние элементы react-native-maps показываются в облачке по нажатию на метку. */}
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
