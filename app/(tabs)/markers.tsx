import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MarkerList from '@/components/MarkerList';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

/** Вкладка со списком сохранённых мест. */
export default function MarkersScreen() {
  const theme = Colors[useColorScheme() ?? 'light'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.title, { color: theme.text }]}>Места</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        Нажмите на место, чтобы открыть фотографии. Долгое нажатие — удалить.
      </Text>
      <MarkerList />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 30, fontWeight: '700', paddingHorizontal: 20, paddingTop: 20,},
  subtitle: { fontSize: 14, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
});
