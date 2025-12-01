/**
 * ID Management Panel Component
 * 
 * Admin interface for managing the readable ID system.
 * Can be integrated into AdminDashboard or SuperAdminDashboard.
 * 
 * Features:
 * - Initialize ID counters
 * - Verify current ID state
 * - Run migrations (with safety checks)
 * - View ID statistics
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { readData, writeData } from '../lib/firebase-database';
import { EntityType, parseId } from '../lib/id-generator';

interface IDStats {
  entityType: string;
  total: number;
  readable: number;
  legacy: number;
  readablePercent: number;
}

export default function IdManagementPanel() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<IDStats[]>([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const showMessage = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const analyzeIds = async () => {
    setLoading(true);
    showMessage('Analyzing database IDs...', 'info');
    
    try {
      const entities = [
        { type: 'Parents', path: '/parents' },
        { type: 'Teachers', path: '/teachers' },
        { type: 'Classes', path: '/classes' },
        { type: 'Students', path: '/students' },
        { type: 'Exercises', path: '/exercises' },
        { type: 'Assigned', path: '/assignedExercises' },
        { type: 'Results', path: '/ExerciseResults' },
      ];

      const results: IDStats[] = [];

      for (const entity of entities) {
        const data = await readData(entity.path);
        
        if (!data.data) {
          results.push({
            entityType: entity.type,
            total: 0,
            readable: 0,
            legacy: 0,
            readablePercent: 0
          });
          continue;
        }

        const ids = Object.keys(data.data);
        const total = ids.length;
        
        let readable = 0;
        let legacy = 0;

        ids.forEach(id => {
          const parsed = parseId(id);
          // New format: PREFIX-XXX-XXXX (e.g., T-ABA-0001)
          if (parsed.isValid && id.match(/^[A-Z]-[A-Z]{3}-[0-9]{4}$/)) {
            readable++;
          } else if (parsed.isValid && id.match(/^[A-Z]+-([A-Z]+-)?[0-9]{4}$/)) {
            // Old readable format still counts
            readable++;
          } else {
            legacy++;
          }
        });

        results.push({
          entityType: entity.type,
          total,
          readable,
          legacy,
          readablePercent: total > 0 ? Math.round((readable / total) * 100) : 0
        });
      }

      setStats(results);
      showMessage('Analysis complete', 'success');
    } catch (error) {
      console.error('Failed to analyze IDs:', error);
      showMessage('Failed to analyze IDs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const initializeCounters = async () => {
    Alert.alert(
      'Initialize ID Counters',
      'This will set up the counter system in Firebase. Safe to run multiple times.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Initialize',
          onPress: async () => {
            setLoading(true);
            showMessage('Initializing counters...', 'info');

            try {
              const entityTypes: EntityType[] = [
                'PARENT', 'TEACHER', 'CLASS', 'STUDENT', 
                'EXERCISE', 'ASSIGNED', 'RESULT', 
                'ANNOUNCEMENT', 'TASK'
              ];

              const paths: Record<EntityType, string> = {
                'PARENT': '/parents',
                'TEACHER': '/teachers',
                'CLASS': '/classes',
                'STUDENT': '/students',
                'EXERCISE': '/exercises',
                'ASSIGNED': '/assignedExercises',
                'RESULT': '/ExerciseResults',
                'ANNOUNCEMENT': '/announcements',
                'TASK': '/tasks',
                'QUESTION': '/questions',
                'ADMIN': '/admins'
              };

              let initialized = 0;

              for (const type of entityTypes) {
                const path = paths[type];
                if (!path) continue;

                const data = await readData(path);
                let highestNumber = 0;

                if (data.data) {
                  const ids = Object.keys(data.data);
                  const numbers = ids
                    .map(id => parseId(id).number)
                    .filter(num => num > 0);
                  
                  if (numbers.length > 0) {
                    highestNumber = Math.max(...numbers);
                  }
                }

                await writeData(`/system/idCounters/${type}`, {
                  count: highestNumber,
                  lastUpdated: new Date().toISOString(),
                  initializedAt: new Date().toISOString()
                });

                initialized++;
              }

              showMessage(`✅ Initialized ${initialized} counters`, 'success');
              Alert.alert('Success', `ID counters initialized successfully!\n\n${initialized} entity types configured.`);
            } catch (error) {
              console.error('Failed to initialize counters:', error);
              showMessage('Failed to initialize counters', 'error');
              Alert.alert('Error', 'Failed to initialize counters. Check console for details.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const getTotalStats = () => {
    const totals = stats.reduce(
      (acc, stat) => ({
        total: acc.total + stat.total,
        readable: acc.readable + stat.readable,
        legacy: acc.legacy + stat.legacy
      }),
      { total: 0, readable: 0, legacy: 0 }
    );

    return {
      ...totals,
      readablePercent: totals.total > 0 ? Math.round((totals.readable / totals.total) * 100) : 0
    };
  };

  const totalStats = getTotalStats();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="database-cog" size={32} color="#3b82f6" />
        <Text style={styles.title}>Readable ID System</Text>
      </View>

      {message ? (
        <View style={[
          styles.messageBox,
          messageType === 'success' && styles.messageSuccess,
          messageType === 'error' && styles.messageError,
          messageType === 'info' && styles.messageInfo
        ]}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.button}
          onPress={analyzeIds}
          disabled={loading}
        >
          <MaterialCommunityIcons name="magnify" size={20} color="#ffffff" />
          <Text style={styles.buttonText}>Analyze IDs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={initializeCounters}
          disabled={loading}
        >
          <MaterialCommunityIcons name="counter" size={20} color="#ffffff" />
          <Text style={styles.buttonText}>Initialize Counters</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      ) : stats.length > 0 ? (
        <ScrollView style={styles.statsContainer}>
          <View style={styles.totalStats}>
            <Text style={styles.totalStatsTitle}>Overall Statistics</Text>
            <View style={styles.totalStatsRow}>
              <View style={styles.totalStatItem}>
                <Text style={styles.totalStatValue}>{totalStats.total}</Text>
                <Text style={styles.totalStatLabel}>Total Records</Text>
              </View>
              <View style={styles.totalStatItem}>
                <Text style={[styles.totalStatValue, styles.successText]}>
                  {totalStats.readable}
                </Text>
                <Text style={styles.totalStatLabel}>Readable IDs</Text>
              </View>
              <View style={styles.totalStatItem}>
                <Text style={[styles.totalStatValue, styles.warningText]}>
                  {totalStats.legacy}
                </Text>
                <Text style={styles.totalStatLabel}>Legacy IDs</Text>
              </View>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${totalStats.readablePercent}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {totalStats.readablePercent}% Migrated
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Entity Details</Text>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={styles.statTitle}>{stat.entityType}</Text>
                <View style={[
                  styles.badge,
                  stat.legacy === 0 ? styles.badgeSuccess : styles.badgeWarning
                ]}>
                  <Text style={styles.badgeText}>
                    {stat.readablePercent}%
                  </Text>
                </View>
              </View>
              <View style={styles.statDetails}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total:</Text>
                  <Text style={styles.statValue}>{stat.total}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Readable:</Text>
                  <Text style={[styles.statValue, styles.successText]}>
                    {stat.readable}
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Legacy:</Text>
                  <Text style={[styles.statValue, styles.warningText]}>
                    {stat.legacy}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="database-search" size={64} color="#cbd5e1" />
          <Text style={styles.emptyText}>Click "Analyze IDs" to see statistics</Text>
        </View>
      )}

      <View style={styles.infoBox}>
        <MaterialCommunityIcons name="information" size={20} color="#3b82f6" />
        <Text style={styles.infoText}>
          New records automatically use readable IDs. Initialize counters before creating new entities.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
  },
  messageBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  messageSuccess: {
    backgroundColor: '#dcfce7',
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  messageError: {
    backgroundColor: '#fef2f2',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  messageInfo: {
    backgroundColor: '#eff6ff',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  messageText: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonSecondary: {
    backgroundColor: '#10b981',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  statsContainer: {
    flex: 1,
  },
  totalStats: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  totalStatsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  totalStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  totalStatItem: {
    alignItems: 'center',
  },
  totalStatValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  totalStatLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  progressBar: {
    height: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  statDetails: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  successText: {
    color: '#10b981',
  },
  warningText: {
    color: '#f59e0b',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 18,
  },
});

