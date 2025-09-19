import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width, height } = Dimensions.get('window');

export default function TeacherDashboard() {
  return (
    <View style={styles.container}>
      {/* Background Pattern */}
      <View style={styles.backgroundPattern} />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
         {/* Header Section */}
         <View style={styles.header}>
           <View style={styles.avatarContainer}>
             <View style={styles.avatar}>
               <MaterialIcons name="person" size={40} color="#4a5568" />
             </View>
           </View>
           <View style={styles.welcomeText}>
             <Text style={styles.welcomeLabel}>Welcome,</Text>
             <Text style={styles.welcomeTitle}>Teacher John</Text>
           </View>
         </View>

         {/* Make Announcement Card */}
         <View style={styles.announcementCard}>
           <View style={styles.announcementGradient}>
             <View style={styles.announcementHeader}>
               <View style={styles.megaphoneIcon}>
                 <MaterialCommunityIcons name="bullhorn" size={32} color="#e53e3e" />
               </View>
               <Text style={styles.announcementTitle}>Make Announcement</Text>
             </View>
             <Text style={styles.announcementText}>
               Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam fermentum vestibulum lectus, eget eleifend...
             </Text>
             <TouchableOpacity style={styles.editButton}>
               <AntDesign name="edit" size={20} color="#ffffff" />
             </TouchableOpacity>
           </View>
         </View>

         {/* Action Buttons */}
         <View style={styles.actionButtons}>
           <TouchableOpacity style={styles.actionCard}>
             <View style={styles.actionGradient1}>
               <View style={styles.actionIcon}>
                 <MaterialCommunityIcons name="book-open-variant" size={28} color="#3182ce" />
               </View>
               <Text style={styles.actionText}>Add Class</Text>
             </View>
           </TouchableOpacity>
           
           <TouchableOpacity style={styles.actionCard}>
             <View style={styles.actionGradient2}>
               <View style={styles.actionIcon}>
                 <MaterialCommunityIcons name="target" size={28} color="#38a169" />
               </View>
               <Text style={styles.actionText}>Add Exercise</Text>
             </View>
           </TouchableOpacity>
         </View>

         {/* Classrooms Section */}
         <View style={styles.classroomsSection}>
           <View style={styles.classroomCard}>
             <Text style={styles.sectionTitle}>Classrooms</Text>
             <View style={styles.classroomHeader}>
               <Text style={styles.classroomTitle}>Section Masikap</Text>
               <Text style={styles.classroomSubtitle}>Camohaguin Elementary School</Text>
               <Text style={styles.classroomYear}>SY: 25-26</Text>
             </View>
            
             {/* Analytics Section */}
             <View style={styles.analyticsContainer}>
               <View style={styles.analyticsHeader}>
                 <Text style={styles.analyticsTitle}>Performance Analytics</Text>
                 <TouchableOpacity style={styles.viewAllButton}>
                   <Text style={styles.viewAllText}>View All</Text>
                   <AntDesign name="arrow-right" size={14} color="#3b82f6" />
                 </TouchableOpacity>
               </View>
               
               {/* Analytics Cards */}
               <View style={styles.analyticsCards}>
                 <View style={styles.analyticsCard}>
                   <View style={styles.analyticsIcon}>
                     <MaterialCommunityIcons name="chart-line" size={24} color="#10b981" />
                   </View>
                   <View style={styles.analyticsContent}>
                     <Text style={styles.analyticsLabel}>Overall Performance</Text>
                     <Text style={styles.analyticsValue}>85%</Text>
                     <Text style={styles.analyticsChange}>+5% from last week</Text>
                   </View>
                 </View>
                 
                 <View style={styles.analyticsCard}>
                   <View style={styles.analyticsIcon}>
                     <MaterialCommunityIcons name="account-group" size={24} color="#3b82f6" />
                   </View>
                   <View style={styles.analyticsContent}>
                     <Text style={styles.analyticsLabel}>Active Students</Text>
                     <Text style={styles.analyticsValue}>24</Text>
                     <Text style={styles.analyticsChange}>All students engaged</Text>
                   </View>
                 </View>
               </View>
               
               {/* Quick Stats */}
               <View style={styles.quickStats}>
                 <View style={styles.statItem}>
                   <Text style={styles.statValue}>12</Text>
                   <Text style={styles.statLabel}>Assignments</Text>
                 </View>
                 <View style={styles.statDivider} />
                 <View style={styles.statItem}>
                   <Text style={styles.statValue}>8</Text>
                   <Text style={styles.statLabel}>Completed</Text>
                 </View>
                 <View style={styles.statDivider} />
                 <View style={styles.statItem}>
                   <Text style={styles.statValue}>4</Text>
                   <Text style={styles.statLabel}>Pending</Text>
                 </View>
               </View>
             </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={[styles.navItem, styles.activeNavItem]}>
          <AntDesign name="home" size={24} color="#000000" />
          <Text style={[styles.navText, styles.activeNavText]}>Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <MaterialIcons name="list" size={24} color="#9ca3af" />
          <Text style={styles.navText}>List</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <MaterialCommunityIcons name="account-group" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Class</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <MaterialCommunityIcons name="chart-bar" size={24} color="#9ca3af" />
          <Text style={styles.navText}>Reports</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8fafc',
    opacity: 0.1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeText: {
    flex: 1,
  },
  welcomeLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  
  // Announcement Card Styles
  announcementCard: {
    borderRadius: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  announcementGradient: {
    backgroundColor: '#f0f9ff',
    padding: 24,
    position: 'relative',
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  megaphoneIcon: {
    marginRight: 16,
  },
  announcementTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  announcementText: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 20,
  },
  editButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  
  // Action Buttons Styles
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  actionCard: {
    flex: 1,
    borderRadius: 20,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  actionGradient1: {
    backgroundColor: '#f0f9ff',
    padding: 24,
    alignItems: 'center',
  },
  actionGradient2: {
    backgroundColor: '#f8fafc',
    padding: 24,
    alignItems: 'center',
  },
  actionIcon: {
    marginBottom: 16,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  
  // Classrooms Section Styles
  classroomsSection: {
    marginBottom: 100, // Space for bottom nav
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 20,
  },
  classroomCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  classroomHeader: {
    marginBottom: 24,
  },
  classroomTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  classroomSubtitle: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  classroomYear: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  
  // Analytics Styles
  analyticsContainer: {
    marginTop: 20,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  analyticsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    marginRight: 4,
  },
  analyticsCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  analyticsCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  analyticsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  analyticsContent: {
    flex: 1,
  },
  analyticsLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  analyticsChange: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '500',
  },
  quickStats: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 16,
  },
  
  // Bottom Navigation Styles
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
  activeNavItem: {
    // Active state styling
  },
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
