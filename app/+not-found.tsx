import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

/** Экран для несуществующих адресов. */
export default function NotFoundScreen() {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <>
      <Stack.Screen options={{ title: 'Страница не найдена' }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Такого экрана нет</Text>
        <Link href="/" style={[styles.link, { color: theme.tint }]}>
          Вернуться к карте
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  link: { fontSize: 16, paddingVertical: 12 },
});
