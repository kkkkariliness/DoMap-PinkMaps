import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout } from 'react-native-maps';

import HeartMarker from '@/components/HeartMarker';
import type { MapSurfaceHandle, MapSurfaceProps } from '@/components/map-surface.types';
import type { Coordinate } from '@/types';

/** Перевод масштаба в размер видимой области: 360° делим пополам на каждом уровне. */
function zoomToDelta(zoom: number): number {
  return 360 / 2 ** zoom;
}

/**
 * Карта на react-native-maps — используется на iOS, где карта Apple работает без ключей.
 * Для Android рядом лежит MapSurface.android.tsx: там карта Google в Expo Go остаётся пустой.
 */
const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(function MapSurface(
  {
    markers,
    theme,
    initialCoordinate,
    initialZoom,
    showsUserLocation,
    // Не нужен: на iOS точку пользователя рисует сама карта по showsUserLocation.
    userCoordinate: _userCoordinate,
    onReady,
    onLongPress,
    onMarkerPress,
  },
  ref,
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    focus: (coordinate: Coordinate) => {
      mapRef.current?.animateToRegion({
        ...coordinate,
        latitudeDelta: zoomToDelta(15),
        longitudeDelta: zoomToDelta(15),
      });
    },
    // Точку пользователя рисует сама карта по свойству showsUserLocation.
    setUserLocation: () => undefined,
  }));

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        ...initialCoordinate,
        latitudeDelta: zoomToDelta(initialZoom),
        longitudeDelta: zoomToDelta(initialZoom),
      }}
      showsUserLocation={showsUserLocation}
      onMapReady={onReady}
      onLongPress={(event) => onLongPress(event.nativeEvent.coordinate)}>
      {markers.map((marker) => (
        <HeartMarker
          key={marker.id}
          marker={marker}
          theme={theme}
          onCalloutPress={() => onMarkerPress(marker.id)}>
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{marker.title}</Text>
              <Text style={styles.calloutSubtitle}>
                {marker.imageCount > 0
                  ? `Фотографий: ${marker.imageCount}`
                  : 'Фотографий пока нет'}
              </Text>
              <Text style={styles.calloutAction}>Нажмите, чтобы открыть</Text>
            </View>
          </Callout>
        </HeartMarker>
      ))}
    </MapView>
  );
});

export default MapSurface;

const styles = StyleSheet.create({
  // Подложку облачка рисует система, она всегда светлая — поэтому цвета здесь фиксированные.
  callout: { minWidth: 170, gap: 2, padding: 4 },
  calloutTitle: { fontSize: 15, fontWeight: '600', color: '#3A1020' },
  calloutSubtitle: { fontSize: 13, color: '#8A5A6D' },
  calloutAction: { fontSize: 12, paddingTop: 2, color: '#C2185B' },
});
