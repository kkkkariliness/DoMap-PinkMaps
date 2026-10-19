/**
 * Общие типы приложения.
 *
 * Отдельный файл нужен, чтобы экраны, компоненты и слой базы данных описывали
 * одни и те же данные одинаково: маркер на карте и прикреплённые к нему фотографии.
 */

import type { LocationError } from '@/services/location';

/** Точка на карте. */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/** Одна фотография, прикреплённая к маркеру (строка таблицы marker_images). */
export interface MarkerImage {
  id: number;
  markerId: number;
  /** Путь к файлу внутри папки приложения (file://...). */
  uri: string;
  /** Время добавления, миллисекунды. */
  createdAt: number;
}

/**
 * Маркер на карте (строка таблицы markers) и сводка по его фотографиям.
 *
 * Сами фотографии в список не входят: карте и списку мест хватает количества и превью,
 * а полный набор читает только экран места.
 */
export interface MapMarker extends Coordinate {
  id: number;
  title: string;
  /** Время создания, миллисекунды. */
  createdAt: number;
  imageCount: number;
  /** Последняя добавленная фотография — для превью в списке. */
  previewUri: string | null;
}

/** Параметры маршрута экрана деталей: app/marker/[id].tsx */
export interface MarkerDetailsParams {
  id: string;
  [key: string]: string;
}

/** Состояние отслеживания местоположения. */
export interface LocationState {
  coordinate: Coordinate | null;
  /** Почему местоположение недоступно; null — ошибки нет. */
  error: LocationError | null;
  isTracking: boolean;
}

/** Уведомление, которое сейчас активно для метки. */
export interface ActiveNotification {
  markerId: number;
  notificationId: string;
  timestamp: number;
}
