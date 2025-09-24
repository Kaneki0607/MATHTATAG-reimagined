import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { readData } from '../../lib/firebase-database';

export default function ListTab() {
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  const [parentsById, setParentsById] = useState<Record<string, any>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: sections }, { data: students }, { data: parents }] = [
          await readData('/sections'),
          await readData('/students'),
          await readData('/parents'),
        ];
        const cls = Object.entries(sections || {})
          .map(([id, v]: any) => ({ id, ...(v || {}) }))
          .filter((c) => (c.status ?? 'active') !== 'inactive');
        const grouped: Record<string, any[]> = {};
        Object.entries(students || {}).forEach(([id, v]: any) => {
          const s = { studentId: id, ...(v || {}) };
          if (!grouped[s.classId]) grouped[s.classId] = [];
          grouped[s.classId].push(s);
        });
        const parentsMap: Record<string, any> = Object.entries(parents || {}).reduce((acc: any, [id, v]: any) => {
          acc[id] = { id, ...(v || {}) };
          return acc;
        }, {});
        setClasses(cls);
        setStudentsByClass(grouped);
        setParentsById(parentsMap);
      } catch {
        setClasses([]);
        setStudentsByClass({});
        setParentsById({});
      }
    };
    load();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Student Lists</Text>
      {classes.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.className}>{c.name}</Text>
          {(studentsByClass[c.id] || []).length === 0 ? (
            <Text style={styles.empty}>No students yet.</Text>
          ) : (
            (studentsByClass[c.id] || []).map((s) => (
              <View key={s.studentId} style={styles.row}>
                <Text style={styles.studentName}>{s.nickname}{s.gender ? ` (${s.gender === 'male' ? 'M' : 'F'})` : ''}</Text>
                <Text style={styles.loginCode}>{parentsById[s.parentId]?.loginCode || '—'}</Text>
              </View>
            ))
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  className: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  studentName: { color: '#111827', fontSize: 14 },
  loginCode: { color: '#2563eb', fontWeight: '600' },
  empty: { color: '#64748b' },
});


