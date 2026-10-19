import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Скобки в имени папки (tabs) — группа маршрутов Expo Router: она задаёт общий
// макет с вкладками, но не входит в адрес экранов. Адрес карты — «/».
export default function TabLayout() {
  // useColorScheme вернёт 'light' или 'dark'; на всякий случай подстраховываемся.
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <Tabs
      screenOptions={{
        // Активная вкладка — розовая, неактивная — приглушённая: обе из палитры темы.
        tabBarActiveTintColor: theme.tabIconSelected,
        tabBarInactiveTintColor: theme.tabIconDefault,
        // У каждого экрана свой заголовок — общая шапка от Tabs не нужна.
        headerShown: false,
        // Кнопка вкладки с лёгкой вибрацией на нажатие.
        tabBarButton: HapticTab,
        // Фон панели: на iOS — размытие поверх контента, на Android — цвет темы.
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Прозрачный фон на iOS, чтобы был виден эффект размытия.
            position: 'absolute',
          },
          // На Android панель вкладок красим в цвет карточек темы.
          default: { backgroundColor: theme.surface, borderTopColor: theme.border },
        }),
      }}>
      {/* index.tsx — маршрут «/», экран карты. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Карта',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      {/* markers.tsx — маршрут «/markers», список сохранённых мест. */}
      <Tabs.Screen
        name="markers"
        options={{
          title: 'Места',
          // Сердечко — та же метка, что и на карте.
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="heart.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}