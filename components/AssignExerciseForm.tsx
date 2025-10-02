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
  onAssign: (classIds: string[], deadline: string, acceptLateSubmissions: boolean) => void;
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

    onAssign(selectedClasses, deadline.toISOString(), acceptLateSubmissions);
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
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <AntDesign name="close" size={24} color="#64748b" />
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
                  >
                    <View style={styles.classInfo}>
                      <Text style={styles.className}>{classItem.name}</Text>
                      <Text style={styles.classDetails}>
                        {classItem.schoolName} • {classItem.schoolYear}
                      </Text>
                    </View>
                    <View style={styles.checkbox}>
                      {selectedClasses.includes(classItem.id) && (
                        <AntDesign name="check" size={20} color="#3b82f6" />
                      )}
                    </View>
                  </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Set Deadline</Text>
              <View style={styles.deadlineContainer}>
                {/* Date Selection */}
                <View style={styles.dateTimeButton}>
                  <MaterialCommunityIcons name="calendar" size={20} color="#3b82f6" />
                  <TextInput
                    style={styles.dateTimeText}
                    placeholder="MM/DD/YYYY"
                    value={deadlineDate}
                    onChangeText={handleDateChange}
                  />
                </View>

                {/* Time Selection */}
                <View style={[styles.dateTimeButton, { marginTop: 8 }]}>
                  <MaterialCommunityIcons name="clock" size={20} color="#3b82f6" />
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
                  size={16} 
                  color="#3b82f6" 
                />
                <Text style={styles.statusInfoText}>
                  Exercises will be open for submissions by default. You can close or reactivate them later from the Assignments tab.
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    height: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fafbfc',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  exerciseInfo: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  exerciseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  section: {
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  classesList: {
    marginTop: 8,
  },
  deadlineContainer: {
    marginTop: 8,
  },
  quickDateOptions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  quickDateButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  quickDateText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  classItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  classDetails: {
    fontSize: 14,
    color: '#64748b',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 12,
  },
  currentDeadlineDisplay: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  currentDeadlineLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  currentDeadlineText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#fafbfc',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  assignButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    gap: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  assignButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  assignButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  
  // Submission Settings Styles
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  
  // Toggle Switch Styles
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1d5db',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#3b82f6',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  
  // Status Info Styles
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
    backgroundColor: '#eff6ff',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  statusInfoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#1e40af',
  },
});
