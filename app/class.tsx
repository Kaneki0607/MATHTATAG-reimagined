import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { listenToData, readData } from '../lib/firebase-database';

export default function ClassScreen() {
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, number>>({});

  useEffect(() => {
    let unsubSections: (() => void) | null = null;
    let unsubStudents: (() => void) | null = null;

    const sanitizeClasses = (items: any[]) =>
      items.filter((c: any) => !(
        (String(c.name || '').trim().toLowerCase() === 'masikap') && ((c.status ?? 'active') === 'inactive')
      ));

    const boot = async () => {
      const [{ data: sections }, { data: students }] = [
        await readData('/sections'),
        await readData('/students'),
      ];
      const allClasses = sanitizeClasses(
        Object.entries(sections || {}).map(([id, v]: any) => ({ id, ...(v || {}) }))
      );
      setClasses(allClasses);
      const counts: Record<string, number> = {};
      Object.entries(students || {}).forEach(([id, v]: any) => {
        const s = { studentId: id, ...(v || {}) };
        counts[s.classId] = (counts[s.classId] || 0) + 1;
      });
      setStudentsByClass(counts);

      unsubSections = listenToData('/sections', (data) => {
        const cls = sanitizeClasses(
          Object.entries(data || {}).map(([id, v]: any) => ({ id, ...(v || {}) }))
        );
        setClasses(cls);
      });
      unsubStudents = listenToData('/students', (data) => {
        const countsLive: Record<string, number> = {};
        Object.entries(data || {}).forEach(([id, v]: any) => {
          const s = { studentId: id, ...(v || {}) };
          countsLive[s.classId] = (countsLive[s.classId] || 0) + 1;
        });
        setStudentsByClass(countsLive);
      });
    };

    boot();

    return () => {
      if (unsubSections) unsubSections();
      if (unsubStudents) unsubStudents();
    };
  }, []);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Classrooms</Text>

      {classes.map((c) => {
        const isInactive = (c.status ?? 'active') === 'inactive';
        const formatSY = (v?: string) => {
          if (!v) return '—';
          const s = String(v);
          return s.length === 4 ? `${s.slice(0, 2)}-${s.slice(2)}` : s;
        };

        return (
          <View key={c.id} style={styles.classCard}>
            <View style={styles.classHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.classIcon}><MaterialCommunityIcons name="account-group" size={18} color="#3b82f6" /></View>
                <Text style={styles.className}>{c.name}</Text>
              </View>
              <View style={[styles.statusPill, isInactive ? styles.inactivePill : styles.activePill]}>
                <Text style={styles.statusText}>{isInactive ? 'Inactive' : 'Active'}</Text>
              </View>
            </View>

            <Text style={styles.schoolText}>{c.schoolName || '—'}</Text>
            <Text style={styles.syText}>SY: {formatSY(c.schoolYear)}</Text>

            <View style={styles.quickRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{studentsByClass[c.id] || 0}</Text>
                <Text style={styles.statLabel}>Students</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{isInactive ? 'Locked' : 'Open'}</Text>
                <Text style={styles.statLabel}>Status</Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#ffffff' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  classCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  classHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  classIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  className: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  schoolText: { fontSize: 15, color: '#64748b', marginBottom: 2 },
  syText: { fontSize: 14, color: '#64748b', marginBottom: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  activePill: { backgroundColor: '#10b981' },
  inactivePill: { backgroundColor: '#ef4444' },
  quickRow: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  statDivider: { width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 12 },
});


