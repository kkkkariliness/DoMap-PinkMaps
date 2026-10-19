// Первым: фильтр предупреждений должен заработать раньше импорта expo-notifications.
import '@/lib/logbox';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { DatabaseProvider } from '@/contexts/DatabaseContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { initNotifications } from '@/services/notifications';

// Не прячем заставку, пока не загрузятся шрифты.
SplashScreen.preventAutoHideAsync();
// Уведомления показываются и при открытом приложении; оставшиеся с прошлого запуска не дублируются.
initNotifications();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    // Провайдер базы выше навигации: и карта, и список, и экран места
    // работают с одним соединением и одним списком маркеров.
    <DatabaseProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="marker/[id]" options={{ title: 'Место' }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </DatabaseProvider>
  );
}