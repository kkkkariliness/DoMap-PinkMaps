import type { AppTheme } from '@/constants/Colors';
import type { Coordinate, MapMarker } from '@/types';

/** Через этот интерфейс экран управляет картой, не зная, какая она внутри. */
export interface MapSurfaceHandle {
  /** Подлететь к точке. */
  focus: (coordinate: Coordinate) => void;
  /** Показать кружок «вы здесь» (нужно только карте на Leaflet). */
  setUserLocation: (coordinate: Coordinate) => void;
}

export interface MapSurfaceProps {
  markers: MapMarker[];
  theme: AppTheme;
  initialCoordinate: Coordinate;
  /** Масштаб: чем больше, тем ближе. 11 — город целиком. */
  initialZoom: number;
  showsUserLocation: boolean;
  /** Текущие координаты пользователя. null — ещё не определились. */
  userCoordinate: Coordinate | null;
  onReady: () => void;
  onLongPress: (coordinate: Coordinate) => void;
  onMarkerPress: (id: number) => void;
}
