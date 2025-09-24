import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ParentDashboard() {
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

        <View style={styles.announcementSection}>
          <View style={styles.announcementHeader}>
            <Text style={styles.announcementTitle}>Announcement</Text>
            <TouchableOpacity style={styles.seeAllButton}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.announcementCard}>
            <View style={styles.teacherProfile}>
              <View style={styles.teacherAvatar}>
                <MaterialIcons name="person" size={24} color="#64748b" />
              </View>
              <View style={styles.teacherInfo}>
                <Text style={styles.teacherName}>Mrs. Loteriña</Text>
                <Text style={styles.teacherRole}>Grade 1 Teacher</Text>
              </View>
              <TouchableOpacity style={styles.flagButton}>
                <MaterialIcons name="flag" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.announcementContent}>
              <View style={styles.announcementIcon}>
                <View style={styles.pinkIcon}>
                  <AntDesign name="plus" size={16} color="#ffffff" />
                </View>
                <Text style={styles.announcementTitleText}>Lorem ipsum</Text>
              </View>
              <Text style={styles.announcementDescription}>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam fermentum vestibulum lectus, eget eleifend tellus dignissim non. Praesent ultrices faucibus condimentum.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.studentProfileSection}>
          <Text style={styles.studentProfileTitle}>Overview Student Profile</Text>

          <View style={styles.studentProfileCard}>
            <View style={styles.studentHeader}>
              <View style={styles.studentAvatar}>
                <MaterialIcons name="person" size={28} color="#64748b" />
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>Ken Cas</Text>
                <Text style={styles.studentId}>ID: Jbfwwhqwrh8</Text>
                <Text style={styles.studentGrade}>Grade 1 Mabait</Text>
              </View>
              <View style={styles.awardIcon}>
                <MaterialCommunityIcons name="medal" size={24} color="#fbbf24" />
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressCircle}>
                <Text style={styles.progressText}>58%</Text>
              </View>
              <Text style={styles.progressDescription}>58% of Quarter 2 activities completed</Text>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <View style={styles.metricIcon}>
                  <MaterialCommunityIcons name="bookshelf" size={24} color="#3b82f6" />
                </View>
                <Text style={styles.metricText}>85% Overall Average</Text>
              </View>

              <View style={styles.metricCard}>
                <View style={styles.metricIcon}>
                  <MaterialCommunityIcons name="dice-2" size={24} color="#8b5cf6" />
                </View>
                <Text style={styles.metricText}>Last Played: Subtraction Game</Text>
              </View>

              <View style={styles.metricCard}>
                <View style={styles.metricIcon}>
                  <MaterialIcons name="star" size={24} color="#fbbf24" />
                </View>
                <Text style={styles.metricText}>Strongest Competency Patterns and Sequences</Text>
              </View>

              <View style={styles.metricCard}>
                <View style={styles.metricIcon}>
                  <MaterialIcons name="warning" size={24} color="#f59e0b" />
                </View>
                <Text style={styles.metricText}>Needs Improvement Subtraction with borrowing</Text>
              </View>
            </View>

            <View style={styles.feedbackCard}>
              <View style={styles.feedbackIcon}>
                <MaterialIcons name="info" size={20} color="#3b82f6" />
              </View>
              <Text style={styles.feedbackText}>
                This week, Lino improved in subtraction but struggled with fractions. Try practicing with real coins at home.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.bottomNav, { opacity: fadeAnim }] }>
        <TouchableOpacity style={[styles.navItem, styles.activeNavItem]}>
          <MaterialIcons name="home" size={24} color="#000000" />
          <Text style={[styles.navText, styles.activeNavText]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/ParentTasks')}>
          <MaterialCommunityIcons name="clipboard-check" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Trasks</Text>
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
    marginBottom: 24,
    paddingHorizontal: 0,
    paddingVertical: 12,
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
  announcementSection: {
    marginBottom: 24,
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  announcementTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  seeAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  seeAllText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  announcementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  teacherProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  teacherAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teacherInfo: {
    flex: 1,
  },
  teacherName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  teacherRole: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  flagButton: {
    padding: 8,
  },
  announcementContent: {
    marginTop: 8,
  },
  announcementIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pinkIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  announcementTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  announcementDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  studentProfileSection: {
    marginBottom: 100,
  },
  studentProfileTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  studentProfileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  studentAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f1f5f9',
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  studentId: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 2,
  },
  studentGrade: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  awardIcon: {
    padding: 8,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  progressCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  progressDescription: {
    flex: 1,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  metricsGrid: {
    marginBottom: 20,
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  metricIcon: {
    marginRight: 16,
  },
  metricText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  feedbackCard: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  feedbackIcon: {
    marginRight: 12,
  },
  feedbackText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
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