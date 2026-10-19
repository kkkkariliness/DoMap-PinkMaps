import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tabIconSelected,
        tabBarInactiveTintColor: theme.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Карта',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="markers"
        options={{
          title: 'Места',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="heart.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
