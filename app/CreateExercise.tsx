import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface Question {
  id: string;
  type: 'identification' | 'multiple-choice' | 'matching' | 're-order';
  question: string;
  answer: string | string[];
  options?: string[];
  pairs?: { left: string; right: string }[];
  order?: string[];
}

export default function CreateExercise() {
  const router = useRouter();
  const [exerciseTitle, setExerciseTitle] = useState('');
  const [exerciseDescription, setExerciseDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showQuestionTypeModal, setShowQuestionTypeModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [resourceFile, setResourceFile] = useState<{ name: string; uri: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const questionTypes = [
    {
      id: 'identification',
      title: 'Identification',
      description: 'Students identify the correct answer',
      icon: 'text-box',
      color: '#3b82f6',
    },
    {
      id: 'multiple-choice',
      title: 'Multiple Choice',
      description: 'Students choose from given options',
      icon: 'checkbox-marked-circle',
      color: '#10b981',
    },
    {
      id: 'matching',
      title: 'Matching',
      description: 'Students match items from two columns',
      icon: 'link-variant',
      color: '#f59e0b',
    },
    {
      id: 're-order',
      title: 'Re-order',
      description: 'Students arrange items in correct order',
      icon: 'sort',
      color: '#ef4444',
    },
  ];

  const addQuestion = (type: string) => {
    const newQuestion: Question = {
      id: Date.now().toString(),
      type: type as Question['type'],
      question: '',
      answer: type === 'multiple-choice' ? '' : type === 'matching' ? [] : type === 're-order' ? [] : '',
      options: type === 'multiple-choice' ? ['', '', '', ''] : undefined,
      pairs: type === 'matching' ? [{ left: '', right: '' }] : undefined,
      order: type === 're-order' ? [''] : undefined,
    };
    setQuestions([...questions, newQuestion]);
    setEditingQuestion(newQuestion);
    setShowQuestionTypeModal(false);
  };

  const updateQuestion = (questionId: string, updates: Partial<Question>) => {
    const updatedQuestions = questions.map(q => 
      q.id === questionId ? { ...q, ...updates } : q
    );
    setQuestions(updatedQuestions);
    
    // Update editingQuestion if it's the same question being edited
    if (editingQuestion && editingQuestion.id === questionId) {
      setEditingQuestion({ ...editingQuestion, ...updates });
    }
  };

  const deleteQuestion = (questionId: string) => {
    Alert.alert(
      'Delete Question',
      'Are you sure you want to delete this question?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => setQuestions(questions.filter(q => q.id !== questionId))
        },
      ]
    );
  };

  const saveExercise = async () => {
    if (!exerciseTitle.trim()) {
      Alert.alert('Error', 'Please enter an exercise title');
      return;
    }
    if (questions.length === 0) {
      Alert.alert('Error', 'Please add at least one question');
      return;
    }
    
    // Validate that all questions have content
    const incompleteQuestions = questions.filter(q => !q.question.trim());
    if (incompleteQuestions.length > 0) {
      Alert.alert('Error', 'Please complete all questions before saving');
      return;
    }
    
    // Validate multiple choice questions have options and correct answer
    const invalidMultipleChoice = questions.filter(q => 
      q.type === 'multiple-choice' && 
      (!q.options || q.options.some(opt => !opt.trim()) || !q.answer)
    );
    if (invalidMultipleChoice.length > 0) {
      Alert.alert('Error', 'Please complete all multiple choice options and select a correct answer');
      return;
    }
    
    // Validate identification questions have answers
    const invalidIdentification = questions.filter(q => 
      q.type === 'identification' && !q.answer
    );
    if (invalidIdentification.length > 0) {
      Alert.alert('Error', 'Please provide answers for all identification questions');
      return;
    }
    
    // Upload file if selected
    const uploadedUrl = await uploadResourceFile();

    // Here you would save to your database, including uploaded file URL if any
    const exercisePayload = {
      title: exerciseTitle.trim(),
      description: exerciseDescription.trim(),
      resourceUrl: uploadedUrl || null,
      questions,
      createdAt: new Date().toISOString(),
    };
    // TODO: write to Firebase Realtime DB or Firestore
    Alert.alert('Success', 'Exercise created successfully!', [
      { text: 'OK', onPress: () => router.push('/TeacherDashboard') }
    ]);
  };

  const pickResourceFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      setResourceFile({ name: asset.name || 'resource', uri: asset.uri });
    } catch (e) {
      Alert.alert('Error', 'Failed to pick a file');
    }
  };

  const uploadResourceFile = async (): Promise<string | null> => {
    if (!resourceFile) return null;
    try {
      setUploading(true);
      const fileInfo = await FileSystem.getInfoAsync(resourceFile.uri);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'Selected file not found');
        return null;
      }
      // If you want to upload to Firebase Storage, reuse uploadFile from lib/firebase-storage
      // For now we just return the local URI as placeholder
      return resourceFile.uri;
    } catch (e) {
      Alert.alert('Error', 'Failed to upload file');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const renderQuestionTypeModal = () => (
      <Modal
        visible={showQuestionTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuestionTypeModal(false)}
      >
      <View style={styles.questionTypeModalOverlay}>
        <View style={styles.questionTypeModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Question Type</Text>
            <TouchableOpacity onPress={() => setShowQuestionTypeModal(false)}>
              <AntDesign name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.questionTypesList}>
            {questionTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={styles.questionTypeCard}
                onPress={() => addQuestion(type.id)}
              >
                <View style={[styles.questionTypeIcon, { backgroundColor: type.color }]}>
                  <MaterialCommunityIcons name={type.icon as any} size={24} color="#ffffff" />
                </View>
                <View style={styles.questionTypeInfo}>
                  <Text style={styles.questionTypeTitle}>{type.title}</Text>
                  <Text style={styles.questionTypeDescription}>{type.description}</Text>
                </View>
                <AntDesign name="right" size={16} color="#64748b" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderQuestionEditor = () => {
    if (!editingQuestion) return null;

    return (
      <Modal
        visible={!!editingQuestion}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingQuestion(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit {questionTypes.find(t => t.id === editingQuestion.type)?.title} Question
              </Text>
              <TouchableOpacity onPress={() => setEditingQuestion(null)}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.questionEditor}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Question</Text>
                <TextInput
                  style={styles.textInput}
                  value={editingQuestion.question}
                  onChangeText={(text) => updateQuestion(editingQuestion.id, { question: text })}
                  placeholder="Enter your math question..."
                  multiline
                  textAlignVertical="top"
                  autoFocus={true}
                />
              </View>

              {editingQuestion.type === 'identification' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Correct Answer</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editingQuestion.answer as string}
                    onChangeText={(text) => updateQuestion(editingQuestion.id, { answer: text })}
                    placeholder="Enter the correct answer..."
                    autoFocus={false}
                  />
                </View>
              )}

              {editingQuestion.type === 'multiple-choice' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Answer Options</Text>
                  {(editingQuestion.options || []).map((option, index) => (
                    <View key={index} style={styles.optionRow}>
                      <Text style={styles.optionLabel}>{String.fromCharCode(65 + index)}.</Text>
                      <TextInput
                        style={styles.optionInput}
                        value={option}
                        onChangeText={(text) => {
                          const newOptions = [...(editingQuestion.options || [])];
                          newOptions[index] = text;
                          updateQuestion(editingQuestion.id, { options: newOptions });
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                      />
                      {(editingQuestion.options || []).length > 2 && (
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => {
                            const newOptions = (editingQuestion.options || []).filter((_, i) => i !== index);
                            updateQuestion(editingQuestion.id, { options: newOptions });
                          }}
                        >
                          <AntDesign name="close" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                      const newOptions = [...(editingQuestion.options || []), ''];
                      updateQuestion(editingQuestion.id, { options: newOptions });
                    }}
                  >
                    <AntDesign name="plus" size={16} color="#3b82f6" />
                    <Text style={styles.addButtonText}>Add Option</Text>
                  </TouchableOpacity>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Correct Answer (A, B, C, or D)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={editingQuestion.answer as string}
                      onChangeText={(text) => updateQuestion(editingQuestion.id, { answer: text.toUpperCase() })}
                      placeholder="A"
                      maxLength={1}
                    />
                  </View>
                </View>
              )}

              {editingQuestion.type === 'matching' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Matching Pairs</Text>
                  {(editingQuestion.pairs || []).map((pair, index) => (
                    <View key={index} style={styles.matchingRow}>
                      <TextInput
                        style={styles.matchingInput}
                        value={pair.left}
                        onChangeText={(text) => {
                          const newPairs = [...(editingQuestion.pairs || [])];
                          newPairs[index] = { ...pair, left: text };
                          updateQuestion(editingQuestion.id, { pairs: newPairs });
                        }}
                        placeholder="Left item"
                      />
                      <MaterialCommunityIcons name="arrow-right" size={20} color="#64748b" />
                      <TextInput
                        style={styles.matchingInput}
                        value={pair.right}
                        onChangeText={(text) => {
                          const newPairs = [...(editingQuestion.pairs || [])];
                          newPairs[index] = { ...pair, right: text };
                          updateQuestion(editingQuestion.id, { pairs: newPairs });
                        }}
                        placeholder="Right item"
                      />
                      {(editingQuestion.pairs || []).length > 1 && (
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => {
                            const newPairs = (editingQuestion.pairs || []).filter((_, i) => i !== index);
                            updateQuestion(editingQuestion.id, { pairs: newPairs });
                          }}
                        >
                          <AntDesign name="close" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                      const newPairs = [...(editingQuestion.pairs || []), { left: '', right: '' }];
                      updateQuestion(editingQuestion.id, { pairs: newPairs });
                    }}
                  >
                    <AntDesign name="plus" size={16} color="#3b82f6" />
                    <Text style={styles.addButtonText}>Add Pair</Text>
                  </TouchableOpacity>
                </View>
              )}

              {editingQuestion.type === 're-order' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Items to Reorder</Text>
                  {(editingQuestion.order || []).map((item, index) => (
                    <View key={index} style={styles.orderRow}>
                      <Text style={styles.orderNumber}>{index + 1}.</Text>
                      <TextInput
                        style={styles.orderInput}
                        value={item}
                        onChangeText={(text) => {
                          const newOrder = [...(editingQuestion.order || [])];
                          newOrder[index] = text;
                          updateQuestion(editingQuestion.id, { order: newOrder });
                        }}
                        placeholder={`Item ${index + 1}`}
                      />
                      {(editingQuestion.order || []).length > 1 && (
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => {
                            const newOrder = (editingQuestion.order || []).filter((_, i) => i !== index);
                            updateQuestion(editingQuestion.id, { order: newOrder });
                          }}
                        >
                          <AntDesign name="close" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                      const newOrder = [...(editingQuestion.order || []), ''];
                      updateQuestion(editingQuestion.id, { order: newOrder });
                    }}
                  >
                    <AntDesign name="plus" size={16} color="#3b82f6" />
                    <Text style={styles.addButtonText}>Add Item</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setEditingQuestion(null)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => setEditingQuestion(null)}
                >
                  <Text style={styles.saveButtonText}>Save Question</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
       <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/TeacherDashboard')} style={styles.backButton}>
            <AntDesign name="arrow-left" size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Exercise</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Exercise Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercise Details</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.textInput}
              value={exerciseTitle}
              onChangeText={setExerciseTitle}
              placeholder="Enter exercise title..."
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={exerciseDescription}
              onChangeText={setExerciseDescription}
              placeholder="Enter exercise description..."
              multiline
              numberOfLines={3}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Attach Resource (optional)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity style={styles.pickFileButton} onPress={pickResourceFile}>
                <MaterialCommunityIcons name="paperclip" size={16} color="#ffffff" />
                <Text style={styles.pickFileButtonText}>{resourceFile ? 'Change File' : 'Pick File'}</Text>
              </TouchableOpacity>
              {resourceFile && (
                <Text style={styles.selectedFileName} numberOfLines={1}>{resourceFile.name}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Questions Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Questions ({questions.length})</Text>
            <TouchableOpacity
              style={styles.addQuestionButton}
              onPress={() => setShowQuestionTypeModal(true)}
            >
              <AntDesign name="plus" size={16} color="#ffffff" />
              <Text style={styles.addQuestionButtonText}>Add Question</Text>
            </TouchableOpacity>
          </View>

          {questions.map((question, index) => (
            <View key={question.id} style={styles.questionCard}>
              <View style={styles.questionHeader}>
                <View style={styles.questionInfo}>
                  <Text style={styles.questionNumber}>Q{index + 1}</Text>
                  <Text style={styles.questionType}>
                    {questionTypes.find(t => t.id === question.type)?.title}
                  </Text>
                </View>
                <View style={styles.questionActions}>
                  <TouchableOpacity
                    onPress={() => setEditingQuestion(question)}
                    style={styles.actionButton}
                  >
                    <AntDesign name="edit" size={16} color="#3b82f6" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteQuestion(question.id)}
                    style={styles.actionButton}
                  >
                    <AntDesign name="delete" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.questionPreview} numberOfLines={2}>
                {question.question || 'No question text entered'}
              </Text>
            </View>
          ))}

          {questions.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="help-circle-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>No questions added yet</Text>
              <Text style={styles.emptyStateSubtext}>Tap &quot;Add Question&quot; to get started</Text>
            </View>
          )}
        </View>

        {/* Save Button */}
        <View style={styles.saveSection}>
          <TouchableOpacity style={styles.saveExerciseButton} onPress={saveExercise}>
            <Text style={styles.saveExerciseButtonText}>{uploading ? 'Uploading...' : 'Create Exercise'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {renderQuestionTypeModal()}
      {renderQuestionEditor()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    marginBottom: 24,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  placeholder: {
    width: 40,
  },
  
  // Section Styles
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  
  // Input Styles
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    minHeight: 48,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  
  // Add Question Button
  addQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addQuestionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  
  // Question Card Styles
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  questionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  questionNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3b82f6',
    marginRight: 8,
  },
  questionType: {
    fontSize: 12,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  questionActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  questionPreview: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9ca3af',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  
  // Save Section
  saveSection: {
    paddingVertical: 20,
    marginBottom: 100, // Space for bottom navigation if needed
  },
  saveExerciseButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveExerciseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 500,
  },
  // Question Type Modal (Bottom Sheet Style)
  questionTypeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  questionTypeModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  
  // Question Types
  questionTypesList: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  questionTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  questionTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  questionTypeInfo: {
    flex: 1,
  },
  questionTypeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  questionTypeDescription: {
    fontSize: 14,
    color: '#64748b',
  },
  
  // Question Editor
  questionEditor: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginRight: 12,
    width: 20,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
  },
  removeButton: {
    padding: 8,
    marginLeft: 8,
  },
  matchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchingInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
    marginHorizontal: 8,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginRight: 12,
    width: 20,
  },
  orderInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
  },
  addButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  
  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // File picker styles
  pickFileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 12,
  },
  pickFileButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  selectedFileName: {
    flex: 1,
    color: '#1e293b',
    fontSize: 14,
  },
});
