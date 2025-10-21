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
  onAssign: (classIds: string[], deadline: string, acceptLateSubmissions: boolean, quarter: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4', targetStudentIds?: string[]) => void;
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
  const [targetStudentIdsByClass, setTargetStudentIdsByClass] = useState<Record<string, string[]>>({});
  const [studentsByClass, setStudentsByClass] = useState<Record<string, Array<{ studentId: string; firstName?: string; surname?: string; fullName?: string; gender?: string }>>>({});
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
      const [{ data: classesData }, { data: sectionsData }, { data: studentsData }] = await Promise.all([
        readData('/classes'),
        readData('/sections'),
        readData('/students')
      ]);

      const classList = Object.entries(classesData || {})
        .map(([id, cls]: any) => {
          const extras = (sectionsData || {})[id] || {};
          return {
            id,
            ...cls,
            // merge in status/school info from sections if present
            status: cls.status ?? extras.status ?? 'active',
            schoolName: cls.schoolName ?? extras.schoolName,
            schoolYear: cls.schoolYear ?? extras.schoolYear,
          };
        })
        .filter((section: any) => section.teacherId === currentUserId)
        .filter((section: any) => {
          const status = String(section.status || '').toLowerCase();
          return status !== 'closed' && status !== 'inactive';
        });
      
      setClasses(classList);

      // Group students by class for selection UI
      const grouped: Record<string, any[]> = {};
      Object.values(studentsData || {}).forEach((s: any) => {
        const cid = String(s.classId || '');
        if (!cid) return;
        if (!grouped[cid]) grouped[cid] = [];
        grouped[cid].push(s);
      });
      setStudentsByClass(grouped);
    } catch (error) {
      console.error('Error loading classes:', error);
      Alert.alert('Error', 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const toggleClassSelection = (classId: string) => {
    setSelectedClasses(prev => {
      const isSelected = prev.includes(classId);
      const next = isSelected ? prev.filter(id => id !== classId) : [...prev, classId];
      // When selecting a class, auto-select all its students by default
      if (!isSelected) {
        const allStudents = (studentsByClass[classId] || []).map((s: any) => s.studentId || s.id);
        setTargetStudentIdsByClass(curr => ({ ...curr, [classId]: allStudents }));
      }
      return next;
    });
  };

  const toggleStudentSelection = (classId: string, studentId: string) => {
    setTargetStudentIdsByClass(prev => {
      const current = prev[classId] || [];
      const next = current.includes(studentId)
        ? current.filter(id => id !== studentId)
        : [...current, studentId];
      return { ...prev, [classId]: next };
    });
  };

  const formatStudentName = (s: any) => {
    const last = (s.surname || '').trim();
    const first = (s.firstName || '').trim();
    if (last && first) return `${last}, ${first}`;
    if (s.fullName) return String(s.fullName);
    return 'Unknown';
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

    // If any class has student selections, pass the union of selected students for that class.
    // The assign handler applies same target set to all selected classes (UI is simple first pass).
    const allSelectedTargets = selectedClasses.flatMap(cid => (targetStudentIdsByClass[cid] || []).filter(Boolean));
    const uniqueTargets = Array.from(new Set(allSelectedTargets)).filter(id => typeof id === 'string' && id.length > 0);
    
    onAssign(selectedClasses, deadline.toISOString(), acceptLateSubmissions, selectedQuarter, uniqueTargets.length > 0 ? uniqueTargets : undefined);
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
              <AntDesign name="close" size={18} color="#64748b" />
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
                  <MaterialCommunityIcons name="school-outline" size={40} color="#9ca3af" />
                  <Text style={styles.emptyText}>No classes available</Text>
                  <Text style={styles.emptySubtext}>Create a class first to assign exercises</Text>
                </View>
              ) : (
                <View style={styles.classesList}>
                  {classes.map((classItem) => (
                    <View key={classItem.id} style={{ marginBottom: 10 }}>
                      <TouchableOpacity
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
                            <AntDesign name="check" size={14} color="#ffffff" />
                          )}
                        </View>
                      </TouchableOpacity>

                      {selectedClasses.includes(classItem.id) && (
                        <View style={{ marginTop: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10 }}>
                          <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>Select Students (optional)</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <TouchableOpacity onPress={() => {
                                const allIds = (studentsByClass[classItem.id] || []).map((s: any) => s.studentId || s.id);
                                const selected = targetStudentIdsByClass[classItem.id] || [];
                                const next = selected.length === 0 ? allIds : [];
                                setTargetStudentIdsByClass(prev => ({ ...prev, [classItem.id]: next }));
                              }}>
                                <Text style={{ fontSize: 12, color: '#0ea5e9', fontWeight: '700' }}>
                                  {(targetStudentIdsByClass[classItem.id] || []).length === 0 ? 'Select All' : 'Unselect All'}
                                </Text>
                              </TouchableOpacity>
                              <Text style={{ fontSize: 12, color: '#64748b' }}>{(targetStudentIdsByClass[classItem.id] || []).length} selected</Text>
                            </View>
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                            {[...(studentsByClass[classItem.id] || [])]
                              .sort((a: any, b: any) => {
                                const ga = String(a.gender || '').toLowerCase() === 'female' ? 1 : 0;
                                const gb = String(b.gender || '').toLowerCase() === 'female' ? 1 : 0;
                                if (ga !== gb) return ga - gb; // male(0) first
                                const na = `${(a.surname || '').toLowerCase()} ${(a.firstName || '').toLowerCase()}`;
                                const nb = `${(b.surname || '').toLowerCase()} ${(b.firstName || '').toLowerCase()}`;
                                return na.localeCompare(nb);
                              })
                              .map((s: any) => {
                                const id = s.studentId || s.id;
                                const selected = (targetStudentIdsByClass[classItem.id] || []).includes(id);
                                return (
                                  <TouchableOpacity key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, backgroundColor: selected ? '#eff6ff' : 'transparent' }} onPress={() => toggleStudentSelection(classItem.id, id)}>
                                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: selected ? '#0ea5e9' : '#d1d5db', backgroundColor: selected ? '#0ea5e9' : '#ffffff', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                      {selected && <AntDesign name="check" size={12} color="#ffffff" />}
                                    </View>
                                    <Text style={{ flex: 1, color: '#0f172a' }}>{formatStudentName(s)}</Text>
                                    <Text style={{ color: '#64748b', fontSize: 12, width: 60, textAlign: 'right' }}>{String(s.gender || '').toLowerCase() === 'female' ? 'Female' : 'Male'}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            {(studentsByClass[classItem.id] || []).length === 0 && (
                              <Text style={{ color: '#9ca3af', paddingHorizontal: 8, paddingVertical: 6 }}>No students in this class.</Text>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
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
                  <MaterialCommunityIcons name="calendar" size={18} color="#0ea5e9" />
                  <TextInput
                    style={styles.dateTimeText}
                    placeholder="MM/DD/YYYY"
                    value={deadlineDate}
                    onChangeText={handleDateChange}
                  />
                </View>

                {/* Time Selection */}
                <View style={[styles.dateTimeButton, { marginTop: 10 }]}>
                  <MaterialCommunityIcons name="clock" size={18} color="#0ea5e9" />
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
                  size={16} 
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
              <MaterialCommunityIcons name="close" size={16} color="#64748b" />
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
              <MaterialCommunityIcons name="send" size={16} color="#ffffff" />
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
    borderRadius: 16,
    width: '100%',
    maxWidth: 560,
    maxHeight: '96%',
    minHeight: 500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  exerciseInfo: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  exerciseTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    lineHeight: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
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
    gap: 10,
  },
  quickDateButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  quickDateText: {
    fontSize: 13,
    color: '#0ea5e9',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  classItemSelected: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
    borderWidth: 2,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  classDetails: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  dateTimeText: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    marginLeft: 10,
    fontWeight: '600',
  },
  currentDeadlineDisplay: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  currentDeadlineLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 4,
    letterSpacing: -0.1,
  },
  currentDeadlineText: {
    fontSize: 13,
    color: '#0369a1',
    fontWeight: '600',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: -0.1,
  },
  assignButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
    gap: 6,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  assignButtonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  assignButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.1,
  },
  
  // Submission Settings Styles
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  settingInfo: {
    flex: 1,
    marginRight: 14,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  settingDescription: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    fontWeight: '500',
  },
  
  // Toggle Switch Styles
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1d5db',
    padding: 2,
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
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
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
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  statusInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#0369a1',
    fontWeight: '500',
  },
  
  // Quarter Selection Styles
  quarterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  quarterButton: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  quarterButtonSelected: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
    borderWidth: 2,
  },
  quarterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  quarterButtonTextSelected: {
    color: '#0ea5e9',
    fontWeight: '700',
  },
});