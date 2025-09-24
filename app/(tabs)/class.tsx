import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { readData } from '../../lib/firebase-database';

export default function ClassTab() {
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: sections }, { data: students }] = [
          await readData('/sections'),
          await readData('/students'),
        ];
        const cls = Object.entries(sections || {})
          .map(([id, v]: any) => ({ id, ...(v || {}) }));
        const counts: Record<string, number> = {};
        Object.entries(students || {}).forEach(([id, v]: any) => {
          const s = { studentId: id, ...(v || {}) };
          counts[s.classId] = (counts[s.classId] || 0) + 1;
        });
        setClasses(cls);
        setStudentsByClass(counts);
      } catch {
        setClasses([]);
        setStudentsByClass({});
      }
    };
    load();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Classes</Text>
      {classes.map((c) => (
        <View key={c.id} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.className}>{c.name}</Text>
            <Text style={[styles.status, (c.status ?? 'active') === 'inactive' ? styles.inactive : styles.active]}>
              {(c.status ?? 'active') === 'inactive' ? 'Inactive' : 'Active'}
            </Text>
          </View>
          <Text style={styles.meta}>School: {c.schoolName || '—'}</Text>
          <Text style={styles.meta}>SY: {c.schoolYear || '—'}</Text>
          <Text style={styles.meta}>Students: {studentsByClass[c.id] || 0}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  className: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  status: { fontSize: 12, fontWeight: '700' },
  active: { color: '#10b981' },
  inactive: { color: '#ef4444' },
  meta: { color: '#475569', marginTop: 2 },
});


