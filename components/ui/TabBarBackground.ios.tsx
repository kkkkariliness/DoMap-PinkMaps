import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Размытый фон панели вкладок для iOS.
 * На Android этот файл не подключается — там используется обычный фон цвета темы.
 */
export default function BlurTabBarBackground() {
  return (
    <BlurView
      // systemChromeMaterial сам подстраивается под тему системы и совпадает
      // с нативной панелью вкладок iOS: менять цвета вручную не нужно.
      tint="systemChromeMaterial"
      intensity={100}
      style={StyleSheet.absoluteFill}
    />
  );
}

/**
 * Насколько панель вкладок выступает над безопасной областью.
 * Нужно экранам с прокруткой: контент не должен уезжать под панель,
 * но и лишний отступ над home-индикатором не нужен.
 */
export function useBottomTabOverflow() {
  const tabHeight = useBottomTabBarHeight();
  const { bottom } = useSafeAreaInsets();
  return tabHeight - bottom;
}
