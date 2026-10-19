import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Тема оформления: только 'light' или 'dark'.
 *
 * React Native может вернуть ещё 'unspecified' (система не сообщила тему) —
 * для словаря цветов это светлая тема.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
