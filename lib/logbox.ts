import { LogBox } from 'react-native';

// expo-notifications в Expo Go всегда предупреждает, что push-уведомления недоступны.
// Приложению нужны только локальные уведомления, они в Expo Go работают — прячем эти плашки
// с экрана (в логе Metro предупреждения остаются).
// Отдельный модуль: импортируется в app/_layout.tsx первым, раньше самого expo-notifications,
// иначе предупреждение, выведенное при импорте, проскочило бы до настройки фильтра.
LogBox.ignoreLogs([
  '[expo-notifications] Push notifications (remote notifications) are unavailable in Expo Go',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);
