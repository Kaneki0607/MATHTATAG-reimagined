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
  onAssign: (classIds: string[], deadline: string) => void;
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
  const [deadlineText, setDeadlineText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && currentUserId) {
      setClasses([]); // Reset classes first
      setSelectedClasses([]); // Reset selected classes
      loadClasses();
      // Set default deadline to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDeadline(tomorrow);
      setDeadlineText(tomorrow.toISOString().slice(0, 16)); // Format: YYYY-MM-DDTHH:MM
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

  const handleDateTextChange = (text: string) => {
    setDeadlineText(text);
    const date = new Date(text);
    if (!isNaN(date.getTime())) {
      setDeadline(date);
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

    onAssign(selectedClasses, deadline.toISOString());
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
                <View style={styles.dateInputContainer}>
                  <MaterialCommunityIcons name="calendar-clock" size={20} color="#3b82f6" />
                  <TextInput
                    style={styles.dateInput}
                    value={deadlineText}
                    onChangeText={handleDateTextChange}
                    placeholder="2024-12-25 14:30"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <Text style={styles.dateHint}>
                  Format: YYYY-MM-DD HH:MM (e.g., 2024-12-25 14:30)
                </Text>
                <View style={styles.quickDateOptions}>
                  <TouchableOpacity 
                    style={styles.quickDateButton}
                    onPress={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      setDeadline(tomorrow);
                      setDeadlineText(tomorrow.toISOString().slice(0, 16));
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
                      setDeadlineText(nextWeek.toISOString().slice(0, 16));
                    }}
                  >
                    <Text style={styles.quickDateText}>Next Week</Text>
                  </TouchableOpacity>
                </View>
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
});
