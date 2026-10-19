import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { MapSurfaceHandle, MapSurfaceProps } from '@/components/map-surface.types';
import type { AppTheme } from '@/constants/Colors';
import type { Coordinate, MapMarker } from '@/types';

/**
 * Карта для Android.
 *
 * Встроенная карта Google в Expo Go остаётся пустой: у Expo Go нет действующего ключа
 * Google Maps, и без него не рисуются ни тайлы, ни сторонние слои. Задание при этом
 * рассчитано на Expo Go без ключей, поэтому карта собрана на MapLibre GL внутри WebView.
 *
 * MapLibre — векторная карта: масштаб плавный, подписи не размываются, доступны поворот
 * и наклон. Стиль и данные берутся у OpenFreeMap (карта OpenStreetMap), ключи не нужны.
 *
 * Связь в обе стороны: страница шлёт события через postMessage, приложение вызывает
 * её функции через injectJavaScript.
 */

/** Стили OpenFreeMap. Тёмного среди них нет, поэтому в тёмной теме инвертируем полотно. */
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/positron';
const CANVAS_FILTER_DARK = 'invert(0.92) hue-rotate(180deg) brightness(1.08) contrast(0.95)';

/** Сообщения, которые страница присылает приложению. */
type BridgeMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'longpress'; latitude: number; longitude: number }
  | { type: 'marker'; id: string };

function buildHtml(theme: AppTheme, center: Coordinate, zoom: number, isDark: boolean): string {
  return HTML_TEMPLATE.replaceAll('__TINT__', theme.tint)
    .replaceAll('__ON_TINT__', theme.onTint)
    .replaceAll('__BG__', theme.background)
    .replace('__CANVAS_FILTER__', isDark ? CANVAS_FILTER_DARK : 'none')
    .replace('__STYLE__', isDark ? STYLE_DARK : STYLE_LIGHT)
    .replace('__LAT__', String(center.latitude))
    .replace('__LNG__', String(center.longitude))
    .replace('__ZOOM__', String(zoom));
}

const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(function MapSurface(
  { markers, theme, initialCoordinate, initialZoom, userCoordinate, onReady, onLongPress, onMarkerPress },
  ref,
) {
  const webRef = useRef<WebView>(null);
  // Тёмная тема узнаётся по цвету фона: он приходит из той же палитры.
  const isDark = theme.background === '#1A0B12';

  // Страницу собираем один раз: перезагрузка сбрасывала бы положение карты.
  const html = useMemo(
    () => buildHtml(theme, initialCoordinate, initialZoom, isDark),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.tint, theme.onTint, theme.background, isDark],
  );

  const run = useCallback((code: string) => {
    // true в конце обязателен: иначе Android ругается на возвращаемое значение.
    webRef.current?.injectJavaScript(`${code}; true;`);
  }, []);

  useImperativeHandle(ref, () => ({
    focus: (coordinate: Coordinate) => {
      run(`window.focusOn(${coordinate.latitude}, ${coordinate.longitude}, 15)`);
    },
    setUserLocation: (coordinate: Coordinate) => {
      run(`window.setUserLocation(${coordinate.latitude}, ${coordinate.longitude})`);
    },
  }));

  // В страницу отдаём только нужное ей: координаты, название и число фотографий.
  const sendMarkers = useCallback(
    (items: MapMarker[]) => {
      const payload = items.map((marker) => ({
        id: marker.id,
        title: marker.title,
        latitude: marker.latitude,
        longitude: marker.longitude,
        images: marker.imageCount,
      }));
      run(`window.setMarkers && window.setMarkers(${JSON.stringify(payload)})`);
    },
    [run],
  );

  const onMessage = (event: WebViewMessageEvent) => {
    let message: BridgeMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as BridgeMessage;
    } catch (error: unknown) {
      console.warn('Непонятное сообщение от карты', error);
      return;
    }

    if (message.type === 'ready') {
      // Метки отправляем только после готовности страницы.
      sendMarkers(markers);
      onReady();
      return;
    }
    if (message.type === 'error') {
      console.warn('Ошибка внутри карты', message.message);
      return;
    }
    if (message.type === 'longpress') {
      onLongPress({ latitude: message.latitude, longitude: message.longitude });
      return;
    }
    if (message.type === 'marker') {
      // Из страницы id приходит строкой (он подставлен в onclick), в базе это число.
      onMarkerPress(Number(message.id));
    }
  };

  // Список мест поменялся — обновляем метки на странице.
  useEffect(() => {
    sendMarkers(markers);
  }, [markers, sendMarkers]);

  // Каждое обновление координат пользователя двигает точку на карте.
  useEffect(() => {
    if (userCoordinate) {
      run(`window.setUserLocation(${userCoordinate.latitude}, ${userCoordinate.longitude})`);
    }
  }, [userCoordinate, run]);

  return (
    <WebView
      ref={webRef}
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      // Карту двигают пальцем — лишние полосы прокрутки не нужны.
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onError={(event) => console.warn('Карта не загрузилась', event.nativeEvent)}
    />
  );
});

export default MapSurface;

/** Разметка страницы с картой. Плейсхолдеры __ИМЯ__ подставляются в buildHtml. */
const HTML_TEMPLATE = String.raw`<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.0.0/maplibre-gl.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.0.0/maplibre-gl.js"></script>
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; background: __BG__; }
      /* В тёмной теме инвертируем только полотно карты: метки и подписи поверх него не меняются. */
      .maplibregl-canvas { filter: __CANVAS_FILTER__; }
      .heart { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35)); cursor: pointer; }
      .maplibregl-popup-content {
        padding: 10px 12px; border-radius: 12px;
        font: 14px -apple-system, Roboto, sans-serif;
      }
      .popup-title { font-weight: 600; color: #3A1020; }
      .popup-sub { color: #8A5A6D; font-size: 13px; margin-top: 2px; }
      .popup-open {
        margin-top: 8px; display: inline-block; padding: 6px 12px; border: 0; border-radius: 10px;
        background: __TINT__; color: __ON_TINT__; font-size: 13px; font-weight: 600;
      }
      .user-dot {
        width: 16px; height: 16px; border-radius: 8px;
        background: __TINT__; border: 2px solid #ffffff;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      // Сообщения в приложение уходят через мост WebView.
      function post(message) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }

      var map = new maplibregl.Map({
        container: 'map',
        style: '__STYLE__',
        center: [__LNG__, __LAT__],
        zoom: __ZOOM__,
        attributionControl: { compact: true },
      });

      map.on('load', function () {
        post({ type: 'ready' });
      });

      map.on('error', function (event) {
        post({ type: 'error', message: String((event && event.error && event.error.message) || 'unknown') });
      });

      // Долгого нажатия в MapLibre нет — собираем его сами из касаний.
      var pressTimer = null;
      var pressStart = null;
      var pressMoved = false;
      var canvas = map.getCanvasContainer();

      canvas.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1) {
          return;
        }
        var touch = event.touches[0];
        pressMoved = false;
        pressStart = { x: touch.clientX, y: touch.clientY };
        pressTimer = setTimeout(function () {
          if (pressMoved || !pressStart) {
            return;
          }
          var rect = canvas.getBoundingClientRect();
          // unproject переводит точку экрана в координаты на земле.
          var point = map.unproject([pressStart.x - rect.left, pressStart.y - rect.top]);
          post({ type: 'longpress', latitude: point.lat, longitude: point.lng });
        }, 550);
      }, { passive: true });

      canvas.addEventListener('touchmove', function (event) {
        var touch = event.touches[0];
        if (!pressStart || !touch) {
          return;
        }
        // Палец поехал — это перетаскивание карты, а не долгое нажатие.
        if (Math.abs(touch.clientX - pressStart.x) > 12 || Math.abs(touch.clientY - pressStart.y) > 12) {
          pressMoved = true;
          clearTimeout(pressTimer);
        }
      }, { passive: true });

      ['touchend', 'touchcancel'].forEach(function (name) {
        canvas.addEventListener(name, function () {
          clearTimeout(pressTimer);
        }, { passive: true });
      });

      function heartElement(filled) {
        var fill = filled ? '__TINT__' : 'rgba(255,255,255,0.75)';
        var element = document.createElement('div');
        element.className = 'heart';
        element.innerHTML =
          '<svg viewBox="0 0 24 24" width="38" height="38">' +
          '<path d="M12 21s-7.5-4.7-9.6-9.2C.8 8.4 3 4.8 6.6 4.8c2 0 3.4 1.1 4.2 2.3L12 8.6l1.2-1.5c.8-1.2 2.2-2.3 4.2-2.3 3.6 0 5.8 3.6 4.2 7C19.5 16.3 12 21 12 21z"' +
          ' fill="' + fill + '" stroke="__TINT__" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        return element;
      }

      var markerObjects = [];
      var userMarker = null;

      // Приложение вызывает эту функцию при каждом изменении списка мест.
      window.setMarkers = function (markers) {
        markerObjects.forEach(function (marker) {
          marker.remove();
        });
        markerObjects = [];

        markers.forEach(function (item) {
          var subtitle = item.images > 0 ? 'Фотографий: ' + item.images : 'Фотографий пока нет';
          var popupHtml =
            '<div class="popup-title">' + escapeHtml(item.title) + '</div>' +
            '<div class="popup-sub">' + subtitle + '</div>' +
            '<button class="popup-open" onclick="openMarker(&quot;' + item.id + '&quot;)">Открыть</button>';

          var marker = new maplibregl.Marker({ element: heartElement(item.images > 0), anchor: 'bottom' })
            .setLngLat([item.longitude, item.latitude])
            .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(popupHtml))
            .addTo(map);
          markerObjects.push(marker);
        });
      };

      window.openMarker = function (id) {
        post({ type: 'marker', id: id });
      };

      window.focusOn = function (latitude, longitude, zoom) {
        map.flyTo({ center: [longitude, latitude], zoom: zoom || 15, speed: 1.4 });
      };

      window.setUserLocation = function (latitude, longitude) {
        if (userMarker) {
          userMarker.setLngLat([longitude, latitude]);
          return;
        }
        var dot = document.createElement('div');
        dot.className = 'user-dot';
        userMarker = new maplibregl.Marker({ element: dot }).setLngLat([longitude, latitude]).addTo(map);
      };

      function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (char) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
      }
    </script>
  </body>
</html>
`;
