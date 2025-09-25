import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ParentTasks() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateAnim]);

  const TaskCard = () => (
    <View style={styles.taskCard}>
      <View style={styles.taskRow}>
        <View style={styles.taskIconBox}>
          <MaterialCommunityIcons name="cube-outline" size={22} color="#0ea5e9" />
        </View>
        <View style={styles.taskInfo}>
          <Text style={styles.taskTitle}>Subtraction Test</Text>
          <Text style={styles.taskSubtitle}>Lorem ipsum dolor sit amet,</Text>
        </View>
        <TouchableOpacity style={styles.playButton}>
          <AntDesign name="play" size={16} color="#111827" />
        </TouchableOpacity>
      </View>
      <View style={styles.taskMetaRow}>
        <View style={styles.duePill}>
          <MaterialIcons name="event" size={12} color="#111827" />
          <Text style={styles.dueText}>Due Sept. 21</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateAnim }] }}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.welcomeText}>
            <Text style={styles.welcomeLabel}>Welcome,</Text>
            <Text style={styles.welcomeTitle}>PARENT108756090030</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>To Do List</Text>

        <View style={styles.weekCard}>
          <View style={styles.weekHeaderRow}>
            <Text style={styles.weekLabel}>This Week:</Text>
            <Text style={styles.weekProgressText}>5 of 8 activities completed</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={styles.progressBarFill} />
          </View>

          <View style={styles.dateTabsRow}>
            <Text style={[styles.dateTab, styles.dateTabActive]}>09/20/25</Text>
            <Text style={styles.dateTab}>09/20/25</Text>
            <Text style={styles.dateTab}>09/20/25</Text>
          </View>

          <TaskCard />
          <TaskCard />
          <TaskCard />
          <TaskCard />
        </View>
      </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.bottomNav, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/ParentDashboard')}>
          <MaterialIcons name="home" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, styles.activeNavItem]}>
          <MaterialCommunityIcons name="clipboard-check" size={24} color="#000000" />
          <Text style={[styles.navText, styles.activeNavText]}>Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/ParentHistory')}>
          <MaterialCommunityIcons name="clock-outline" size={24} color="#9ca3af" />
          <Text style={styles.navText}>History</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8fafc',
    opacity: 0.8,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 16,
  },
  welcomeText: {
    flex: 1,
  },
  welcomeLabel: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  weekCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  weekLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  weekProgressText: {
    fontSize: 12,
    color: '#111827',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    width: '62%',
    height: '100%',
    backgroundColor: '#22d3ee',
  },
  dateTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateTab: {
    marginRight: 18,
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '700',
  },
  dateTabActive: {
    color: '#111827',
  },
  taskCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  taskSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  playButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dueText: {
    marginLeft: 6,
    fontSize: 10,
    color: '#111827',
    fontWeight: '700',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeNavItem: {},
  navText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
    fontWeight: '500',
  },
  activeNavText: {
    color: '#1e293b',
    fontWeight: '700',
  },
});


