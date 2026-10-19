import { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { PlatformPressable } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';

/**
 * Кнопка вкладки с лёгкой вибрацией. На iOS добавляет тактильный отклик,
 * на остальных платформах работает как обычная кнопка.
 */
export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        // EXPO_OS, а не Platform.OS: Metro подставляет значение на этапе сборки,
        // и на не-iOS платформах ветка вырезается целиком — лишнего вызова не остаётся.
        if (process.env.EXPO_OS === 'ios') {
          // Вибрация при нажатии на вкладки
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        // Не глотаем onPressIn вызывающего: вибрация поверх логики нажатия.
        props.onPressIn?.(ev);
      }}
    />
  );
}
