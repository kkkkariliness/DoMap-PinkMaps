import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

/**
 * Иконка из набора SF Symbols (iOS). Обёртка нужна, чтобы у всех иконок в приложении
 * были одинаковыми: размер, цвет, вес.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      // Без scaleAspectFit иконка может обрезаться по краям в заданном квадрате.
      resizeMode="scaleAspectFit"
      name={name}
      // Размеры идут первыми, переданный style — вторым: вызывающий код
      // может переопределить их, если понадобится.
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
