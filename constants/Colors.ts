/**
 * Розовая тема приложения — светлая и тёмная.
 *
 */

const pinkLight = '#C2185B'; // насыщенная фуксия: и фон кнопок, и акцентный текст на светлом
const pinkDark = '#FF9EC0'; // светлый розовый: читается на тёмном фоне

export const Colors = {
  light: {
    text: '#3A1020', // тёмная слива вместо чёрного — мягче с розовым
    textMuted: '#8A5A6D', // подписи и координаты
    background: '#FFF5F8', // почти белый с розовым оттенком
    surface: '#FBE4EC', // карточки и плитки
    border: '#F2C6D6',
    tint: pinkLight,
    onTint: '#FFFFFF', // текст на розовой кнопке
    danger: '#B3261E',
    icon: '#8A5A6D',
    tabIconDefault: '#B98098',
    tabIconSelected: pinkLight,
  },
  dark: {
    text: '#FDE7EF',
    textMuted: '#C9A0B1',
    background: '#1A0B12',
    surface: '#2C1421',
    border: '#482634',
    tint: pinkDark,
    onTint: '#2A0A17', // тёмный текст на светло-розовой кнопке
    danger: '#FF8A80',
    icon: '#C9A0B1',
    tabIconDefault: '#9C7183',
    tabIconSelected: pinkDark,
  },
};

/** Тип одной темы — удобно передавать в компоненты. */
export type AppTheme = typeof Colors.light;
