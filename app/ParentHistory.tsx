import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ParentHistory() {
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

  const ActivityItem = ({ score }: { score: string }) => (
    <View style={styles.activityCard}>
      <View style={styles.activityRow}>
        <View style={styles.activityIconBox}>
          <MaterialCommunityIcons name="cube-outline" size={22} color="#0ea5e9" />
        </View>
        <View style={styles.activityInfo}>
          <Text style={styles.activityTitle}>Subtraction Test</Text>
          <Text style={styles.activitySubtitle}>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreLabel}>Score:</Text>
          <Text style={styles.scoreValue}>{score}</Text>
        </View>
      </View>
      <View style={styles.activityMetaRow}>
        <View style={styles.datePill}>
          <MaterialIcons name="event" size={12} color="#111827" />
          <Text style={styles.dateText}>September 1, 2025</Text>
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

          <Text style={styles.sectionHeading}>Activity</Text>

          <View style={styles.filterTabs}>
            <Text style={[styles.filterTab, styles.filterTabActive]}>Week</Text>
            <Text style={styles.filterTab}>Month</Text>
            <Text style={styles.filterTab}>Quarter</Text>
          </View>

          <ActivityItem score="70%" />
          <ActivityItem score="80%" />
          <ActivityItem score="90%" />
          <ActivityItem score="75%" />
        </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.bottomNav, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/ParentDashboard')}>
          <MaterialIcons name="home" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/ParentTasks')}>
          <MaterialCommunityIcons name="clipboard-check" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItem, styles.activeNavItem]}>
          <MaterialCommunityIcons name="clock-outline" size={24} color="#000000" />
          <Text style={[styles.navText, styles.activeNavText]}>History</Text>
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
  filterTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterTab: {
    marginRight: 18,
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '700',
  },
  filterTabActive: {
    color: '#111827',
  },
  activityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  activitySubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  scorePill: {
    alignItems: 'flex-end',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10b981',
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateText: {
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


