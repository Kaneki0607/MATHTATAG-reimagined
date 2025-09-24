import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { readData } from '../lib/firebase-database';

export default function ListScreen() {
  const handleCopy = async (code?: string) => {
    if (!code) return;
    try {
      // Prefer native clipboard when available (dynamic require to avoid bundling errors)
      let Clipboard: any = null;
      try { Clipboard = require('expo-clipboard'); } catch {}
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(String(code));
        Alert.alert('Copied', 'Parent code copied to clipboard');
        return;
      }
      // Fallback to web clipboard if available
      const anyGlobal: any = global as any;
      const nav = anyGlobal?.navigator;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(String(code));
        Alert.alert('Copied', 'Parent code copied to clipboard');
        return;
      }
    } catch {}
    // Last resort: show the code so the user can copy manually
    Alert.alert('Parent Code', String(code));
  };
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  const [parentsById, setParentsById] = useState<Record<string, any>>({});
  const [searchByClass, setSearchByClass] = useState<Record<string, string>>({});

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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Student Lists</Text>
      {classes.map((c) => {
        const formatSY = (v?: string) => {
          if (!v) return '—';
          const s = String(v);
          return s.length === 4 ? `${s.slice(0, 2)}-${s.slice(2)}` : s;
        };
        const list = studentsByClass[c.id] || [];
        const q = (searchByClass[c.id] || '').trim().toLowerCase();
        const filtered = q
          ? list.filter((s: any) => (
              (s.nickname || '').toLowerCase().includes(q) ||
              (parentsById[s.parentId]?.loginCode || '').toLowerCase().includes(q)
            ))
          : list;
        return (
          <View key={c.id} style={styles.classCard}>
            <View style={styles.classHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.classIcon}><MaterialCommunityIcons name="account-group" size={18} color="#3b82f6" /></View>
                <Text style={styles.className}>{c.name}</Text>
              </View>
              <View style={styles.countPill}><Text style={styles.countText}>{filtered.length}</Text></View>
            </View>
            <Text style={styles.schoolText}>{c.schoolName || '—'}</Text>
            <Text style={styles.syText}>SY: {formatSY(c.schoolYear)}</Text>
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                value={searchByClass[c.id] || ''}
                onChangeText={(v) => setSearchByClass((prev) => ({ ...prev, [c.id]: v }))}
                placeholder="Search by nickname or parent code"
                placeholderTextColor="#6b7280"
              />
            </View>
            <View style={styles.listWrap}>
              {filtered.length === 0 ? (
                <Text style={styles.empty}>No students yet.</Text>
              ) : (
                <ScrollView style={styles.listInner} nestedScrollEnabled showsVerticalScrollIndicator>
                  {filtered.map((s: any) => (
                    <View key={s.studentId} style={styles.row}>
                      <Text style={styles.studentName}>{s.nickname}{s.gender ? ` (${s.gender === 'male' ? 'M' : 'F'})` : ''}</Text>
                      <TouchableOpacity
                        style={styles.codePill}
                        onPress={() => handleCopy(parentsById[s.parentId]?.loginCode)}
                      >
                        <Text style={styles.codeText}>{parentsById[s.parentId]?.loginCode || '—'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
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
  countPill: { backgroundColor: '#10b981', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  listWrap: { borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 12, backgroundColor: '#ffffff' },
  listInner: { maxHeight: 220 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  studentName: { color: '#111827', fontSize: 14 },
  codePill: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  codeText: { color: '#2563eb', fontWeight: '700', fontSize: 12 },
  empty: { color: '#64748b', padding: 12 },
  searchWrap: { marginBottom: 10 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 14,
  },
});


