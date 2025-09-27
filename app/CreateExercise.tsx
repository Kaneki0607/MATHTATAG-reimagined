import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
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
  type: 'identification' | 'multiple-choice' | 'matching' | 're-order' | 'reading-passage';
  question: string;
  answer: string | string[];
  options?: string[];
  optionImages?: (string | null)[];
  pairs?: { left: string; right: string; leftImage?: string | null; rightImage?: string | null }[];
  order?: string[];
  passage?: string;
  subQuestions?: Omit<Question, 'subQuestions'>[];
  multiAnswer?: boolean;
  reorderDirection?: 'asc' | 'desc';
  questionImage?: string | null;
  fillSettings?: {
    caseSensitive: boolean;
    showBoxes: boolean;
    altAnswers?: string[];
    hint?: string;
    ignoreAccents?: boolean;
    allowShowWork?: boolean;
  };
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
  const [showFillSettings, setShowFillSettings] = useState(false);
  const [fillSettingsDraft, setFillSettingsDraft] = useState<NonNullable<Question['fillSettings']> | null>(null);
  
  // Stock image selection state
  const [showStockImageModal, setShowStockImageModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [stockImageContext, setStockImageContext] = useState<{
    questionId: string;
    optionIndex?: number;
    pairIndex?: number;
    side?: 'left' | 'right';
    type: 'question' | 'option' | 'pair';
  } | null>(null);
  

  const questionTypes = [
    {
      id: 'identification',
      title: 'Fill in the Blank',
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
    {
      id: 'reading-passage',
      title: 'Reading Passage',
      description: 'Provide a passage with related questions',
      icon: 'book-open-variant',
      color: '#8b5cf6',
    },
  ];

  // Stock image categories with actual image sources
  const stockImageCategories = [
    {
      id: 'animals',
      name: 'Animals',
      icon: 'paw',
      color: '#f59e0b',
      images: [
        { name: 'Bee', source: require('../assets/images/Animals/Bee.png') },
        { name: 'Black Cat', source: require('../assets/images/Animals/Black Cat.png') },
        { name: 'Bug', source: require('../assets/images/Animals/Bug.png') },
        { name: 'Butterfly', source: require('../assets/images/Animals/Butterfly.png') },
        { name: 'Cat', source: require('../assets/images/Animals/Cat.png') },
        { name: 'Cheetah', source: require('../assets/images/Animals/Cheetah.png') },
        { name: 'Chicken', source: require('../assets/images/Animals/Chicken.png') },
        { name: 'Cow', source: require('../assets/images/Animals/Cow.png') },
        { name: 'Deer', source: require('../assets/images/Animals/Deer.png') },
        { name: 'Dog', source: require('../assets/images/Animals/Dog.png') },
        { name: 'Elephant', source: require('../assets/images/Animals/Elephant.png') },
        { name: 'Fox', source: require('../assets/images/Animals/Fox.png') },
        { name: 'Frog', source: require('../assets/images/Animals/Frog.png') },
        { name: 'Giraffe', source: require('../assets/images/Animals/Giraffe.png') },
        { name: 'Hipo', source: require('../assets/images/Animals/Hipo.png') },
        { name: 'Horse', source: require('../assets/images/Animals/Horse.png') },
        { name: 'Koala', source: require('../assets/images/Animals/Koala.png') },
        { name: 'Lion', source: require('../assets/images/Animals/Lion.png') },
        { name: 'Monkey', source: require('../assets/images/Animals/Monkey.png') },
        { name: 'Owl', source: require('../assets/images/Animals/Owl.png') },
        { name: 'Panda', source: require('../assets/images/Animals/Panda.png') },
        { name: 'Parrot', source: require('../assets/images/Animals/Parrot.png') },
        { name: 'Penguin', source: require('../assets/images/Animals/Penguin.png') },
        { name: 'Pig', source: require('../assets/images/Animals/Pig.png') },
        { name: 'Rabbit', source: require('../assets/images/Animals/Rabbit.png') },
        { name: 'Red Panda', source: require('../assets/images/Animals/Red Panda.png') },
        { name: 'Snail', source: require('../assets/images/Animals/Snail.png') },
        { name: 'Snake', source: require('../assets/images/Animals/Snake.png') },
        { name: 'Tiger', source: require('../assets/images/Animals/Tiger.png') },
        { name: 'Turkey', source: require('../assets/images/Animals/Turkey.png') },
        { name: 'Wolf', source: require('../assets/images/Animals/Wolf.png') },
        { name: 'Zebra', source: require('../assets/images/Animals/Zebra.png') }
      ]
    },
    {
      id: 'numbers',
      name: 'Numbers',
      icon: 'numeric',
      color: '#3b82f6',
      images: [
        { name: '1', source: require('../assets/images/Numbers/1.png') },
        { name: '2', source: require('../assets/images/Numbers/2.png') },
        { name: '3', source: require('../assets/images/Numbers/3.png') },
        { name: '4', source: require('../assets/images/Numbers/4.png') },
        { name: '5', source: require('../assets/images/Numbers/5.png') },
        { name: '6', source: require('../assets/images/Numbers/6.png') },
        { name: '7', source: require('../assets/images/Numbers/7.png') },
        { name: '8', source: require('../assets/images/Numbers/8.png') },
        { name: '9', source: require('../assets/images/Numbers/9.png') }
      ]
    }
  ];

  const addQuestion = (type: string) => {
    const newQuestion: Question = {
      id: Date.now().toString(),
      type: type as Question['type'],
      question: '',
      answer: type === 'multiple-choice' ? '' : type === 'matching' ? [] : type === 're-order' ? [] : '',
      options: type === 'multiple-choice' ? ['', '', '', ''] : undefined,
      optionImages: type === 'multiple-choice' ? [null, null, null, null] : undefined,
      pairs: type === 'matching' ? [{ left: '', right: '', leftImage: null, rightImage: null }] : undefined,
      order: type === 're-order' ? [''] : undefined,
      passage: type === 'reading-passage' ? '' : undefined,
      subQuestions: type === 'reading-passage' ? [] : undefined,
      multiAnswer: type === 'multiple-choice' ? false : undefined,
      reorderDirection: type === 're-order' ? 'asc' : undefined,
      questionImage: null,
      fillSettings: type === 'identification' ? { caseSensitive: false, showBoxes: true } : undefined,
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
    
  // Validate multiple choice questions have options and correct answer(s)
  const invalidMultipleChoice = questions.filter(q => {
    if (q.type !== 'multiple-choice') return false;
    if (!q.options || q.options.some(opt => !opt.trim())) return true;
    const ans = q.answer;
    if (Array.isArray(ans)) return ans.length === 0;
    return !ans;
  });
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
    
    // Validate reading-passage: must have passage and at least one valid sub-question
    const invalidReading = questions.filter(q => q.type === 'reading-passage').some(q => {
      const hasPassage = !!q.passage && q.passage.trim().length > 0;
      const subs = q.subQuestions || [];
      const hasAtLeastOne = subs.length > 0;
      const subsValid = subs.every(sq => {
        if (!sq.question || !sq.question.trim()) return false;
        if (sq.type === 'multiple-choice') {
          return !!sq.options && sq.options.length >= 2 && !sq.options.some(o => !o.trim()) && !!sq.answer;
        }
        if (sq.type === 'matching') {
          return !!sq.pairs && sq.pairs.length >= 1 && !sq.pairs.some(p => !p.left.trim() || !p.right.trim());
        }
        if (sq.type === 're-order') {
          return !!sq.order && sq.order.length >= 2 && !sq.order.some(i => !i.trim());
        }
        if (sq.type === 'identification') {
          return !!sq.answer;
        }
        return true;
      });
      return !(hasPassage && hasAtLeastOne && subsValid);
    });
    if (invalidReading) {
      Alert.alert('Error', 'Please complete the reading passage and all sub-questions');
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

  const openStockImageModal = (context: {
    questionId: string;
    optionIndex?: number;
    pairIndex?: number;
    side?: 'left' | 'right';
    type: 'question' | 'option' | 'pair';
  }) => {
    setStockImageContext(context);
    setShowStockImageModal(true);
    setSelectedCategory('');
  };

  const selectStockImage = (imageSource: any) => {
    if (!stockImageContext) return;
    
    const { questionId, optionIndex, pairIndex, side, type } = stockImageContext;
    
    if (type === 'question') {
      updateQuestion(questionId, { questionImage: imageSource });
    } else if (type === 'option' && optionIndex !== undefined) {
      const q = questions.find((q) => q.id === questionId);
      if (!q) return;
      const next = [...(q.optionImages || [])];
      next[optionIndex] = imageSource;
      updateQuestion(questionId, { optionImages: next });
    } else if (type === 'pair' && pairIndex !== undefined && side) {
      const q = questions.find((q) => q.id === questionId);
      if (!q || !q.pairs) return;
      const nextPairs = [...q.pairs];
      const target = { ...nextPairs[pairIndex] };
      if (side === 'left') target.leftImage = imageSource;
      else target.rightImage = imageSource;
      nextPairs[pairIndex] = target;
      updateQuestion(questionId, { pairs: nextPairs });
    }
    
    setShowStockImageModal(false);
    setStockImageContext(null);
  };

  const pickOptionImage = async (questionId: string, optionIndex: number) => {
    Alert.alert('Image Selection', 'Choose image source:', [
      { text: 'Stock Images', onPress: () => openStockImageModal({ questionId, optionIndex, type: 'option' }) },
      { text: 'Upload Custom', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Media library access is required to pick images.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        if (res.canceled) return;
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        const q = questions.find((q) => q.id === questionId);
        if (!q) return;
        const next = [...(q.optionImages || [])];
        next[optionIndex] = uri;
        updateQuestion(questionId, { optionImages: next });
      }},
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const pickPairImage = async (
    questionId: string,
    pairIndex: number,
    side: 'left' | 'right'
  ) => {
    Alert.alert('Image Selection', 'Choose image source:', [
      { text: 'Stock Images', onPress: () => openStockImageModal({ questionId, pairIndex, side, type: 'pair' }) },
      { text: 'Upload Custom', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Media library access is required to pick images.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        if (res.canceled) return;
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        const q = questions.find((q) => q.id === questionId);
        if (!q || !q.pairs) return;
        const nextPairs = [...q.pairs];
        const target = { ...nextPairs[pairIndex] };
        if (side === 'left') target.leftImage = uri;
        else target.rightImage = uri;
        nextPairs[pairIndex] = target;
        updateQuestion(questionId, { pairs: nextPairs });
      }},
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const clearPairImage = (
    questionId: string,
    pairIndex: number,
    side: 'left' | 'right'
  ) => {
    const q = questions.find(q => q.id === questionId);
    if (!q || !q.pairs) return;
    const nextPairs = [...q.pairs];
    const target = { ...(nextPairs[pairIndex] || { left: '', right: '' }) } as NonNullable<Question['pairs']>[number];
    if (side === 'left') target.leftImage = null; else target.rightImage = null;
    nextPairs[pairIndex] = target;
    updateQuestion(questionId, { pairs: nextPairs });
  };

  const pickQuestionImage = async (questionId: string) => {
    Alert.alert('Image Selection', 'Choose image source:', [
      { text: 'Stock Images', onPress: () => openStockImageModal({ questionId, type: 'question' }) },
      { text: 'Upload Custom', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Media library access is required to pick images.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9,
        });
        if (res.canceled) return;
        const uri = res.assets?.[0]?.uri;
        if (!uri) return;
        updateQuestion(questionId, { questionImage: uri });
      }},
      { text: 'Cancel', style: 'cancel' }
    ]);
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
                  placeholder="Enter your question..."
                  placeholderTextColor="#64748b"
                  multiline
                  textAlignVertical="top"
                  autoFocus={true}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <TouchableOpacity onPress={() => pickQuestionImage(editingQuestion.id)} style={styles.pickFileButton}>
                    <MaterialCommunityIcons name="image-plus" size={16} color="#ffffff" />
                    <Text style={styles.pickFileButtonText}>{editingQuestion.questionImage ? 'Change image' : 'Add image'}</Text>
                  </TouchableOpacity>
                </View>
                {editingQuestion.questionImage && (
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={{ uri: editingQuestion.questionImage }} style={{ width: 140, height: 140, borderRadius: 12, marginRight: 8 }} />
                    <TouchableOpacity onPress={() => updateQuestion(editingQuestion.id, { questionImage: null })}>
                      <MaterialCommunityIcons name="trash-can" size={22} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {editingQuestion.type === 'identification' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Correct Answer</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editingQuestion.answer as string}
                    onChangeText={(text) => updateQuestion(editingQuestion.id, { answer: text })}
                    placeholder="Enter the correct answer..."
                    placeholderTextColor="#64748b"
                    autoFocus={false}
                  />
                  {/* Show boxes vs single input */}
                  <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, (editingQuestion?.fillSettings?.showBoxes) && styles.choiceModeActive]}
                      onPress={() => updateQuestion(editingQuestion.id, { fillSettings: { ...(editingQuestion.fillSettings || { showBoxes: true, caseSensitive: false }), showBoxes: true } })}
                    >
                      <Text style={[styles.choiceModeText, (editingQuestion?.fillSettings?.showBoxes) && styles.choiceModeTextActive]}>Show boxes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, !(editingQuestion?.fillSettings?.showBoxes) && styles.choiceModeActive]}
                      onPress={() => updateQuestion(editingQuestion.id, { fillSettings: { ...(editingQuestion.fillSettings || { showBoxes: true, caseSensitive: false }), showBoxes: false } })}
                    >
                      <Text style={[styles.choiceModeText, !(editingQuestion?.fillSettings?.showBoxes) && styles.choiceModeTextActive]}>Single input</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Alternative answers */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.inputLabel}>Alternative answers</Text>
                    {(editingQuestion.fillSettings?.altAnswers || []).map((a, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <TextInput
                          style={[styles.textInput, { flex: 1 }]}
                          value={a}
                          onChangeText={(t) => {
                            const next = [...(editingQuestion.fillSettings?.altAnswers || [])];
                            next[i] = t;
                            updateQuestion(editingQuestion.id, { fillSettings: { ...(editingQuestion.fillSettings || { showBoxes: true, caseSensitive: false }), altAnswers: next } });
                          }}
                          placeholder={`Answer ${i + 1}`}
                          placeholderTextColor="#64748b"
                        />
                        <TouchableOpacity style={styles.removeButton} onPress={() => {
                          const next = [...(editingQuestion.fillSettings?.altAnswers || [])];
                          next.splice(i, 1);
                          updateQuestion(editingQuestion.id, { fillSettings: { ...(editingQuestion.fillSettings || { showBoxes: true, caseSensitive: false }), altAnswers: next } });
                        }}>
                          <AntDesign name="delete" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={styles.addButton} onPress={() => {
                      const next = [ ...(editingQuestion.fillSettings?.altAnswers || []), '' ];
                      updateQuestion(editingQuestion.id, { fillSettings: { ...(editingQuestion.fillSettings || { showBoxes: true, caseSensitive: false }), altAnswers: next } });
                    }}>
                      <AntDesign name="plus" size={16} color="#3b82f6" />
                      <Text style={styles.addButtonText}>Add alternative answer</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.inputLabel, { marginBottom: 6 }]}>Student view</Text>
                    {editingQuestion.fillSettings?.showBoxes ? (
                      <>
                        <Text style={{ textAlign: 'center', color: '#64748b', marginBottom: 8 }}>Type your answer in the boxes</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                          {Array.from({ length: Math.max(((editingQuestion.answer as string) || '').length || 0, 7) }).map((_, i) => (
                            <View key={i} style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: '#111827', marginRight: i === 6 ? 0 : 8, opacity: 0.9 }} />
                          ))}
                        </View>
                      </>
                    ) : (
                      <View style={{ alignItems: 'center' }}>
                        <View style={{ width: '90%', height: 36, borderRadius: 8, borderWidth: 2, borderColor: '#7c3aed', backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 12 }}>
                          <Text style={{ color: '#9ca3af' }}>Type your answer...</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {editingQuestion.type === 'multiple-choice' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Answer Options</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, !editingQuestion.multiAnswer && styles.choiceModeActive]}
                      onPress={() => updateQuestion(editingQuestion.id, { multiAnswer: false, answer: '' })}
                    >
                      <Text style={[styles.choiceModeText, !editingQuestion.multiAnswer && styles.choiceModeTextActive]}>Single correct answer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, editingQuestion.multiAnswer && styles.choiceModeActive]}
                      onPress={() => updateQuestion(editingQuestion.id, { multiAnswer: true, answer: [] })}
                    >
                      <Text style={[styles.choiceModeText, editingQuestion.multiAnswer && styles.choiceModeTextActive]}>Multiple correct answers</Text>
                    </TouchableOpacity>
                  </View>
                  {(editingQuestion.options || []).map((option, index) => (
                    <View key={index} style={[styles.mcTile, { backgroundColor: ['#2563eb','#0ea5a4','#f59e0b','#f43f5e','#8b5cf6'][index % 5] }] }>
                      <View style={styles.mcTileHeader}>
                        <TouchableOpacity
                          onPress={() => {
                            const letter = String.fromCharCode(65 + index);
                            if (editingQuestion.multiAnswer) {
                              const current = Array.isArray(editingQuestion.answer) ? editingQuestion.answer : [];
                              const exists = current.includes(letter);
                              const next = exists ? current.filter(l => l !== letter) : [...current, letter];
                              updateQuestion(editingQuestion.id, { answer: next });
                            } else {
                              updateQuestion(editingQuestion.id, { answer: letter });
                            }
                          }}
                          style={styles.mcSelect}
                        >
                          <MaterialCommunityIcons
                            name={(Array.isArray(editingQuestion.answer)
                              ? editingQuestion.answer.includes(String.fromCharCode(65 + index))
                              : editingQuestion.answer === String.fromCharCode(65 + index)) ? 'check-circle' : 'check-circle-outline'}
                            size={22}
                            color="#ffffff"
                          />
                        </TouchableOpacity>
                        {(editingQuestion.options || []).length > 2 && (
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => {
                              const newOptions = (editingQuestion.options || []).filter((_, i) => i !== index);
                              const letter = String.fromCharCode(65 + index);
                              let ans: string | string[] = editingQuestion.answer as any;
                              if (Array.isArray(ans)) {
                                ans = ans.filter(l => l !== letter);
                              } else if (ans === letter) {
                                ans = '';
                              }
                              const newImages = (editingQuestion.optionImages || []).filter((_, i) => i !== index);
                              updateQuestion(editingQuestion.id, { options: newOptions, optionImages: newImages, answer: ans });
                            }}
                          >
                            <AntDesign name="delete" size={16} color="#ffffff" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.optionLabel, { color: '#ffffff' }]}>{String.fromCharCode(65 + index)}.</Text>
                        <TextInput
                          style={[styles.optionInput, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.35)', color: '#ffffff' }]}
                          value={option}
                          onChangeText={(text) => {
                            const newOptions = [...(editingQuestion.options || [])];
                            newOptions[index] = text;
                            updateQuestion(editingQuestion.id, { options: newOptions });
                          }}
                          placeholder={`Type answer option here`}
                          placeholderTextColor="rgba(255,255,255,0.7)"
                        />
                        <TouchableOpacity onPress={() => pickOptionImage(editingQuestion.id, index)} style={{ marginLeft: 8 }}>
                          <MaterialCommunityIcons name="image-plus" size={22} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                      {(editingQuestion.optionImages?.[index]) && (
                        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                          <Image source={{ uri: editingQuestion.optionImages[index] as string }} style={{ width: 72, height: 72, borderRadius: 8, marginRight: 8 }} />
                          <TouchableOpacity onPress={() => {
                            const imgs = [...(editingQuestion.optionImages || [])];
                            imgs[index] = null;
                            updateQuestion(editingQuestion.id, { optionImages: imgs });
                          }}>
                            <MaterialCommunityIcons name="trash-can" size={22} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                      const newOptions = [...(editingQuestion.options || []), ''];
                      const newImages = [...(editingQuestion.optionImages || []), null];
                      updateQuestion(editingQuestion.id, { options: newOptions, optionImages: newImages });
                    }}
                  >
                    <AntDesign name="plus" size={16} color="#3b82f6" />
                    <Text style={styles.addButtonText}>Add Option</Text>
                  </TouchableOpacity>
                  {!editingQuestion.multiAnswer && (
                    <Text style={{ color: '#64748b', marginTop: 6 }}>Tap a tile to mark the single correct answer.</Text>
                  )}
                  {editingQuestion.multiAnswer && (
                    <Text style={{ color: '#64748b', marginTop: 6 }}>Tap multiple tiles to mark all correct answers.</Text>
                  )}
                </View>
              )}

              {editingQuestion.type === 'matching' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Matching Pairs</Text>
                  
                  {/* Preview Section */}
                  {(editingQuestion.pairs || []).length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewLabel}>Preview</Text>
                      <ScrollView
                        style={styles.pairsPreviewVScroll}
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={styles.pairsPreviewVContainer}
                      >
                        {(editingQuestion.pairs || []).map((pair, idx) => (
                          <View key={`pr-${idx}`} style={[styles.pairPreviewCard, { alignSelf: 'center' }]}>
                            <View style={[styles.pairSide, styles.pairLeft, { backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'][idx % 5] }]}>
                              {pair.leftImage ? (
                                <Image source={{ uri: pair.leftImage }} style={styles.pairImage} />
                              ) : (
                                <Text style={styles.pairText}>{pair.left || 'Left item'}</Text>
                              )}
                            </View>
                            <View style={styles.pairConnector}>
                              <MaterialCommunityIcons name="arrow-right" size={20} color="#64748b" />
                            </View>
                            <View style={[styles.pairSide, styles.pairRight, { backgroundColor: ['#1e40af','#059669','#d97706','#dc2626','#7c3aed'][idx % 5] }]}>
                              {pair.rightImage ? (
                                <Image source={{ uri: pair.rightImage }} style={styles.pairImage} />
                              ) : (
                                <Text style={styles.pairText}>{pair.right || 'Right item'}</Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Editor Section */}
                  <Text style={styles.editorLabel}>Edit Pairs</Text>
                  {(editingQuestion.pairs || []).map((pair, index) => (
                    <View key={index} style={styles.pairEditorCard}>
                      <View style={styles.pairEditorHeader}>
                        <Text style={styles.pairEditorTitle}>Pair {index + 1}</Text>
                        {(editingQuestion.pairs || []).length > 1 && (
                          <TouchableOpacity
                            style={styles.pairDeleteButton}
                            onPress={() => {
                              const newPairs = (editingQuestion.pairs || []).filter((_, i) => i !== index);
                              updateQuestion(editingQuestion.id, { pairs: newPairs });
                            }}
                          >
                            <AntDesign name="close" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                      
                      <View style={styles.pairEditorContent}>
                        {/* Left Side */}
                        <View style={styles.pairSideEditor}>
                          <Text style={styles.pairSideLabel}>Left Item</Text>
                          <View style={styles.pairInputContainer}>
                            <TextInput
                              style={styles.pairTextInput}
                              value={pair.left}
                              onChangeText={(text) => {
                                const newPairs = [...(editingQuestion.pairs || [])];
                                newPairs[index] = { ...pair, left: text };
                                updateQuestion(editingQuestion.id, { pairs: newPairs });
                              }}
                              placeholder="Enter left item..."
                              placeholderTextColor="#9ca3af"
                            />
                            <TouchableOpacity 
                              onPress={() => pickPairImage(editingQuestion.id, index, 'left')} 
                              style={styles.pairImageButton}
                            >
                              <MaterialCommunityIcons name="image-plus" size={18} color="#3b82f6" />
                            </TouchableOpacity>
                          </View>
                          {pair.leftImage && (
                            <View style={styles.pairImagePreview}>
                              <Image source={{ uri: pair.leftImage }} style={styles.pairImageThumbnail} />
                              <TouchableOpacity 
                                style={styles.pairImageRemove} 
                                onPress={() => clearPairImage(editingQuestion.id, index, 'left')}
                              >
                                <AntDesign name="close" size={14} color="#ffffff" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* Arrow */}
                        <View style={styles.pairArrowContainer}>
                          <MaterialCommunityIcons name="arrow-right" size={24} color="#64748b" />
                        </View>

                        {/* Right Side */}
                        <View style={styles.pairSideEditor}>
                          <Text style={styles.pairSideLabel}>Right Item</Text>
                          <View style={styles.pairInputContainer}>
                            <TextInput
                              style={styles.pairTextInput}
                              value={pair.right}
                              onChangeText={(text) => {
                                const newPairs = [...(editingQuestion.pairs || [])];
                                newPairs[index] = { ...pair, right: text };
                                updateQuestion(editingQuestion.id, { pairs: newPairs });
                              }}
                              placeholder="Enter right item..."
                              placeholderTextColor="#9ca3af"
                            />
                            <TouchableOpacity 
                              onPress={() => pickPairImage(editingQuestion.id, index, 'right')} 
                              style={styles.pairImageButton}
                            >
                              <MaterialCommunityIcons name="image-plus" size={18} color="#3b82f6" />
                            </TouchableOpacity>
                          </View>
                          {pair.rightImage && (
                            <View style={styles.pairImagePreview}>
                              <Image source={{ uri: pair.rightImage }} style={styles.pairImageThumbnail} />
                              <TouchableOpacity 
                                style={styles.pairImageRemove} 
                                onPress={() => clearPairImage(editingQuestion.id, index, 'right')}
                              >
                                <AntDesign name="close" size={14} color="#ffffff" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  <TouchableOpacity
                    style={styles.addPairButton}
                    onPress={() => {
                      const newPairs = [...(editingQuestion.pairs || []), { left: '', right: '', leftImage: null, rightImage: null }];
                      updateQuestion(editingQuestion.id, { pairs: newPairs });
                    }}
                  >
                    <AntDesign name="plus" size={18} color="#ffffff" />
                    <Text style={styles.addPairButtonText}>Add New Pair</Text>
                  </TouchableOpacity>
                </View>
              )}

              {editingQuestion.type === 're-order' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Items to Reorder</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, (editingQuestion.reorderDirection || 'asc') === 'asc' && styles.choiceModeActive]}
                      onPress={() => updateQuestion(editingQuestion.id, { reorderDirection: 'asc' })}
                    >
                      <Text style={[styles.choiceModeText, (editingQuestion.reorderDirection || 'asc') === 'asc' && styles.choiceModeTextActive]}>Ascending order</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, editingQuestion.reorderDirection === 'desc' && styles.choiceModeActive]}
                      onPress={() => updateQuestion(editingQuestion.id, { reorderDirection: 'desc' })}
                    >
                      <Text style={[styles.choiceModeText, editingQuestion.reorderDirection === 'desc' && styles.choiceModeTextActive]}>Descending order</Text>
                    </TouchableOpacity>
                  </View>
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
                  {(editingQuestion.order || []).length > 0 && (
                    <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
                      {(editingQuestion.order || []).map((it, i) => (
                        <View key={`prev-${i}`} style={{ backgroundColor: ['#1e3a8a','#0f766e','#92400e','#7f1d1d','#5b21b6'][i % 5], paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginRight: 8, marginBottom: 8, minWidth: 64, alignItems: 'center' }}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>{it || `Item ${i+1}`}</Text>
                          <View style={{ marginTop: 6, backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 }}>
                            <Text style={{ color: '#fff', fontSize: 12 }}>{i + 1}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {editingQuestion.type === 'reading-passage' && (
                <View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Passage</Text>
                    <TextInput
                      style={[styles.textInput, styles.textArea]}
                      value={editingQuestion.passage || ''}
                      onChangeText={(text) => updateQuestion(editingQuestion.id, { passage: text })}
                      placeholder="Enter the reading passage..."
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Sub-Questions</Text>
                    {(editingQuestion.subQuestions || []).map((sub, sIndex) => (
                      <View key={sub.id || sIndex} style={styles.questionCard}>
                        <View style={styles.questionHeader}>
                          <View style={styles.questionInfo}>
                            <Text style={styles.questionNumber}>Q{sIndex + 1}</Text>
                            <Text style={styles.questionType}>
                              {questionTypes.find(t => t.id === sub.type)?.title || 'Question'}
                            </Text>
                          </View>
                          <View style={styles.questionActions}>
                            <TouchableOpacity
                              onPress={() => {
                                const newSubs = (editingQuestion.subQuestions || []).filter((_, i) => i !== sIndex);
                                updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                              }}
                              style={styles.actionButton}
                            >
                              <AntDesign name="delete" size={16} color="#ef4444" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Question</Text>
                          <TextInput
                            style={styles.textInput}
                            value={sub.question}
                            onChangeText={(text) => {
                              const newSubs = [...(editingQuestion.subQuestions || [])];
                              newSubs[sIndex] = { ...sub, question: text } as Question;
                              updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                            }}
                            placeholder="Enter sub-question..."
                            multiline
                            textAlignVertical="top"
                          />
                        </View>

                        {sub.type === 'identification' && (
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Correct Answer</Text>
                            <TextInput
                              style={styles.textInput}
                              value={(sub.answer as string) || ''}
                              onChangeText={(text) => {
                                const newSubs = [...(editingQuestion.subQuestions || [])];
                                newSubs[sIndex] = { ...sub, answer: text } as Question;
                                updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                              }}
                              placeholder="Enter the correct answer..."
                            />
                          </View>
                        )}

                        {sub.type === 'multiple-choice' && (
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Answer Options</Text>
                            {(sub.options || []).map((option, index) => (
                              <View key={index} style={styles.optionRow}>
                                <Text style={styles.optionLabel}>{String.fromCharCode(65 + index)}.</Text>
                                <TextInput
                                  style={styles.optionInput}
                                  value={option}
                                  onChangeText={(text) => {
                                    const newOptions = [...(sub.options || [])];
                                    newOptions[index] = text;
                                    const newSubs = [...(editingQuestion.subQuestions || [])];
                                    newSubs[sIndex] = { ...sub, options: newOptions } as Question;
                                    updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                                  }}
                                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                                />
                                {(sub.options || []).length > 2 && (
                                  <TouchableOpacity
                                    style={styles.removeButton}
                                    onPress={() => {
                                      const newOptions = (sub.options || []).filter((_, i) => i !== index);
                                      const newSubs = [...(editingQuestion.subQuestions || [])];
                                      newSubs[sIndex] = { ...sub, options: newOptions } as Question;
                                      updateQuestion(editingQuestion.id, { subQuestions: newSubs });
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
                                const newOptions = [...(sub.options || []), ''];
                                const newSubs = [...(editingQuestion.subQuestions || [])];
                                newSubs[sIndex] = { ...sub, options: newOptions } as Question;
                                updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                              }}
                            >
                              <AntDesign name="plus" size={16} color="#3b82f6" />
                              <Text style={styles.addButtonText}>Add Option</Text>
                            </TouchableOpacity>
                            <View style={styles.inputGroup}>
                              <Text style={styles.inputLabel}>Correct Answer (A, B, C, or D)</Text>
                              <TextInput
                                style={styles.textInput}
                                value={(sub.answer as string) || ''}
                                onChangeText={(text) => {
                                  const newSubs = [...(editingQuestion.subQuestions || [])];
                                  newSubs[sIndex] = { ...sub, answer: text.toUpperCase() } as Question;
                                  updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                                }}
                                placeholder="A"
                                maxLength={1}
                              />
                            </View>
                          </View>
                        )}

                        {sub.type === 'matching' && (
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Matching Pairs</Text>
                            
                            {/* Preview Section for Sub-questions */}
                            {(sub.pairs || []).length > 0 && (
                              <View style={styles.previewSection}>
                                <Text style={styles.previewLabel}>Preview</Text>
                                <ScrollView
                                  style={styles.pairsPreviewVScroll}
                                  showsVerticalScrollIndicator={true}
                                  contentContainerStyle={styles.pairsPreviewVContainer}
                                >
                                  {(sub.pairs || []).map((pair, idx) => (
                                    <View key={`sub-pr-${idx}`} style={[styles.pairPreviewCard, { alignSelf: 'center' }]}>
                                      <View style={[styles.pairSide, styles.pairLeft, { backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'][idx % 5] }]}>
                                        {(pair as any).leftImage ? (
                                          <Image source={{ uri: (pair as any).leftImage }} style={styles.pairImage} />
                                        ) : (
                                          <Text style={styles.pairText}>{pair.left || 'Left item'}</Text>
                                        )}
                                      </View>
                                      <View style={styles.pairConnector}>
                                        <MaterialCommunityIcons name="arrow-right" size={20} color="#64748b" />
                                      </View>
                                      <View style={[styles.pairSide, styles.pairRight, { backgroundColor: ['#1e40af','#059669','#d97706','#dc2626','#7c3aed'][idx % 5] }]}>
                                        {(pair as any).rightImage ? (
                                          <Image source={{ uri: (pair as any).rightImage }} style={styles.pairImage} />
                                        ) : (
                                          <Text style={styles.pairText}>{pair.right || 'Right item'}</Text>
                                        )}
                                      </View>
                                    </View>
                                  ))}
                                </ScrollView>
                              </View>
                            )}

                            {/* Editor Section for Sub-questions */}
                            <Text style={styles.editorLabel}>Edit Pairs</Text>
                            {(sub.pairs || []).map((pair, index) => (
                              <View key={index} style={styles.pairEditorCard}>
                                <View style={styles.pairEditorHeader}>
                                  <Text style={styles.pairEditorTitle}>Pair {index + 1}</Text>
                                  {(sub.pairs || []).length > 1 && (
                                    <TouchableOpacity
                                      style={styles.pairDeleteButton}
                                      onPress={() => {
                                        const newPairs = (sub.pairs || []).filter((_, i) => i !== index);
                                        const newSubs = [...(editingQuestion.subQuestions || [])];
                                        newSubs[sIndex] = { ...sub, pairs: newPairs } as Question;
                                        updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                                      }}
                                    >
                                      <AntDesign name="close" size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                                
                                <View style={styles.pairEditorContent}>
                                  {/* Left Side */}
                                  <View style={styles.pairSideEditor}>
                                    <Text style={styles.pairSideLabel}>Left Item</Text>
                                    <View style={styles.pairInputContainer}>
                                      <TextInput
                                        style={styles.pairTextInput}
                                        value={pair.left}
                                        onChangeText={(text) => {
                                          const newPairs = [...(sub.pairs || [])];
                                          newPairs[index] = { ...pair, left: text };
                                          const newSubs = [...(editingQuestion.subQuestions || [])];
                                          newSubs[sIndex] = { ...sub, pairs: newPairs } as Question;
                                          updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                                        }}
                                        placeholder="Enter left item..."
                                        placeholderTextColor="#9ca3af"
                                      />
                                      <TouchableOpacity 
                                        onPress={() => {
                                          // Update sub-question pair image
                                          const qid = editingQuestion.id;
                                          const q = questions.find(q => q.id === qid);
                                          if (!q || !q.subQuestions) return;
                                          const newSubs = [...q.subQuestions];
                                          const subQ = { ...(newSubs[sIndex] as any) };
                                          const newPairs = [...(subQ.pairs || [])];
                                          const target = { ...(newPairs[index] || { left: '', right: '' }) } as any;
                                          target.leftImage = 'temp'; // Will be updated by pickPairImage
                                          newPairs[index] = target;
                                          subQ.pairs = newPairs;
                                          newSubs[sIndex] = subQ;
                                          updateQuestion(qid, { subQuestions: newSubs as any });
                                          
                                          // Then pick image
                                          pickPairImage(qid, index, 'left');
                                        }} 
                                        style={styles.pairImageButton}
                                      >
                                        <MaterialCommunityIcons name="image-plus" size={18} color="#3b82f6" />
                                      </TouchableOpacity>
                                    </View>
                                    {(pair as any).leftImage && (
                                      <View style={styles.pairImagePreview}>
                                        <Image source={{ uri: (pair as any).leftImage }} style={styles.pairImageThumbnail} />
                                        <TouchableOpacity 
                                          style={styles.pairImageRemove} 
                                          onPress={() => {
                                            const qid = editingQuestion.id;
                                            const q = questions.find(q => q.id === qid);
                                            if (!q || !q.subQuestions) return;
                                            const newSubs = [...q.subQuestions];
                                            const subQ = { ...(newSubs[sIndex] as any) };
                                            const newPairs = [...(subQ.pairs || [])];
                                            const target = { ...(newPairs[index] || { left: '', right: '' }) } as any;
                                            target.leftImage = null;
                                            newPairs[index] = target;
                                            subQ.pairs = newPairs;
                                            newSubs[sIndex] = subQ;
                                            updateQuestion(qid, { subQuestions: newSubs as any });
                                          }}
                                        >
                                          <AntDesign name="close" size={14} color="#ffffff" />
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>

                                  {/* Arrow */}
                                  <View style={styles.pairArrowContainer}>
                                    <MaterialCommunityIcons name="arrow-right" size={24} color="#64748b" />
                                  </View>

                                  {/* Right Side */}
                                  <View style={styles.pairSideEditor}>
                                    <Text style={styles.pairSideLabel}>Right Item</Text>
                                    <View style={styles.pairInputContainer}>
                                      <TextInput
                                        style={styles.pairTextInput}
                                        value={pair.right}
                                        onChangeText={(text) => {
                                          const newPairs = [...(sub.pairs || [])];
                                          newPairs[index] = { ...pair, right: text };
                                          const newSubs = [...(editingQuestion.subQuestions || [])];
                                          newSubs[sIndex] = { ...sub, pairs: newPairs } as Question;
                                          updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                                        }}
                                        placeholder="Enter right item..."
                                        placeholderTextColor="#9ca3af"
                                      />
                                      <TouchableOpacity 
                                        onPress={() => {
                                          // Update sub-question pair image
                                          const qid = editingQuestion.id;
                                          const q = questions.find(q => q.id === qid);
                                          if (!q || !q.subQuestions) return;
                                          const newSubs = [...q.subQuestions];
                                          const subQ = { ...(newSubs[sIndex] as any) };
                                          const newPairs = [...(subQ.pairs || [])];
                                          const target = { ...(newPairs[index] || { left: '', right: '' }) } as any;
                                          target.rightImage = 'temp'; // Will be updated by pickPairImage
                                          newPairs[index] = target;
                                          subQ.pairs = newPairs;
                                          newSubs[sIndex] = subQ;
                                          updateQuestion(qid, { subQuestions: newSubs as any });
                                          
                                          // Then pick image
                                          pickPairImage(qid, index, 'right');
                                        }} 
                                        style={styles.pairImageButton}
                                      >
                                        <MaterialCommunityIcons name="image-plus" size={18} color="#3b82f6" />
                                      </TouchableOpacity>
                                    </View>
                                    {(pair as any).rightImage && (
                                      <View style={styles.pairImagePreview}>
                                        <Image source={{ uri: (pair as any).rightImage }} style={styles.pairImageThumbnail} />
                                        <TouchableOpacity 
                                          style={styles.pairImageRemove} 
                                          onPress={() => {
                                            const qid = editingQuestion.id;
                                            const q = questions.find(q => q.id === qid);
                                            if (!q || !q.subQuestions) return;
                                            const newSubs = [...q.subQuestions];
                                            const subQ = { ...(newSubs[sIndex] as any) };
                                            const newPairs = [...(subQ.pairs || [])];
                                            const target = { ...(newPairs[index] || { left: '', right: '' }) } as any;
                                            target.rightImage = null;
                                            newPairs[index] = target;
                                            subQ.pairs = newPairs;
                                            newSubs[sIndex] = subQ;
                                            updateQuestion(qid, { subQuestions: newSubs as any });
                                          }}
                                        >
                                          <AntDesign name="close" size={14} color="#ffffff" />
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                </View>
                              </View>
                            ))}
                            
                            <TouchableOpacity
                              style={styles.addPairButton}
                              onPress={() => {
                                const newPairs = [...(sub.pairs || []), { left: '', right: '', leftImage: null, rightImage: null }];
                                const newSubs = [...(editingQuestion.subQuestions || [])];
                                newSubs[sIndex] = { ...sub, pairs: newPairs } as Question;
                                updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                              }}
                            >
                              <AntDesign name="plus" size={18} color="#ffffff" />
                              <Text style={styles.addPairButtonText}>Add New Pair</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {sub.type === 're-order' && (
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Items to Reorder</Text>
                            {(sub.order || []).map((item, index) => (
                              <View key={index} style={styles.orderRow}>
                                <Text style={styles.orderNumber}>{index + 1}.</Text>
                                <TextInput
                                  style={styles.orderInput}
                                  value={item}
                                  onChangeText={(text) => {
                                    const newOrder = [...(sub.order || [])];
                                    newOrder[index] = text;
                                    const newSubs = [...(editingQuestion.subQuestions || [])];
                                    newSubs[sIndex] = { ...sub, order: newOrder } as Question;
                                    updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                                  }}
                                  placeholder={`Item ${index + 1}`}
                                />
                                {(sub.order || []).length > 1 && (
                                  <TouchableOpacity
                                    style={styles.removeButton}
                                    onPress={() => {
                                      const newOrder = (sub.order || []).filter((_, i) => i !== index);
                                      const newSubs = [...(editingQuestion.subQuestions || [])];
                                      newSubs[sIndex] = { ...sub, order: newOrder } as Question;
                                      updateQuestion(editingQuestion.id, { subQuestions: newSubs });
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
                                const newOrder = [...(sub.order || []), ''];
                                const newSubs = [...(editingQuestion.subQuestions || [])];
                                newSubs[sIndex] = { ...sub, order: newOrder } as Question;
                                updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                              }}
                            >
                              <AntDesign name="plus" size={16} color="#3b82f6" />
                              <Text style={styles.addButtonText}>Add Item</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Sub-question Type</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {questionTypes
                              .filter(t => t.id !== 'reading-passage')
                              .map((t) => (
                                <TouchableOpacity
                                  key={t.id}
                                  style={[styles.questionTypeCard, { marginRight: 8 }]}
                                  onPress={() => {
                                    const updated: Question = {
                                      ...sub,
                                      type: t.id as Question['type'],
                                      answer: t.id === 'multiple-choice' ? '' : t.id === 'matching' ? [] : t.id === 're-order' ? [] : '',
                                      options: t.id === 'multiple-choice' ? ['', '', '', ''] : undefined,
                                      pairs: t.id === 'matching' ? [{ left: '', right: '' }] : undefined,
                                      order: t.id === 're-order' ? [''] : undefined,
                                    };
                                    const newSubs = [...(editingQuestion.subQuestions || [])];
                                    newSubs[sIndex] = updated;
                                    updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                                  }}
                                >
                                  <View style={[styles.questionTypeIcon, { backgroundColor: t.color }]}>
                                    <MaterialCommunityIcons name={t.icon as any} size={20} color="#ffffff" />
                                  </View>
                                  <View style={styles.questionTypeInfo}>
                                    <Text style={styles.questionTypeTitle}>{t.title}</Text>
                                  </View>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => {
                        const newSub: Question = {
                          id: `${Date.now()}-sub`,
                          type: 'identification',
                          question: '',
                          answer: '',
                        } as unknown as Question;
                        const newSubs = [...(editingQuestion.subQuestions || []), newSub];
                        updateQuestion(editingQuestion.id, { subQuestions: newSubs });
                      }}
                    >
                      <AntDesign name="plus" size={16} color="#3b82f6" />
                      <Text style={styles.addButtonText}>Add Sub-question</Text>
                    </TouchableOpacity>
                  </View>
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
              placeholderTextColor="#64748b"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={exerciseDescription}
              onChangeText={setExerciseDescription}
              placeholder="Enter exercise description..."
              placeholderTextColor="#64748b"
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
      
      {/* Stock Image Modal */}
      <Modal
        visible={showStockImageModal}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowStockImageModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          {/* Header */}
          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 15,
            backgroundColor: '#ffffff',
            borderBottomWidth: 1,
            borderBottomColor: '#e2e8f0'
          }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1e293b' }}>Select Stock Image</Text>
            <TouchableOpacity 
              onPress={() => setShowStockImageModal(false)}
              style={{ padding: 5 }}
            >
              <AntDesign name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
            {!selectedCategory ? (
              // Category Selection
              <View style={{ paddingVertical: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 }}>Choose Category</Text>
                
                {stockImageCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#f8fafc',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                    }}
                    onPress={() => setSelectedCategory(category.id)}
                  >
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: category.color,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 16,
                    }}>
                      <MaterialCommunityIcons name={category.icon as any} size={24} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 4 }}>
                        {category.name}
                      </Text>
                      <Text style={{ fontSize: 14, color: '#64748b' }}>
                        {category.images.length} images
                      </Text>
                    </View>
                    <AntDesign name="right" size={16} color="#64748b" />
                  </TouchableOpacity>
                ))}
                
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#eff6ff',
                    borderRadius: 12,
                    padding: 16,
                    marginTop: 8,
                    borderWidth: 2,
                    borderColor: '#3b82f6',
                    borderStyle: 'dashed',
                  }}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (status !== 'granted') {
                      Alert.alert('Permission needed', 'Media library access is required to pick images.');
                      return;
                    }
                    const res = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ImagePicker.MediaTypeOptions.Images,
                      quality: 0.8,
                    });
                    if (res.canceled) return;
                    const uri = res.assets?.[0]?.uri;
                    if (!uri || !stockImageContext) return;
                    
                    const { questionId, optionIndex, pairIndex, side, type } = stockImageContext;
                    
                    if (type === 'question') {
                      updateQuestion(questionId, { questionImage: uri });
                    } else if (type === 'option' && optionIndex !== undefined) {
                      const q = questions.find((q) => q.id === questionId);
                      if (!q) return;
                      const next = [...(q.optionImages || [])];
                      next[optionIndex] = uri;
                      updateQuestion(questionId, { optionImages: next });
                    } else if (type === 'pair' && pairIndex !== undefined && side) {
                      const q = questions.find((q) => q.id === questionId);
                      if (!q || !q.pairs) return;
                      const nextPairs = [...q.pairs];
                      const target = { ...nextPairs[pairIndex] };
                      if (side === 'left') target.leftImage = uri;
                      else target.rightImage = uri;
                      nextPairs[pairIndex] = target;
                      updateQuestion(questionId, { pairs: nextPairs });
                    }
                    
                    setShowStockImageModal(false);
                    setStockImageContext(null);
                  }}
                >
                  <MaterialCommunityIcons name="upload" size={24} color="#3b82f6" />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#3b82f6', marginLeft: 12 }}>
                    Upload Custom Image
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Image Selection
              <View style={{ paddingVertical: 20 }}>
                <TouchableOpacity 
                  onPress={() => setSelectedCategory('')}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}
                >
                  <AntDesign name="left" size={16} color="#3b82f6" />
                  <Text style={{ fontSize: 16, color: '#3b82f6', fontWeight: '600', marginLeft: 8 }}>
                    Back to Categories
                  </Text>
                </TouchableOpacity>
                
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 }}>
                  {stockImageCategories.find(c => c.id === selectedCategory)?.name} Images
                </Text>
                
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  {stockImageCategories
                    .find(c => c.id === selectedCategory)
                    ?.images.map((image) => (
                      <TouchableOpacity
                        key={image.name}
                        style={{ width: '30%', marginBottom: 16, alignItems: 'center' }}
                        onPress={() => selectStockImage(image.source)}
                      >
                        <Image
                          source={image.source}
                          style={{ width: 80, height: 80, borderRadius: 12, backgroundColor: '#f1f5f9' }}
                          resizeMode="cover"
                        />
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8, textAlign: 'center', fontWeight: '500' }} numberOfLines={1}>
                          {image.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
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
    borderColor: '#7c3aed',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    minHeight: 48,
    shadowColor: '#7c3aed',
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
    backgroundColor: '#7c3aed',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
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
  xpBadge: {
    marginLeft: 8,
    backgroundColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  xpBadgeText: {
    color: '#7c2d12',
    fontSize: 10,
    fontWeight: '800',
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
  choiceModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#ffffff',
  },
  choiceModeActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  choiceModeText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  choiceModeTextActive: {
    color: '#1e40af',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mcTile: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  mcTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mcSelect: {
    padding: 4,
  },
  previewCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    alignItems: 'center',
  },
  previewCardActive: {
    borderColor: '#7c3aed',
  },
  previewBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  previewInput: {
    width: '90%',
    height: 44,
    borderRadius: 8,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  previewLabel: {
    marginTop: 8,
    color: '#111827',
    fontWeight: '600',
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
    backgroundColor: '#7c3aed',
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

  // Matching Pairs Enhanced Styles
  previewSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pairsPreviewVScroll: {
    maxHeight: 180,
  },
  pairsPreviewVContainer: {
    paddingBottom: 6,
  },
  pairsPreviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pairPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minWidth: 280,
    marginBottom: 12,
  },
  pairSide: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  pairLeft: {
    marginRight: 8,
  },
  pairRight: {
    marginLeft: 8,
  },
  pairConnector: {
    paddingHorizontal: 12,
  },
  pairImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  pairText: {
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
  },
  editorLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 16,
  },
  pairEditorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  pairEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pairEditorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  pairDeleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  pairEditorContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  pairSideEditor: {
    flex: 1,
  },
  pairSideLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  pairInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pairTextInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#ffffff',
  },
  pairImageButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  pairImagePreview: {
    marginTop: 8,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  pairImageThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  pairImageRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairArrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  addPairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addPairButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Stock Image Modal Styles
  stockImageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  stockImageModal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
  },
  stockImageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  stockImageModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  stockImageModalClose: {
    padding: 5,
  },
  stockImageModalContent: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  stockImageCategories: {
    paddingVertical: 10,
  },
  stockImageSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  stockImageCategoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stockImageCategoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stockImageCategoryInfo: {
    flex: 1,
  },
  stockImageCategoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  stockImageCategoryCount: {
    fontSize: 14,
    color: '#64748b',
  },
  stockImageCustomUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
  },
  stockImageCustomUploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 12,
  },
  stockImageGrid: {
    paddingVertical: 10,
  },
  stockImageGridHeader: {
    marginBottom: 16,
  },
  stockImageBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  stockImageBackText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
    marginLeft: 8,
  },
  stockImageGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  stockImageItem: {
    width: '30%',
    marginBottom: 16,
    alignItems: 'center',
  },
  stockImageThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  stockImageName: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
});