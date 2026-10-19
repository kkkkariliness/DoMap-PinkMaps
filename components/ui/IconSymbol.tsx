// Запасной вариант иконок для Android и веба: SF Symbols есть только на iOS,
// поэтому здесь тот же компонент, но на MaterialIcons.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import React from 'react';
import { OpaqueColorValue, StyleProp, TextStyle } from 'react-native';

// Соответствие имён SF Symbols именам MaterialIcons.
// Имена SF Symbols смотрим в приложении SF Symbols на Mac,
// имена MaterialIcons — на https://icons.expo.fyi.
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  // Иконки вкладок DoMap.
  'map.fill': 'map',
  'heart.fill': 'favorite',
  // Partial — потому что замаплены не все SF Symbols, а только те, что нужны приложению.
} as Partial<
  Record<
    import('expo-symbols').SFSymbol,
    React.ComponentProps<typeof MaterialIcons>['name']
  >
>;

// Вместо SFSymbol в пропсах — только те имена, для которых есть MaterialIcons-пара.
// Так опечатка в name всплывает на этапе компиляции, а не даёт пустую иконку в рантайме.
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Иконка: на iOS — нативная SF Symbol, на Android и в вебе — MaterialIcons.
 * Один интерфейс на обе платформы, оптимальный расход ресурсов.
 *
 * Имена в `name` — из SF Symbols; для Android и веба они вручную
 * сопоставлены с MaterialIcons в MAPPING выше.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  // MaterialIcons рисует иконку шрифтом, поэтому стиль здесь текстовый, а не блочный.
  style?: StyleProp<TextStyle>;
  // weight принимаем ради совместимости с iOS-версией, но MaterialIcons его не поддерживает —
  // толщина иконки задаётся самим шрифтом и здесь не настраивается.
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
