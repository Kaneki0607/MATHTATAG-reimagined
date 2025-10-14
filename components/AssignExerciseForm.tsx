import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { readData } from '../lib/firebase-database';

interface Class {
  id: string;
  name: string;
  schoolName: string;
  schoolYear: string;
  status: string;
  teacherId: string;
  createdAt: string;
}

interface AssignExerciseFormProps {
  visible: boolean;
  onClose: () => void;
  onAssign: (classIds: string[], deadline: string, acceptLateSubmissions: boolean, quarter: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4') => void;
  exerciseTitle: string;
  currentUserId: string | null;
}

export const AssignExerciseForm: React.FC<AssignExerciseFormProps> = ({
  visible,
  onClose,
  onAssign,
  exerciseTitle,
  currentUserId,
}) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(new Date());
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptLateSubmissions, setAcceptLateSubmissions] = useState(true);
  const [selectedQuarter, setSelectedQuarter] = useState<'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4'>('Quarter 1');

  useEffect(() => {
    if (visible && currentUserId) {
      setClasses([]); // Reset classes first
      setSelectedClasses([]); // Reset selected classes
      loadClasses();
      // Set default deadline to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDeadline(tomorrow);
      setDeadlineDate(tomorrow.toLocaleDateString('en-US')); // Format: MM/DD/YYYY
      setDeadlineTime(tomorrow.toLocaleTimeString('en-US', { hour12: true })); // Format: HH:MM AM/PM
    }
  }, [visible, currentUserId]);

  const loadClasses = async () => {
    try {
      setLoading(true);
      const { data } = await readData('/sections');
      const classList = Object.entries(data || {})
        .map(([id, section]: any) => ({
          id,
          ...section,
        }))
        .filter((section: any) => section.teacherId === currentUserId);
      
      setClasses(classList);
    } catch (error) {
      console.error('Error loading classes:', error);
      Alert.alert('Error', 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const toggleClassSelection = (classId: string) => {
    setSelectedClasses(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  const handleDateChange = (text: string) => {
    setDeadlineDate(text);
    updateDeadlineFromInputs(text, deadlineTime);
  };

  const handleTimeChange = (text: string) => {
    setDeadlineTime(text);
    updateDeadlineFromInputs(deadlineDate, text);
  };

  const updateDeadlineFromInputs = (dateText: string, timeText: string) => {
    // Parse date (MM/DD/YYYY format)
    const dateParts = dateText.split('/');
    if (dateParts.length === 3) {
      const month = parseInt(dateParts[0]) - 1;
      const day = parseInt(dateParts[1]);
      const year = parseInt(dateParts[2]);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        // Parse time (HH:MM AM/PM format)
        const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const ampm = timeMatch[3].toUpperCase();
          
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          
          const newDeadline = new Date(year, month, day, hours, minutes);
          if (!isNaN(newDeadline.getTime())) {
            setDeadline(newDeadline);
          }
        }
      }
    }
  };

  const handleAssign = () => {
    if (selectedClasses.length === 0) {
      Alert.alert('Error', 'Please select at least one class');
      return;
    }

    if (deadline <= new Date()) {
      Alert.alert('Error', 'Deadline must be in the future');
      return;
    }

    onAssign(selectedClasses, deadline.toISOString(), acceptLateSubmissions, selectedQuarter);
    onClose();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Assign Exercise</Text>
            <TouchableOpacity 
              onPress={onClose} 
              style={styles.closeButton}
              activeOpacity={0.7}
            >
              <AntDesign name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.exerciseInfo}>
              <Text style={styles.exerciseTitle}>{exerciseTitle}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Classes</Text>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading classes...</Text>
                </View>
              ) : classes.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="school-outline" size={48} color="#9ca3af" />
                  <Text style={styles.emptyText}>No classes available</Text>
                  <Text style={styles.emptySubtext}>Create a class first to assign exercises</Text>
                </View>
              ) : (
                <View style={styles.classesList}>
                  {classes.map((classItem) => (
                  <TouchableOpacity
                    key={classItem.id}
                    style={[
                      styles.classItem,
                      selectedClasses.includes(classItem.id) && styles.classItemSelected,
                    ]}
                    onPress={() => toggleClassSelection(classItem.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.classInfo}>
                      <Text style={styles.className}>{classItem.name}</Text>
                      <Text style={styles.classDetails}>
                        {classItem.schoolName} • {classItem.schoolYear}
                      </Text>
                    </View>
                    <View style={[
                      styles.checkbox,
                      selectedClasses.includes(classItem.id) && {
                        backgroundColor: '#0ea5e9',
                        borderColor: '#0ea5e9',
                      }
                    ]}>
                      {selectedClasses.includes(classItem.id) && (
                        <AntDesign name="check" size={18} color="#ffffff" />
                      )}
                    </View>
                  </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Quarter</Text>
              <View style={styles.quarterContainer}>
                {(['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'] as const).map((quarter) => (
                  <TouchableOpacity
                    key={quarter}
                    style={[
                      styles.quarterButton,
                      selectedQuarter === quarter && styles.quarterButtonSelected,
                    ]}
                    onPress={() => setSelectedQuarter(quarter)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.quarterButtonText,
                        selectedQuarter === quarter && styles.quarterButtonTextSelected,
                      ]}
                    >
                      {quarter}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Set Deadline</Text>
              <View style={styles.deadlineContainer}>
                {/* Date Selection */}
                <View style={styles.dateTimeButton}>
                  <MaterialCommunityIcons name="calendar" size={22} color="#0ea5e9" />
                  <TextInput
                    style={styles.dateTimeText}
                    placeholder="MM/DD/YYYY"
                    value={deadlineDate}
                    onChangeText={handleDateChange}
                  />
                </View>

                {/* Time Selection */}
                <View style={[styles.dateTimeButton, { marginTop: 12 }]}>
                  <MaterialCommunityIcons name="clock" size={22} color="#0ea5e9" />
                  <TextInput
                    style={styles.dateTimeText}
                    placeholder="HH:MM AM/PM"
                    value={deadlineTime}
                    onChangeText={handleTimeChange}
                  />
                </View>

                {/* Current Deadline Display */}
                {deadline && (
                  <View style={styles.currentDeadlineDisplay}>
                    <Text style={styles.currentDeadlineLabel}>Deadline Preview:</Text>
                    <Text style={styles.currentDeadlineText}>
                      {formatDate(deadline)}
                    </Text>
                  </View>
                )}

                <View style={styles.quickDateOptions}>
                  <TouchableOpacity 
                    style={styles.quickDateButton}
                    onPress={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      setDeadline(tomorrow);
                      setDeadlineDate(tomorrow.toLocaleDateString('en-US'));
                      setDeadlineTime(tomorrow.toLocaleTimeString('en-US', { hour12: true }));
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickDateText}>Tomorrow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.quickDateButton}
                    onPress={() => {
                      const nextWeek = new Date();
                      nextWeek.setDate(nextWeek.getDate() + 7);
                      setDeadline(nextWeek);
                      setDeadlineDate(nextWeek.toLocaleDateString('en-US'));
                      setDeadlineTime(nextWeek.toLocaleTimeString('en-US', { hour12: true }));
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickDateText}>Next Week</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Submission Settings</Text>
              
              {/* Accept Late Submissions */}
              <TouchableOpacity 
                style={styles.settingItem}
                onPress={() => setAcceptLateSubmissions(!acceptLateSubmissions)}
                activeOpacity={0.7}
              >
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Accept Late Submissions</Text>
                  <Text style={styles.settingDescription}>
                    Allow students to submit after the deadline
                  </Text>
                </View>
                <View style={[
                  styles.toggle,
                  acceptLateSubmissions && styles.toggleActive
                ]}>
                  <View style={[
                    styles.toggleThumb,
                    acceptLateSubmissions && styles.toggleThumbActive
                  ]} />
                </View>
              </TouchableOpacity>

              {/* Info about status control */}
              <View style={styles.statusInfo}>
                <MaterialCommunityIcons 
                  name="information" 
                  size={18} 
                  color="#0ea5e9" 
                />
                <Text style={styles.statusInfoText}>
                  Exercises will be open for submissions by default. You can close or reactivate them later from the Assignments tab.
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onClose}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close" size={20} color="#64748b" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.assignButton,
                selectedClasses.length === 0 && styles.assignButtonDisabled,
              ]}
              onPress={handleAssign}
              disabled={selectedClasses.length === 0}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="send" size={20} color="#ffffff" />
              <Text style={styles.assignButtonText}>
                Assign to {selectedClasses.length} {selectedClasses.length === 1 ? 'Class' : 'Classes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 580,
    maxHeight: '98%',
    minHeight: 600,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  exerciseInfo: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    marginVertical: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  exerciseTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 24,
  },
  section: {
    paddingVertical: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  emptySubtext: {
    fontSize: 15,
    color: '#9ca3af',
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },
  classesList: {
    marginTop: 8,
  },
  deadlineContainer: {
    marginTop: 12,
  },
  quickDateOptions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  quickDateButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  quickDateText: {
    fontSize: 15,
    color: '#0ea5e9',
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  classItemSelected: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    transform: [{ scale: 1.02 }],
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  classDetails: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 12,
  },
  dateHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // Date/Time Button Styles (matching edit assignment modal)
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    marginLeft: 12,
    fontWeight: '600',
  },
  currentDeadlineDisplay: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0ea5e9',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  currentDeadlineLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 6,
    letterSpacing: -0.1,
  },
  currentDeadlineText: {
    fontSize: 15,
    color: '#0369a1',
    fontWeight: '600',
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 16,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: -0.1,
  },
  assignButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#0ea5e9',
    gap: 8,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  assignButtonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  assignButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.1,
  },
  
  // Submission Settings Styles
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  settingInfo: {
    flex: 1,
    marginRight: 20,
  },
  settingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  settingDescription: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    fontWeight: '500',
  },
  
  // Toggle Switch Styles
  toggle: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#d1d5db',
    padding: 3,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleActive: {
    backgroundColor: '#0ea5e9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  
  // Status Info Styles
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 12,
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 4,
    borderLeftColor: '#0ea5e9',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  statusInfoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#0369a1',
    fontWeight: '500',
  },
  
  // Quarter Selection Styles
  quarterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  quarterButton: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '48%',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quarterButtonSelected: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    transform: [{ scale: 1.02 }],
  },
  quarterButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  quarterButtonTextSelected: {
    color: '#0ea5e9',
    fontWeight: '800',
  },
});
