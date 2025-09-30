import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { AudioSource, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
  View
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { onAuthChange } from '../lib/firebase-auth';
import { pushData, readData, updateData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

// Import ElevenLabs API key management
import {
  addApiKey,
  cleanupExpiredKeys,
  debugKeyStatus,
  getActiveApiKeys,
  getApiKeyStatus,
  markApiKeyAsFailed,
  markApiKeyAsUsed,
  removeLowCreditKeys,
  updateApiKeyCredits
} from '../lib/elevenlabs-keys';

// Helper function to check if API key has low credits and update status
const checkAndUpdateApiKeyCredits = async (apiKey: string, response: Response, errorText: string): Promise<boolean> => {
  try {
    console.log('🔍 Raw error text:', errorText);
    
    // Try to extract credits directly from the raw text using regex
    const creditsMatch = errorText.match(/"credits_remaining":\s*(\d+)/);
    const requiredMatch = errorText.match(/"credits_required":\s*(\d+)/);
    
    if (creditsMatch) {
      const creditsRemaining = parseInt(creditsMatch[1]);
      const creditsRequired = requiredMatch ? parseInt(requiredMatch[1]) : 0;
      
      console.log(`💰 API Key Credits - Remaining: ${creditsRemaining}, Required: ${creditsRequired}`);
      
      // Debug: Check key status before update
      console.log('🔍 Key status before update:');
      debugKeyStatus(apiKey);
      
      // Update the API key credits and status
      updateApiKeyCredits(apiKey, creditsRemaining);
      
      // Debug: Check key status after update
      console.log('🔍 Key status after update:');
      debugKeyStatus(apiKey);
      
      // If credits are below 300, immediately remove this key
      if (creditsRemaining < 300) {
        console.log(`🗑️ API key marked as low credits (${creditsRemaining} < 300) - removing immediately`);
        // Immediately remove low credit keys instead of waiting for periodic cleanup
        removeLowCreditKeys();
        return true; // Key has low credits
      }
    } else {
      // Fallback to JSON parsing
      const errorData = JSON.parse(errorText);
      console.log('🔍 Parsed error data:', JSON.stringify(errorData, null, 2));
      
      // Check if it's a quota exceeded error with specific credit information
      if (errorData.detail && (errorData.detail.status === 'quota_exceeded' || errorData.detail.status === 'qquota_exceeded')) {
        const creditsRemaining = errorData.detail.credits_remaining || 0;
        const creditsRequired = errorData.detail.credits_required || 0;
        
        console.log(`💰 API Key Credits - Remaining: ${creditsRemaining}, Required: ${creditsRequired}`);
        
        // Update the API key credits and status
        updateApiKeyCredits(apiKey, creditsRemaining);
        
        // If credits are below 300, immediately remove this key
        if (creditsRemaining < 300) {
          console.log(`🗑️ API key marked as low credits (${creditsRemaining} < 300) - removing immediately`);
          // Immediately remove low credit keys instead of waiting for periodic cleanup
          removeLowCreditKeys();
          return true; // Key has low credits
        }
      }
    }
  } catch (parseError) {
    console.warn('⚠️ Could not parse error response for credit check:', parseError);
    console.log('Raw error text:', errorText);
  }
  
  return false; // Key was not marked as low credits
};

// Helper function to try multiple ElevenLabs API keys with fallback
const callElevenLabsWithFallback = async (
  text: string, 
  voiceId: string = 'cgSgspJ2msm6clMCkdW9',
  useV3: boolean = true,
  outputFormat: string = 'mp3_44100_128'
): Promise<{ audioBlob: Blob; usedApiKey: string; performanceLog: any }> => {
  const performanceLog: any = {};
  
  // Clean up expired keys first
  cleanupExpiredKeys();
  
  // Get active API keys
  const activeKeys = getActiveApiKeys();
  
  if (activeKeys.length === 0) {
    throw new Error('No active ElevenLabs API keys available');
  }
  
  for (let i = 0; i < activeKeys.length; i++) {
    const apiKey = activeKeys[i];
    const attemptStart = Date.now();
    
    try {
      console.log(`🔄 Trying ElevenLabs API key ${i + 1}/${activeKeys.length} (${apiKey.substring(0, 10)}...)`);
      
      // Prepare request payload based on version
      const requestPayload = useV3 ? {
        text: text,
        model_id: 'eleven_v3',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.0,
          use_speaker_boost: true
        }
      } : {
        text: text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8
        }
      };

      // Make API call
      const url = useV3 
        ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`
        : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify(requestPayload)
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        performanceLog[`apiKey${i + 1}`] = Date.now() - attemptStart;
        console.log(`✅ ElevenLabs API key ${i + 1} succeeded`);
        
        // Mark this key as used
        markApiKeyAsUsed(apiKey);
        
        return {
          audioBlob,
          usedApiKey: apiKey,
          performanceLog
        };
      } else {
        const errorText = await response.text();
        console.warn(`⚠️ ElevenLabs API key ${i + 1} failed:`, response.status, errorText);
        
        // Check if this key has low credits and update status
        const hasLowCredits = await checkAndUpdateApiKeyCredits(apiKey, response, errorText);
        
        // Mark key as failed if it's not a credit issue
        if (!hasLowCredits) {
          markApiKeyAsFailed(apiKey);
        }
        
        // If this is the last key, throw the error
        if (i === activeKeys.length - 1) {
          throw new Error(`All ElevenLabs API keys failed. Last error: ${response.status} - ${errorText}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ ElevenLabs API key ${i + 1} error:`, error);
      
      // Mark key as failed
      markApiKeyAsFailed(apiKey);
      
      // If this is the last key, throw the error
      if (i === activeKeys.length - 1) {
        throw error;
      }
    }
  }
  
  throw new Error('No ElevenLabs API keys available');
};

// Utility functions for API key management
const addElevenLabsApiKey = (newApiKey: string) => {
  return addApiKey(newApiKey);
};

const getElevenLabsApiKeyStatus = () => {
  return getApiKeyStatus();
};

const cleanupLowCreditKeys = () => {
  return removeLowCreditKeys();
};

// Periodic cleanup of low credit keys (call this periodically)
const performApiKeyMaintenance = () => {
  const removedCount = removeLowCreditKeys();
  const expiredCount = cleanupExpiredKeys();
  
  if (removedCount > 0 || expiredCount > 0) {
    console.log(`🧹 API Key Maintenance: Removed ${removedCount} low credit keys, ${expiredCount} expired keys`);
  }
  
  return { removedCount, expiredCount };
};

// Configuration - Now using direct API calls to Gemini and ElevenLabs

// Stock image library data
const stockImages: Record<string, Array<{ name: string; uri: any }>> = {
  'Water Animals': [
    { name: 'Whale', uri: require('../assets/images/Water Animals/1.png') },
    { name: 'Fish', uri: require('../assets/images/Water Animals/2.png') },
    { name: 'Crab', uri: require('../assets/images/Water Animals/4.png') },
    { name: 'Octopus', uri: require('../assets/images/Water Animals/5.png') },
    { name: 'Starfish', uri: require('../assets/images/Water Animals/6.png') },
    { name: 'Coral', uri: require('../assets/images/Water Animals/7.png') },
    { name: 'Puffer Fish', uri: require('../assets/images/Water Animals/8.png') },
    { name: 'Dolphin', uri: require('../assets/images/Water Animals/10.png') },
    { name: 'Turtle', uri: require('../assets/images/Water Animals/11.png') },
    { name: 'Clam', uri: require('../assets/images/Water Animals/12.png') },
    { name: 'Shark', uri: require('../assets/images/Water Animals/13.png') },
    { name: 'Seahorse', uri: require('../assets/images/Water Animals/15.png') },
  ],
  'Alphabet': [
    { name: 'A', uri: require('../assets/images/Alphabet/a.png') },
    { name: 'B', uri: require('../assets/images/Alphabet/b.png') },
    { name: 'C', uri: require('../assets/images/Alphabet/c.png') },
    { name: 'D', uri: require('../assets/images/Alphabet/d.png') },
    { name: 'E', uri: require('../assets/images/Alphabet/e.png') },
    { name: 'F', uri: require('../assets/images/Alphabet/f.png') },
    { name: 'G', uri: require('../assets/images/Alphabet/g.png') },
    { name: 'H', uri: require('../assets/images/Alphabet/h.png') },
    { name: 'I', uri: require('../assets/images/Alphabet/i.png') },
    { name: 'J', uri: require('../assets/images/Alphabet/j.png') },
    { name: 'K', uri: require('../assets/images/Alphabet/k.png') },
    { name: 'M', uri: require('../assets/images/Alphabet/m.png') },
    { name: 'N', uri: require('../assets/images/Alphabet/n.png') },
    { name: 'O', uri: require('../assets/images/Alphabet/o.png') },
    { name: 'P', uri: require('../assets/images/Alphabet/p.png') },
    { name: 'Q', uri: require('../assets/images/Alphabet/q.png') },
    { name: 'R', uri: require('../assets/images/Alphabet/r.png') },
    { name: 'S', uri: require('../assets/images/Alphabet/s.png') },
    { name: 'T', uri: require('../assets/images/Alphabet/t.png') },
    { name: 'U', uri: require('../assets/images/Alphabet/u.png') },
    { name: 'V', uri: require('../assets/images/Alphabet/v.png') },
    { name: 'W', uri: require('../assets/images/Alphabet/w.png') },
    { name: 'X', uri: require('../assets/images/Alphabet/x.png') },
    { name: 'Y', uri: require('../assets/images/Alphabet/y.png') },
    { name: 'Z', uri: require('../assets/images/Alphabet/z.png') },
  ],
  'Fruits': [
    { name: 'Apple', uri: require('../assets/images/Fruits/apple.png') },
    { name: 'Avocado', uri: require('../assets/images/Fruits/avocado.png') },
    { name: 'Banana', uri: require('../assets/images/Fruits/banana.png') },
    { name: 'Blueberry', uri: require('../assets/images/Fruits/blueberry.png') },
    { name: 'Coco', uri: require('../assets/images/Fruits/coco.png') },
    { name: 'Corn', uri: require('../assets/images/Fruits/corn.png') },
    { name: 'Durian', uri: require('../assets/images/Fruits/durian.png') },
    { name: 'Grapes', uri: require('../assets/images/Fruits/grapes.png') },
    { name: 'Lemon', uri: require('../assets/images/Fruits/lemon.png') },
    { name: 'Mango', uri: require('../assets/images/Fruits/mango.png') },
    { name: 'Orange', uri: require('../assets/images/Fruits/orange.png') },
    { name: 'Pineapple', uri: require('../assets/images/Fruits/pineapple.png') },
    { name: 'Rambutan', uri: require('../assets/images/Fruits/rambutan.png') },
    { name: 'Strawberry', uri: require('../assets/images/Fruits/strawberry.png') },
    { name: 'Tomato', uri: require('../assets/images/Fruits/tomato.png') },
    { name: 'Watermelon', uri: require('../assets/images/Fruits/watermelon.png') },
  ],
  'Land Animals': [
    { name: 'Bee', uri: require('../assets/images/Land Animals/bee.png') },
    { name: 'Bird', uri: require('../assets/images/Land Animals/bird.png') },
    { name: 'Black Cat', uri: require('../assets/images/Land Animals/black cat.png') },
    { name: 'Bug', uri: require('../assets/images/Land Animals/bug.png') },
    { name: 'Bunny', uri: require('../assets/images/Land Animals/bunny.png') },
    { name: 'Butterfly', uri: require('../assets/images/Land Animals/butterfly.png') },
    { name: 'Cat', uri: require('../assets/images/Land Animals/cat.png') },
    { name: 'Cheetah', uri: require('../assets/images/Land Animals/cheetah.png') },
    { name: 'Chicken', uri: require('../assets/images/Land Animals/chicken.png') },
    { name: 'Cow', uri: require('../assets/images/Land Animals/cow.png') },
    { name: 'Deer', uri: require('../assets/images/Land Animals/deer.png') },
    { name: 'Dog', uri: require('../assets/images/Land Animals/dog.png') },
    { name: 'Elephant', uri: require('../assets/images/Land Animals/elephant.png') },
    { name: 'Fox', uri: require('../assets/images/Land Animals/fox.png') },
    { name: 'Frog', uri: require('../assets/images/Land Animals/frog.png') },
    { name: 'Giraffe', uri: require('../assets/images/Land Animals/guraffe.png') },
    { name: 'Hipo', uri: require('../assets/images/Land Animals/hipo.png') },
    { name: 'Horse', uri: require('../assets/images/Land Animals/horse.png') },
    { name: 'Koala', uri: require('../assets/images/Land Animals/koala.png') },
    { name: 'Lion', uri: require('../assets/images/Land Animals/lion.png') },
    { name: 'Monkey', uri: require('../assets/images/Land Animals/monkey.png') },
    { name: 'Owl', uri: require('../assets/images/Land Animals/owl.png') },
    { name: 'Panda', uri: require('../assets/images/Land Animals/panda.png') },
    { name: 'Penguin', uri: require('../assets/images/Land Animals/penguin.png') },
    { name: 'Pig', uri: require('../assets/images/Land Animals/pig.png') },
    { name: 'Red Panda', uri: require('../assets/images/Land Animals/red panda.png') },
    { name: 'Snail', uri: require('../assets/images/Land Animals/snail.png') },
    { name: 'Snake', uri: require('../assets/images/Land Animals/snake.png') },
    { name: 'Tiger', uri: require('../assets/images/Land Animals/tiger.png') },
    { name: 'Turkey', uri: require('../assets/images/Land Animals/turkey.png') },
    { name: 'Wolf', uri: require('../assets/images/Land Animals/wolf.png') },
    { name: 'Zebra', uri: require('../assets/images/Land Animals/zebra.png') },
  ],
  'Math Symbols': [
    { name: 'Equal', uri: require('../assets/images/Math Symbols/equal.png') },
    { name: 'Greater Than', uri: require('../assets/images/Math Symbols/greater than.png') },
    { name: 'Less Than', uri: require('../assets/images/Math Symbols/less than.png') },
    { name: 'Minus', uri: require('../assets/images/Math Symbols/minus.png') },
    { name: 'Not Equal To', uri: require('../assets/images/Math Symbols/not equal to.png') },
    { name: 'Plus', uri: require('../assets/images/Math Symbols/plus.png') },
  ],
  'Numbers': [
    { name: '1', uri: require('../assets/images/Numbers/1.png') },
    { name: '2', uri: require('../assets/images/Numbers/2.png') },
    { name: '3', uri: require('../assets/images/Numbers/3.png') },
    { name: '4', uri: require('../assets/images/Numbers/4.png') },
    { name: '5', uri: require('../assets/images/Numbers/5.png') },
    { name: '6', uri: require('../assets/images/Numbers/6.png') },
    { name: '7', uri: require('../assets/images/Numbers/7.png') },
    { name: '8', uri: require('../assets/images/Numbers/8.png') },
    { name: '9', uri: require('../assets/images/Numbers/9.png') },
  ],
  'School Supplies': [
    { name: 'Abacus', uri: require('../assets/images/School Supplies/abacus.png') },
    { name: 'Bag', uri: require('../assets/images/School Supplies/bag.png') },
    { name: 'Blue Scissors', uri: require('../assets/images/School Supplies/blue scissors.png') },
    { name: 'Board', uri: require('../assets/images/School Supplies/board.png') },
    { name: 'Brushes', uri: require('../assets/images/School Supplies/brushes.png') },
    { name: 'Clip', uri: require('../assets/images/School Supplies/clip.png') },
    { name: 'Crayon', uri: require('../assets/images/School Supplies/crayon.png') },
    { name: 'Crayons', uri: require('../assets/images/School Supplies/crayons.png') },
    { name: 'Eraser', uri: require('../assets/images/School Supplies/eraser.png') },
    { name: 'Globe', uri: require('../assets/images/School Supplies/globe.png') },
    { name: 'Glue', uri: require('../assets/images/School Supplies/glue.png') },
    { name: 'Mid Thick Book', uri: require('../assets/images/School Supplies/mid thick book.png') },
    { name: 'Notebook 1', uri: require('../assets/images/School Supplies/notebook 1.png') },
    { name: 'Notebook 2', uri: require('../assets/images/School Supplies/notebook 2.png') },
    { name: 'Paint Brush', uri: require('../assets/images/School Supplies/paint brush.png') },
    { name: 'Paper', uri: require('../assets/images/School Supplies/paper.png') },
    { name: 'Pencil Case', uri: require('../assets/images/School Supplies/pencil case.png') },
    { name: 'Pencil', uri: require('../assets/images/School Supplies/pencil.png') },
    { name: 'Red Scissors', uri: require('../assets/images/School Supplies/red scissors.png') },
    { name: 'Ruler 1', uri: require('../assets/images/School Supplies/ruler 1.png') },
    { name: 'Ruler 2', uri: require('../assets/images/School Supplies/ruler 2.png') },
    { name: 'Sharpener', uri: require('../assets/images/School Supplies/sharpener.png') },
    { name: 'Stack Books', uri: require('../assets/images/School Supplies/stack books.png') },
    { name: 'Stapler', uri: require('../assets/images/School Supplies/stapler.png') },
    { name: 'Thickest Book', uri: require('../assets/images/School Supplies/thickest book.png') },
    { name: 'Thin Book', uri: require('../assets/images/School Supplies/thin book.png') },
  ],
  'Shapes': [
    { name: 'Circle', uri: require('../assets/images/Shapes/circle.png') },
    { name: 'Decagon', uri: require('../assets/images/Shapes/decagon.png') },
    { name: 'Heptagon', uri: require('../assets/images/Shapes/heptagon.png') },
    { name: 'Hexagon', uri: require('../assets/images/Shapes/hexagon.png') },
    { name: 'Nonagon', uri: require('../assets/images/Shapes/nonagon.png') },
    { name: 'Octagon', uri: require('../assets/images/Shapes/octagon.png') },
    { name: 'Oval', uri: require('../assets/images/Shapes/oval.png') },
    { name: 'Pentagon', uri: require('../assets/images/Shapes/pentagon.png') },
    { name: 'Rectangle', uri: require('../assets/images/Shapes/rectangle.png') },
    { name: 'Square', uri: require('../assets/images/Shapes/square.png') },
    { name: 'Triangle', uri: require('../assets/images/Shapes/triangle.png') },
  ],
  'Toys': [
    { name: 'Airplane', uri: require('../assets/images/Toys/airplane.png') },
    { name: 'Ball', uri: require('../assets/images/Toys/ball.png') },
    { name: 'Beach Ball', uri: require('../assets/images/Toys/beach ball.png') },
    { name: 'Bear', uri: require('../assets/images/Toys/bear.png') },
    { name: 'Bike', uri: require('../assets/images/Toys/bike.png') },
    { name: 'Boat', uri: require('../assets/images/Toys/boat.png') },
    { name: 'Car', uri: require('../assets/images/Toys/car.png') },
    { name: 'Dice', uri: require('../assets/images/Toys/dice.png') },
    { name: 'Dino', uri: require('../assets/images/Toys/dino.png') },
    { name: 'Drums', uri: require('../assets/images/Toys/drums.png') },
    { name: 'Excavator', uri: require('../assets/images/Toys/excavator.png') },
    { name: 'House', uri: require('../assets/images/Toys/house.png') },
    { name: 'Joystick', uri: require('../assets/images/Toys/joystick.png') },
    { name: 'Kite', uri: require('../assets/images/Toys/kite.png') },
    { name: 'Lego', uri: require('../assets/images/Toys/lego.png') },
    { name: 'Magnet', uri: require('../assets/images/Toys/magnet.png') },
    { name: 'Paper Boat', uri: require('../assets/images/Toys/paper boat.png') },
    { name: 'Puzzle', uri: require('../assets/images/Toys/puzzle.png') },
    { name: 'Racket', uri: require('../assets/images/Toys/racket.png') },
    { name: 'Robot', uri: require('../assets/images/Toys/robot.png') },
    { name: 'Rubik', uri: require('../assets/images/Toys/rubik.png') },
    { name: 'Stack Ring', uri: require('../assets/images/Toys/stack ring.png') },
    { name: 'Train', uri: require('../assets/images/Toys/train.png') },
    { name: 'Xylophone', uri: require('../assets/images/Toys/xylophone.png') },
    { name: 'Yoyo', uri: require('../assets/images/Toys/yoyo.png') },
  ],
};

interface ReorderItem {
  id: string;
  type: 'text' | 'image';
  content: string; // text content or image URL
  imageUrl?: string; // for image items
}

interface Question {
  id: string;
  type: 'identification' | 'multiple-choice' | 'matching' | 're-order' | 'reading-passage';
  question: string;
  answer: string | string[];
  options?: string[];
  optionImages?: (string | null)[];
  pairs?: { left: string; right: string; leftImage?: string | null; rightImage?: string | null }[];
  order?: string[]; // legacy - will be replaced by reorderItems
  reorderItems?: ReorderItem[]; // new structure for reorder questions
  passage?: string;
  subQuestions?: Omit<Question, 'subQuestions'>[];
  multiAnswer?: boolean;
  reorderDirection?: 'asc' | 'desc';
  questionImage?: string | null;
  questionImages?: string[]; // Support for multiple images in pattern questions
  fillSettings?: {
    caseSensitive: boolean;
    showBoxes: boolean;
    altAnswers?: string[];
    hint?: string;
    ignoreAccents?: boolean;
    allowShowWork?: boolean;
  };
  // TTS fields
  ttsAudioUrl?: string;
}

export default function CreateExercise() {
  const router = useRouter();
  const { edit } = useLocalSearchParams();
  const [exerciseTitle, setExerciseTitle] = useState('');
  const [exerciseDescription, setExerciseDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [exerciseCode, setExerciseCode] = useState('');
  const [exerciseCategory, setExerciseCategory] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showCustomCategoryModal, setShowCustomCategoryModal] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  
  // Category options
  const categoryOptions = [
    'Whole Numbers',
    'Ordinal Numbers',
    'Addition',
    'Subtraction', 
    'Place Value',
    'Counting',
    'Patterns',
    'Fractions',
    'Money',
    'Word Problems',
    'Geometry',
    'Length & Distance',
    'Movement & Turns',
    'Time',
    'Days, Weeks, Months, Years',
    'Data & Pictographs',
    'Data Collection',
    'Data Interpretation',
    'Custom'
  ];
  
  const [showQuestionTypeModal, setShowQuestionTypeModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [resourceFile, setResourceFile] = useState<{ name: string; uri: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [exerciseId, setExerciseId] = useState<string | null>(null);

  // TTS state
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [currentAudioUri, setCurrentAudioUri] = useState<string | null>(null);
  // TTS language is now handled directly in the API call, no need for state
  const [currentAudioPlayer, setCurrentAudioPlayer] = useState<any | null>(null);
  
  // Local TTS audio management
  const [localTTSAudio, setLocalTTSAudio] = useState<{
    questionId: string;
    localUri: string;
    base64Data: string;
  } | null>(null);
  const [pendingTTSUploads, setPendingTTSUploads] = useState<Array<{
    questionId: string;
    localUri: string;
    base64Data: string;
  }>>([]);

  // AI Questions Generator state
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);
  const [selectedQuestionType, setSelectedQuestionType] = useState('multiple-choice');
  const [ttsProgress, setTtsProgress] = useState({ current: 0, total: 0 });
  
  // User state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [teacherData, setTeacherData] = useState<any>(null);
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
    type: 'question' | 'option' | 'pair' | 'multiple-question';
  } | null>(null);
  
  // Inline image library state
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [imageLibraryContext, setImageLibraryContext] = useState<{
    questionId: string;
    optionIndex?: number;
    pairIndex?: number;
    side?: 'left' | 'right';
    reorderItemIndex?: number;
    type: 'question' | 'option' | 'pair' | 'reorder' | 'multiple-question';
  } | null>(null);
  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>({});
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [modalStack, setModalStack] = useState<string[]>([]);
  
  // Generate 6-digit code for exercise
  const generateExerciseCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setExerciseCode(code);
    return code;
  };

  // Initialize Audio
  useEffect(() => {
    const setupAudio = async () => {
      try {
        // Configure audio mode for playback
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        console.log('Audio mode configured successfully');
      } catch (error) {
        console.warn('Audio mode setup failed:', error);
      }
    };
    
    setupAudio();
    
    return () => {
      // Cleanup audio player on unmount
      if (currentAudioPlayer) {
        currentAudioPlayer.remove();
      }
    };
  }, []);

  // Handle authentication and fetch teacher data
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      if (user?.uid) {
        setCurrentUserId(user.uid);
        fetchTeacherData(user.uid);
      } else {
        router.replace('/TeacherLogin');
      }
    });

    // Perform API key maintenance on component mount
    performApiKeyMaintenance();

    // Set up periodic cleanup every 5 minutes
    const maintenanceInterval = setInterval(() => {
      performApiKeyMaintenance();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      unsubscribe();
      clearInterval(maintenanceInterval);
    };
  }, []);

  // Cleanup TTS audio when component unmounts or question changes
  useEffect(() => {
    return () => {
      if (currentAudioPlayer) {
        currentAudioPlayer.remove();
      }
      // Clean up local TTS files
      cleanupLocalTTSFiles();
    };
  }, [currentAudioPlayer]);

  // Function to clean up local TTS files (but preserve pending uploads for retry)
  const cleanupLocalTTSFiles = async () => {
    try {
      // Only clean up current local TTS audio (not pending uploads)
      if (localTTSAudio?.localUri) {
        // Check if this file is in pending uploads - if so, don't delete it
        const isInPendingUploads = pendingTTSUploads.some(p => p.localUri === localTTSAudio.localUri);
        
        if (!isInPendingUploads) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(localTTSAudio.localUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(localTTSAudio.localUri);
              console.log('Cleaned up current local TTS file:', localTTSAudio.localUri);
            }
          } catch (error) {
            console.warn('Failed to clean up current local TTS file:', error);
          }
        } else {
          console.log('Skipping cleanup - file is in pending uploads:', localTTSAudio.localUri);
        }
      }
      
      // DON'T clean up pending uploads - they need to stay for upload
      console.log(`Keeping ${pendingTTSUploads.length} pending TTS files for upload/retry`);
      
      // Only clear the current local audio, NOT the pending uploads
      setLocalTTSAudio(null);
      // Note: We don't clear pendingTTSUploads here - they should only be cleared after successful upload
    } catch (error) {
      console.warn('Error cleaning up local TTS files:', error);
    }
  };

  // Stop audio when switching to a different question
  useEffect(() => {
    if (currentAudioPlayer) {
      currentAudioPlayer.remove();
      setCurrentAudioPlayer(null);
      setIsPlayingTTS(false);
    }
  }, [editingQuestion?.id, currentAudioPlayer]);

  // Load exercise data when editing
  useEffect(() => {
    if (edit && currentUserId) {
      loadExerciseForEdit(edit as string);
    }
  }, [edit, currentUserId]);

  const fetchTeacherData = async (userId: string) => {
    try {
      const { data } = await readData(`/teachers/${userId}`);
      if (data) {
        setTeacherData(data);
      }
    } catch (error) {
      console.error('Error fetching teacher data:', error);
    }
  };

  const loadExerciseForEdit = async (exerciseId: string) => {
    try {
      setLoading(true);
      const { data } = await readData(`/exercises/${exerciseId}`);
      if (data) {
        setExerciseId(exerciseId);
        setIsEditing(true);
        setExerciseTitle(data.title || '');
        setExerciseDescription(data.description || '');
        setIsPublic(data.isPublic || false);
        setExerciseCode(data.exerciseCode || '');
        setExerciseCategory(data.category || '');
        // Migrate old order arrays to reorderItems structure
        const migratedQuestions = (data.questions || []).map((q: any) => {
          if (q.type === 're-order' && q.order && !q.reorderItems) {
            return {
              ...q,
              reorderItems: q.order.map((item: string, index: number) => ({
                id: `migrated-${Date.now()}-${index}`,
                type: 'text' as const,
                content: item,
              })),
            };
          }
          return q;
        });
        setQuestions(migratedQuestions);
        if (data.resourceUrl) {
          setResourceFile({ name: 'Resource File', uri: data.resourceUrl });
        }
      } else {
        Alert.alert('Error', 'Exercise not found');
        router.back();
      }
    } catch (error) {
      console.error('Error loading exercise for edit:', error);
      Alert.alert('Error', 'Failed to load exercise');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  // Check if an image URI is local (from require())
  const isLocalImage = (uri: string): boolean => {
    return uri.includes('assets/') || uri.includes('file://') || uri.includes('content://');
  };

  // Upload local images to Firebase Storage and return remote URLs
  const uploadLocalImages = async (questions: Question[], exerciseCode: string): Promise<Question[]> => {
    const uploadPromises: Promise<any>[] = [];
    const updatedQuestions = [...questions];

    for (let qIndex = 0; qIndex < updatedQuestions.length; qIndex++) {
      const question = updatedQuestions[qIndex];
      
      // Handle question image
      if (question.questionImage && isLocalImage(question.questionImage)) {
        uploadPromises.push(
          uploadLocalImageToStorage(question.questionImage, `exercises/${exerciseCode}/question-${qIndex}`)
            .then(remoteUrl => {
              updatedQuestions[qIndex].questionImage = remoteUrl;
            })
        );
      }

      // Handle multiple question images
      if (question.questionImages && Array.isArray(question.questionImages)) {
        question.questionImages.forEach((imageUri, imgIndex) => {
          if (isLocalImage(imageUri)) {
            uploadPromises.push(
              uploadLocalImageToStorage(imageUri, `exercises/${exerciseCode}/question-${qIndex}-image-${imgIndex}`)
                .then(remoteUrl => {
                  if (!updatedQuestions[qIndex].questionImages) {
                    updatedQuestions[qIndex].questionImages = [...(question.questionImages || [])];
                  }
                  const questionImages = updatedQuestions[qIndex].questionImages;
                  if (questionImages && Array.isArray(questionImages) && questionImages.length > imgIndex) {
                    questionImages[imgIndex] = remoteUrl;
                  }
                })
            );
          }
        });
      }

      // Handle option images
      if (question.optionImages) {
        question.optionImages.forEach((imageUri, optionIndex) => {
          if (imageUri && isLocalImage(imageUri)) {
            uploadPromises.push(
              uploadLocalImageToStorage(imageUri, `exercises/${exerciseCode}/question-${qIndex}/option-${optionIndex}`)
                .then(remoteUrl => {
                  if (!updatedQuestions[qIndex].optionImages) {
                    updatedQuestions[qIndex].optionImages = [];
                  }
                  updatedQuestions[qIndex].optionImages![optionIndex] = remoteUrl;
                })
            );
          }
        });
      }

      // Handle pair images
      if (question.pairs) {
        question.pairs.forEach((pair, pairIndex) => {
          if (pair.leftImage && isLocalImage(pair.leftImage)) {
            uploadPromises.push(
              uploadLocalImageToStorage(pair.leftImage, `exercises/${exerciseCode}/question-${qIndex}/pair-${pairIndex}-left`)
                .then(remoteUrl => {
                  updatedQuestions[qIndex].pairs![pairIndex].leftImage = remoteUrl;
                })
            );
          }
          if (pair.rightImage && isLocalImage(pair.rightImage)) {
            uploadPromises.push(
              uploadLocalImageToStorage(pair.rightImage, `exercises/${exerciseCode}/question-${qIndex}/pair-${pairIndex}-right`)
                .then(remoteUrl => {
                  updatedQuestions[qIndex].pairs![pairIndex].rightImage = remoteUrl;
                })
            );
          }
        });
      }

      // Handle reorder item images
      if (question.reorderItems) {
        question.reorderItems.forEach((item, itemIndex) => {
          if (item.type === 'image' && item.imageUrl && isLocalImage(item.imageUrl)) {
            uploadPromises.push(
              uploadLocalImageToStorage(item.imageUrl, `exercises/${exerciseCode}/question-${qIndex}/reorder-${itemIndex}`)
                .then(remoteUrl => {
                  updatedQuestions[qIndex].reorderItems![itemIndex].imageUrl = remoteUrl;
                  updatedQuestions[qIndex].reorderItems![itemIndex].content = remoteUrl;
                })
            );
          }
        });
      }
    }

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);
    return updatedQuestions;
  };

  // Upload a single local image to Firebase Storage
  const uploadLocalImageToStorage = async (localUri: string, storagePath: string): Promise<string> => {
    try {
      // For local images from require(), we need to get the actual file
      const response = await fetch(localUri);
      const blob = await response.blob();
      
      const { downloadURL, error } = await uploadFile(`${storagePath}.png`, blob, {
        contentType: 'image/png',
      });
      
      if (error) {
        console.error('Failed to upload local image:', error);
        return localUri; // Return original URI if upload fails
      }
      
      return downloadURL || localUri;
    } catch (error) {
      console.error('Error uploading local image:', error);
      return localUri; // Return original URI if upload fails
    }
  };
  
  // Modal management functions
  const openModal = (modalName: string) => {
    setModalStack(prev => {
      // Prevent duplicate modals in the stack
      if (prev.includes(modalName)) return prev;
      return [...prev, modalName];
    });
  };
  
  const closeModal = () => {
    setModalStack(prev => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  };
  
  const closeAllModals = () => {
    setModalStack([]);
  };
  
  const getCurrentModal = () => {
    return modalStack[modalStack.length - 1];
  };
  
  const isModalOpen = (modalName: string) => {
    return modalStack.includes(modalName);
  };

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

  // Dynamic stock image categories - easily extensible for new folders
  const stockImageCategories = [
    {
      id: 'water-animals',
      name: 'Water Animals',
      icon: 'fish',
      color: '#0ea5e9',
      images: stockImages['Water Animals'].map(animal => ({
        name: animal.name,
        source: animal.uri
      }))
    },
    {
      id: 'alphabet',
      name: 'Alphabet',
      icon: 'alphabetical',
      color: '#8b5cf6',
      images: stockImages['Alphabet'].map(letter => ({
        name: letter.name,
        source: letter.uri
      }))
    },
    {
      id: 'fruits',
      name: 'Fruits',
      icon: 'food-apple',
      color: '#10b981',
      images: stockImages['Fruits'].map(fruit => ({
        name: fruit.name,
        source: fruit.uri
      }))
    },
    {
      id: 'land-animals',
      name: 'Land Animals',
      icon: 'paw',
      color: '#f59e0b',
      images: stockImages['Land Animals'].map(animal => ({
        name: animal.name,
        source: animal.uri
      }))
    },
    {
      id: 'math-symbols',
      name: 'Math Symbols',
      icon: 'calculator',
      color: '#ef4444',
      images: stockImages['Math Symbols'].map(symbol => ({
        name: symbol.name,
        source: symbol.uri
      }))
    },
    {
      id: 'numbers',
      name: 'Numbers',
      icon: 'numeric',
      color: '#3b82f6',
      images: stockImages['Numbers'].map(number => ({
        name: number.name,
        source: number.uri
      }))
    },
    {
      id: 'school-supplies',
      name: 'School Supplies',
      icon: 'school',
      color: '#06b6d4',
      images: stockImages['School Supplies'].map(supply => ({
        name: supply.name,
        source: supply.uri
      }))
    },
    {
      id: 'shapes',
      name: 'Shapes',
      icon: 'shape',
      color: '#84cc16',
      images: stockImages['Shapes'].map(shape => ({
        name: shape.name,
        source: shape.uri
      }))
    },
    {
      id: 'toys',
      name: 'Toys',
      icon: 'toy-brick',
      color: '#ec4899',
      images: stockImages['Toys'].map(toy => ({
        name: toy.name,
        source: toy.uri
      }))
    }
  ];

  const addQuestion = (type: string) => {
    const newQuestion: any = {
      id: Date.now().toString(),
      type: type as Question['type'],
      question: '',
      answer: type === 'multiple-choice' ? '' : type === 'matching' ? [] : type === 're-order' ? [] : '',
    };

    // Only add fields that are not undefined
    if (type === 'multiple-choice') {
      newQuestion.options = ['', '', '', ''];
      newQuestion.optionImages = [null, null, null, null];
      newQuestion.multiAnswer = false;
    }
    
    if (type === 'matching') {
      newQuestion.pairs = [{ left: '', right: '', leftImage: null, rightImage: null }];
    }
    
    if (type === 're-order') {
      newQuestion.order = [''];
      newQuestion.reorderItems = [{ id: Date.now().toString(), type: 'text', content: '' }];
      newQuestion.reorderDirection = 'asc';
    }
    
    if (type === 'reading-passage') {
      newQuestion.passage = '';
      newQuestion.subQuestions = [];
    }
    
    if (type === 'identification') {
      newQuestion.fillSettings = { caseSensitive: false, showBoxes: false };
    }
    
    newQuestion.questionImage = null;
    setQuestions([...questions, newQuestion]);
    setEditingQuestion(newQuestion);
    setShowQuestionTypeModal(false);
    closeModal();
    openModal('questionEditor');
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

  // Function to save TTS audio locally
  const saveTTSAudioLocally = async (base64Audio: string, questionId: string): Promise<string> => {
    try {
      console.log('Saving TTS audio locally...');
      
      // Create file name and local path using the cache directory
      const fileName = `tts_${questionId}_${Date.now()}.mp3`;
      const localUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      // Write to local file system using the legacy API
      await FileSystem.writeAsStringAsync(localUri, base64Audio, {
        encoding: 'base64',
      });
      
      console.log('TTS audio saved locally as MP3:', localUri);
      console.log('File will be kept for upload - not deleted immediately');
      return localUri;
      
    } catch (error) {
      console.error('Error saving TTS audio locally:', error);
      throw error;
    }
  };

  // Function to upload local MP3 file to Firebase Storage
  const uploadTTSAudioToStorage = async (localUri: string, exerciseCode: string, questionId: string): Promise<string> => {
    try {
      console.log('Uploading local MP3 file to Firebase Storage...');
      console.log('Local file path:', localUri);
      
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        throw new Error(`Local TTS file not found: ${localUri}`);
      }
      
      console.log('File exists, size:', fileInfo.size, 'bytes');
      
      // Create file name and storage path
      const fileName = `tts_${questionId}_${Date.now()}.mp3`;
      const storagePath = `exercises/${exerciseCode}/tts/${fileName}`;
      
      // Fetch the local file and convert to blob
      console.log('Fetching local file...');
      const response = await fetch(localUri);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch local file: ${response.status} ${response.statusText}`);
      }
      
      console.log('Converting response to blob...');
      const blob = await response.blob();
      
      console.log('Blob created, size:', blob.size, 'bytes, type:', blob.type);
      
      // Upload blob to Firebase Storage
      console.log('Uploading to Firebase Storage...');
      const result = await uploadFile(storagePath, blob, {
        contentType: 'audio/mpeg'
      });
      
      if (result.error) {
        throw new Error(`Firebase Storage error: ${result.error}`);
      }
      
      if (!result.downloadURL) {
        throw new Error('Firebase Storage did not return a download URL');
      }
      
      // Validate the download URL
      if (!result.downloadURL.startsWith('http')) {
        throw new Error('Invalid download URL received from Firebase Storage');
      }
      
      console.log('TTS audio uploaded successfully to Firebase Storage as MP3');
      console.log('Download URL:', result.downloadURL);
      
      return result.downloadURL;
      
    } catch (error) {
      console.error('Error uploading TTS audio to Firebase Storage:', error);
      throw new Error('Audio generated but failed to upload TTS audio to Firebase.');
    }
  };

  // Function to upload all pending TTS audio files
  const uploadPendingTTSAudio = async (exerciseCode: string, currentQuestions: Question[]): Promise<Question[]> => {
    if (pendingTTSUploads.length === 0) return currentQuestions;
    
    const uploadStart = Date.now();
    console.log(`🎵 Uploading ${pendingTTSUploads.length} pending TTS audio files as MP3...`);
    
    let updatedQuestions = [...currentQuestions];
    const successfulUploads: string[] = [];
    const failedUploads: any[] = [];
    
    for (const ttsAudio of pendingTTSUploads) {
      try {
        const fileStart = Date.now();
        console.log(`🎵 Uploading TTS for question ${ttsAudio.questionId} from: ${ttsAudio.localUri}`);
        
        // Upload using local file path
        const audioUrl = await uploadTTSAudioToStorage(ttsAudio.localUri, exerciseCode, ttsAudio.questionId);
        const fileTime = Date.now() - fileStart;
        
        console.log(`✅ TTS uploaded as MP3 for question ${ttsAudio.questionId} in ${fileTime}ms`);
        
        // Update the question with the Firebase URL in the local array
        updatedQuestions = updatedQuestions.map(q => 
          q.id === ttsAudio.questionId ? { ...q, ttsAudioUrl: audioUrl } : q
        );
        
        // Also update the state for UI consistency
        updateQuestion(ttsAudio.questionId, {
          ttsAudioUrl: audioUrl
        });
        
        // Clean up local file ONLY after successful upload
        try {
          const fileInfo = await FileSystem.getInfoAsync(ttsAudio.localUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(ttsAudio.localUri);
            console.log(`🗑️ Cleaned up local TTS file for question ${ttsAudio.questionId}`);
          }
        } catch (cleanupError) {
          console.warn('⚠️ Failed to clean up local TTS file:', cleanupError);
        }
        
        // Track successful upload
        successfulUploads.push(ttsAudio.questionId);
        
      } catch (error) {
        console.error(`❌ Failed to upload TTS audio for question ${ttsAudio.questionId}:`, error);
        console.log(`🔄 Local file kept for retry: ${ttsAudio.localUri}`);
        
        // Track failed upload
        failedUploads.push(ttsAudio);
      }
    }
    
    const totalTime = Date.now() - uploadStart;
    console.log(`🎵 TTS Upload Complete: ${successfulUploads.length} successful, ${failedUploads.length} failed in ${totalTime}ms`);
    
    // Only clear successful uploads from pending list
    if (successfulUploads.length > 0) {
      setPendingTTSUploads(prev => prev.filter(p => !successfulUploads.includes(p.questionId)));
      console.log(`🎵 Cleared ${successfulUploads.length} successful uploads from pending list`);
    }
    
    // Keep failed uploads in pending list for retry
    if (failedUploads.length > 0) {
      console.log(`🔄 Keeping ${failedUploads.length} failed uploads for retry`);
    }
    
    // Clear current local audio only if no pending uploads remain
    if (pendingTTSUploads.length === successfulUploads.length) {
      setLocalTTSAudio(null);
    }
    
    return updatedQuestions;
  };

  // Function to clean question text and remove any answers
  const cleanQuestionText = (questionText: string, answer: string): string => {
    let cleaned = questionText;
    
    // Remove parenthetical hints that include the answer
    cleaned = cleaned.replace(/\([^)]*show[^)]*image[^)]*\)/gi, '');
    cleaned = cleaned.replace(/\([^)]*ipakita[^)]*image[^)]*\)/gi, '');
    cleaned = cleaned.replace(/\([^)]*show[^)]*\)/gi, '');
    cleaned = cleaned.replace(/\([^)]*ipakita[^)]*\)/gi, '');
    
    // Remove direct mentions of the answer in the question
    const answerVariations = [
      answer,
      answer.toLowerCase(),
      answer.toUpperCase(),
      answer.charAt(0).toUpperCase() + answer.slice(1).toLowerCase()
    ];
    
    answerVariations.forEach(variation => {
      // Remove patterns like "Tingnan ang 'Answer'" or "Look at the 'Answer'"
      cleaned = cleaned.replace(new RegExp(`(Tingnan ang|Look at the|See the)\\s*['"]?${variation}['"]?`, 'gi'), '');
      // Remove patterns like "Ito ay isang Answer" or "This is a Answer"
      cleaned = cleaned.replace(new RegExp(`(Ito ay isang|This is a|This is an)\\s+${variation}`, 'gi'), '');
      // Remove patterns like "Answer na nasa picture" or "Answer in the picture"
      cleaned = cleaned.replace(new RegExp(`${variation}\\s+(na nasa picture|in the picture|sa picture)`, 'gi'), '');
    });
    
    // Clean up extra spaces and punctuation
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s*\.\s*$/, '.');
    
    return cleaned;
  };

  // AI Questions Generator function
  const generateAIQuestions = async () => {
    if (!exerciseTitle.trim() || !exerciseDescription.trim() || !exerciseCategory.trim()) {
      Alert.alert('Error', 'Please fill in the exercise title, description, and category first');
      return;
    }

    if (!aiPrompt.trim()) {
      Alert.alert('Error', 'Please provide additional details for the AI to generate questions');
      return;
    }

    setIsGeneratingQuestions(true);

    try {
      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";
      
      console.log('Starting AI question generation with model: gemini-2.0-flash');
      
      // Get available stock images for reference
      const availableImages = Object.keys(stockImages).map(category => 
        `${category}: ${stockImages[category].map(img => img.name).join(', ')}`
      ).join('\n');

      const prompt = `You are an expert educational content creator for Grade 1 students in the Philippines. Generate ${numberOfQuestions} ${selectedQuestionType} questions based on the following exercise details:

EXERCISE DETAILS:
- Title: ${exerciseTitle}
- Description: ${exerciseDescription}
- Category: ${exerciseCategory}
- Additional Requirements: ${aiPrompt}

QUESTION TYPE: ${selectedQuestionType}

AVAILABLE STOCK IMAGES (use these in your questions when relevant but its not necessary):
${availableImages}

REQUIREMENTS FOR FILIPINO GRADE 1 STUDENTS:
1. Use simple Filipino language (Tagalog) mixed with ONLY WHEN English is necessary
2. Questions should be age-appropriate for 6-7 year old Filipino children
3. Use familiar Filipino words and concepts (e.g., "bahay", "pamilya", "pagkain", "kulay")
4. Make questions engaging with Filipino cultural context
5. Use simple sentence structures
6. Include visual concepts that Filipino children can relate to
7. MAXIMIZE USE OF STOCK IMAGES: Reference specific images from the available list in questions and options
8. When using images, mention the exact image name from the stock images list
9. CRITICAL: NEVER include the answer in the question text - questions should only ask, not provide answers

QUESTION TYPE SPECIFIC RULES:

FOR MULTIPLE CHOICE:
- Provide 4 simple options with only 1 correct answer
- The "answer" field should contain the EXACT text that appears in the options array
- The correct answer must be placed in a RANDOM position in the options array (not always first)
- All options should be plausible but only one should be correct
- Use simple, clear language for all options
- Include image references in options when relevant (e.g., "Apple", "Cat", "Circle")

FOR IDENTIFICATION:
- Ask for specific Filipino words, objects, or concepts
- The "answer" field should contain the correct answer text
- Do NOT include options array
- Do NOT include Emoji in the answer
- Focus on single-word or short phrase answers
- Use questionImage to show what students need to identify
- ALWAYS include alternative answers for Filipino variations
- Include common Filipino terms, English equivalents, and regional variations
- Example: If asking for "bahay", include alternatives like "house", "tahanan", "bahay-kubo"
- CRITICAL: NEVER mention the answer in the question text
- Use phrases like "Ano ang hugis nito?" (What shape is this?) instead of "Ano ang hugis nito? Tingnan ang 'Triangle'"
- Use "Ano ito?" (What is this?) instead of "Ano ito? Ito ay isang aso" (What is this? This is a dog)
- The question should only ask, not provide hints or answers

FOR MATCHING:
- Create pairs that Filipino children can easily understand
- The "answer" field should be an array of correct pair indices
- Include "pairs" array with left and right items
- Each pair should have clear, simple concepts
- Use images in pairs when relevant

FOR RE-ORDER:
- Create simple sequences (numbers, letters, daily activities, patterns)
- The "answer" field should be an array of items in correct order
- Include "reorderItems" array with text and/or image items
- Items should be logically connected and age-appropriate
- For pattern questions, use multiple images to show the sequence

FOR RE-ORDER PATTERN QUESTIONS:
- When creating pattern questions (number sequences, shape patterns, color progressions), use multiple images
- Include "questionImages" array with multiple image references to show the pattern sequence
- Create logical patterns that children can follow (e.g., 1-2-3-?, circle-square-circle-?, red-blue-red-?)
- Use numbers, shapes, colors, or objects in sequence
- The answer should be the next item in the pattern
- ALWAYS use questionImages array for pattern questions, NOT questionImage
- Include 3-4 images in the pattern sequence
- Make sure the pattern is clear and logical for Grade 1 students

CRITICAL IMAGE RELEVANCE RULES:
- questionImage MUST be factually relevant to the main subject of the question
- If question asks about animals that give milk, questionImage should be a cow, goat, or milk-related image
- If question asks about shapes, questionImage should show the specific shape being asked about
- If question asks about colors, questionImage should show objects of that color
- NEVER use irrelevant images (e.g., pig image for milk question, cat image for dog question)
- questionImage should help students understand what the question is asking about
- If no relevant image exists in stock images, do NOT include questionImage
- For pattern questions, use questionImages array with multiple relevant images

YOU CAN ALSO USE EMOJIS INSTEAD OF USING ONLY PICTURES

IMPORTANT: Respond ONLY with valid JSON array. No additional text before or after.

JSON Format for Multiple Choice:
[
  {
    "question": "Simple question in Filipino/English mix",
    "answer": "Exact text that appears in options array",
    "options": ["Option A", "Correct Answer", "Option C", "Option D"],
    "imageReferences": ["Image Name 1", "Image Name 2"]
  }
]

JSON Format for Identification:
[
  {
    "question": "Ano ang hugis nito?",
    "answer": "Triangle",
    "imageReferences": ["Triangle"],
    "alternativeAnswers": ["tatsulok", "triangle", "shape with three sides"]
  }
]

JSON Format for Matching:
[
  {
    "question": "Match the items",
    "answer": [0, 1, 2],
    "pairs": [
      {"left": "Item 1", "right": "Match 1"},
      {"left": "Item 2", "right": "Match 2"},
      {"left": "Item 3", "right": "Match 3"}
    ],
    "imageReferences": ["Image Name 1", "Image Name 2"]
  }
]

JSON Format for Re-order (regular sequence):
[
  {
    "question": "Put these in the correct order",
    "answer": ["First", "Second", "Third"],
    "reorderItems": [
      {"type": "text", "content": "First item"},
      {"type": "text", "content": "Second item"},
      {"type": "text", "content": "Third item"}
    ],
    "imageReferences": ["Image Name 1", "Image Name 2"]
  }
]

JSON Format for Re-order (pattern with multiple images):
[
  {
    "question": "What comes next in this pattern?",
    "answer": "Next item in pattern",
    "questionImages": ["Number 1", "Number 2", "Number 3"],
    "imageReferences": ["Number 1", "Number 2", "Number 3", "Number 4"]
  }
]

IMPORTANT FOR PATTERN QUESTIONS:
- Always use "questionImages" array (not "questionImage") for pattern questions
- Include 3-4 images in the pattern sequence
- Use specific image names from the available stock images
- Make the pattern logical and easy to follow
- The question should ask "What comes next?" or "What is the next item?"

IMPORTANT FOR IDENTIFICATION ALTERNATIVE ANSWERS:
- ALWAYS include alternative answers for identification questions
- Include Filipino variations, English equivalents, and regional terms
- Examples of good alternative answers:
  * For "bahay": ["house", "tahanan", "bahay-kubo", "home"]
  * For "aso": ["dog", "aso", "canine"]
  * For "tubig": ["water", "tubig", "liquid"]
  * For "araw": ["sun", "araw", "sunshine", "sikat ng araw"]
  * For "bulaklak": ["flower", "bulaklak", "bloom"]
- Include 2-4 alternative answers per question
- Use simple, common terms that Grade 1 students would know

CRITICAL RULE FOR IDENTIFICATION QUESTIONS:
- NEVER mention the answer in the question text
- WRONG: "Ano ang hugis nito? Tingnan ang 'Triangle'"
- WRONG: "Ano ito? Ito ay isang aso"
- WRONG: "What is this? This is a house"
- WRONG: "Ano ang shape na nasa picture? (ipakita ang image ng Square)"
- WRONG: "What shape is this? (show the image of a Square)"
- CORRECT: "Ano ang hugis nito?" (What shape is this?)
- CORRECT: "Ano ito?" (What is this?)
- CORRECT: "What is this?"
- CORRECT: "Ano ang shape na nasa picture?" (What shape is in the picture?)
- The question should ONLY ask, never provide hints or answers
- Do NOT include parenthetical hints like "(show the image of X)" or "(ipakita ang image ng X)"
- Do NOT include the answer in any form within the question text`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
      console.log('API URL:', apiUrl);
      
      // Retry logic for 503 errors
      let response;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        try {
          response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        })
      });

          if (response.ok) {
            break; // Success, exit retry loop
          } else if (response.status === 503) {
            attempts++;
            console.warn(`API returned 503 (Service Unavailable). Attempt ${attempts}/${maxAttempts}. Retrying in 1 second...`);
            if (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
              continue; // Retry
            } else {
              const errorText = await response.text();
              console.error('API Error after max attempts:', response.status, errorText);
              throw new Error(`API Error: ${response.status} - Service unavailable after ${maxAttempts} attempts`);
            }
          } else {
            // Other error, don't retry
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`API Error: ${response.status}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('503') && attempts < maxAttempts) {
            attempts++;
            console.warn(`Network error during API call. Attempt ${attempts}/${maxAttempts}. Retrying in 1 second...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            throw error; // Re-throw if not a 503 error or max attempts reached
          }
        }
      }

      if (!response) {
        throw new Error('Failed to get response from API after all retry attempts');
      }

      const data = await response.json();
      console.log('Full API Response:', JSON.stringify(data, null, 2));
      
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!generatedText) {
        throw new Error('No content generated by AI');
      }
      
      console.log('Generated questions text:', generatedText);
      
      // Clean and extract JSON from the response
      let cleanText = generatedText.trim();
      
      // Remove any markdown formatting
      cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Find JSON array in the response
      const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('No JSON array found in response:', cleanText);
        throw new Error('No valid JSON array found in AI response');
      }

      let questionsData;
      try {
        questionsData = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Raw JSON string:', jsonMatch[0]);
        throw new Error('Invalid JSON format from AI response');
      }
      
      if (!Array.isArray(questionsData)) {
        throw new Error('Generated data is not an array');
      }

      if (questionsData.length === 0) {
        throw new Error('No questions generated');
      }

      // Helper function to find stock image by name
      const findStockImageByName = (imageName: string): string | null => {
        for (const category of Object.keys(stockImages)) {
          const found = stockImages[category].find(img => 
            img.name.toLowerCase() === imageName.toLowerCase()
          );
          if (found) {
            return Image.resolveAssetSource(found.uri).uri;
          }
        }
        return null;
      };

      // Convert to Question objects with proper validation and image assignment
      const newQuestions: Question[] = questionsData.map((q: any, index: number) => {
        // Validate required fields
        if (!q.question || !q.answer) {
          throw new Error(`Question ${index + 1} is missing required fields`);
        }

        // Process based on question type
        let processedQuestion: Question = {
          id: `ai_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          type: selectedQuestionType as any,
          question: q.question.trim(),
          answer: '',
          fillSettings: {
            caseSensitive: false,
            showBoxes: false,
            allowShowWork: false
          }
        };


        // Apply question text cleaning for identification questions
        if (selectedQuestionType === 'identification') {
          processedQuestion.question = cleanQuestionText(q.question.trim(), q.answer.trim());
        }

        // Helper function to find stock image by name
        const findStockImageByName = (imageName: string): string | null => {
          for (const category of Object.keys(stockImages)) {
            const found = stockImages[category].find(img => 
              img.name.toLowerCase() === imageName.toLowerCase()
            );
            if (found) {
              return Image.resolveAssetSource(found.uri).uri;
            }
          }
          return null;
        };
          
          // Helper function to check if image is relevant to question
          const isImageRelevant = (imgName: string, questionText: string) => {
            const imgLower = imgName.toLowerCase();
            const questionLower = questionText.toLowerCase();
            
            // Check for direct mentions
            if (questionLower.includes(imgLower)) return true;
            
          // Check for conceptual relevance
            if (questionLower.includes('gatas') || questionLower.includes('milk')) {
              return imgLower.includes('cow') || imgLower.includes('goat') || imgLower.includes('milk');
            }
            if (questionLower.includes('kulay') || questionLower.includes('color')) {
              return imgLower.includes('red') || imgLower.includes('blue') || imgLower.includes('green') || 
                     imgLower.includes('yellow') || imgLower.includes('orange') || imgLower.includes('purple');
            }
            if (questionLower.includes('hugis') || questionLower.includes('shape')) {
              return imgLower.includes('circle') || imgLower.includes('square') || imgLower.includes('triangle') || 
                     imgLower.includes('rectangle') || imgLower.includes('oval');
            }
            if (questionLower.includes('numero') || questionLower.includes('number')) {
              return imgLower.match(/\d/) || imgLower.includes('number');
            }
          if (questionLower.includes('pattern') || questionLower.includes('sunod') || 
              questionLower.includes('next') || questionLower.includes('susunod') ||
              questionLower.includes('sequence') || questionLower.includes('order')) {
            return imgLower.includes('number') || imgLower.includes('circle') || 
                   imgLower.includes('square') || imgLower.includes('triangle') || 
                   imgLower.includes('rectangle') || imgLower.includes('oval') ||
                   imgLower.includes('red') || imgLower.includes('blue') || 
                   imgLower.includes('green') || imgLower.includes('yellow');
          }
            
            return false;
          };
          
        // Process based on question type
        switch (selectedQuestionType) {
          case 'multiple-choice':
            // Process options and assign images
            let processedOptions = undefined;
            let optionImages = undefined;
            
            if (q.options && Array.isArray(q.options)) {
              processedOptions = q.options.map((opt: any) => String(opt).trim());
              optionImages = q.options.map((opt: any) => {
                const imageName = String(opt).trim();
                return findStockImageByName(imageName);
              });
        }

        // Find the correct answer letter by matching the answer text with options
        let correctAnswerLetter = '';
        const correctAnswerText = q.answer.trim();
            const correctIndex = processedOptions?.findIndex((option: string) => 
          option.toLowerCase() === correctAnswerText.toLowerCase()
            ) ?? -1;
        
        if (correctIndex !== -1) {
          correctAnswerLetter = String.fromCharCode(65 + correctIndex); // A, B, C, D
        } else {
          // Fallback: if no exact match, try partial match
              const partialIndex = processedOptions?.findIndex((option: string) => 
            option.toLowerCase().includes(correctAnswerText.toLowerCase()) ||
            correctAnswerText.toLowerCase().includes(option.toLowerCase())
              ) ?? -1;
          if (partialIndex !== -1) {
            correctAnswerLetter = String.fromCharCode(65 + partialIndex);
          } else {
            // Default to first option if no match found
            correctAnswerLetter = 'A';
            console.warn(`Could not match answer "${correctAnswerText}" with any option for question ${index}`);
          }
        }

            processedQuestion = {
              ...processedQuestion,
              answer: correctAnswerLetter,
          options: processedOptions,
              optionImages: optionImages
            };
            break;

          case 'identification':
            // Process alternative answers for identification questions
            let altAnswers = undefined;
            if (q.alternativeAnswers && Array.isArray(q.alternativeAnswers)) {
              altAnswers = q.alternativeAnswers.map((alt: any) => String(alt).trim()).filter(Boolean);
            }

            processedQuestion = {
              ...processedQuestion,
              answer: q.answer.trim(),
          fillSettings: {
            caseSensitive: false,
                showBoxes: false,
                allowShowWork: false,
                altAnswers: altAnswers
              }
            };
            break;

          case 'matching':
            // Process pairs
            let processedPairs = undefined;
            if (q.pairs && Array.isArray(q.pairs)) {
              processedPairs = q.pairs.map((pair: any) => ({
                left: pair.left?.trim() || '',
                right: pair.right?.trim() || '',
                leftImage: pair.leftImage ? findStockImageByName(pair.leftImage) : null,
                rightImage: pair.rightImage ? findStockImageByName(pair.rightImage) : null
              }));
            }

            processedQuestion = {
              ...processedQuestion,
              answer: Array.isArray(q.answer) ? q.answer : [],
              pairs: processedPairs
            };
            break;

          case 're-order':
            // Process reorder items
            let processedReorderItems = undefined;
            if (q.reorderItems && Array.isArray(q.reorderItems)) {
              processedReorderItems = q.reorderItems.map((item: any) => ({
                id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: item.type || 'text',
                content: item.content?.trim() || '',
                imageUrl: item.imageUrl || (item.type === 'image' ? findStockImageByName(item.content) : undefined)
              }));
            }

            processedQuestion = {
              ...processedQuestion,
              answer: Array.isArray(q.answer) ? q.answer : [],
              reorderItems: processedReorderItems,
              reorderDirection: 'asc'
            };
            break;

          case 'reading-passage':
            processedQuestion = {
              ...processedQuestion,
              answer: q.answer.trim(),
              passage: q.passage?.trim() || ''
            };
            break;
        }

        // Handle images based on question type
        let questionImage = null;
        let questionImages = undefined;

        // Check if this is a pattern question (has questionImages or multiple imageReferences)
        const isPatternQuestion = (q.questionImages && Array.isArray(q.questionImages) && q.questionImages.length > 0) ||
                                 (q.imageReferences && Array.isArray(q.imageReferences) && q.imageReferences.length > 1 && 
                                  (q.question.toLowerCase().includes('pattern') || q.question.toLowerCase().includes('sunod') || 
                                   q.question.toLowerCase().includes('next') || q.question.toLowerCase().includes('susunod')));

        if (q.imageReferences && Array.isArray(q.imageReferences) && q.imageReferences.length > 0) {
          if (selectedQuestionType === 're-order' && (q.imageReferences.length > 1 || isPatternQuestion)) {
            // For re-order questions with multiple images or pattern questions, use questionImages array
            questionImages = q.imageReferences.map((imgRef: string) => findStockImageByName(imgRef)).filter(Boolean);
          } else {
            // For other question types, use single questionImage
            questionImage = findStockImageByName(q.imageReferences[0]);
          }
        }

        // Handle special case for pattern questions with multiple images
        if (q.questionImages && Array.isArray(q.questionImages) && q.questionImages.length > 0) {
          questionImages = q.questionImages.map((imgRef: string) => findStockImageByName(imgRef)).filter(Boolean);
        }

        // If no specific image references, try to find images from question text
        if (!questionImage && !questionImages) {
          const questionText = q.question.toLowerCase();
          const usedOptionImages = new Set(
            (processedQuestion.optionImages || [])
              .filter((img: any) => img)
              .map((img: any) => img.toLowerCase())
          );
          
          // For pattern questions, collect up to 4 images
          const maxImages = isPatternQuestion ? 4 : 1;
          let imageCount = 0;
          
          for (const category of Object.keys(stockImages)) {
            for (const img of stockImages[category]) {
              const imgName = img.name.toLowerCase();
              // Only use image if it's relevant to question AND not used in options
              if (isImageRelevant(imgName, questionText) && !usedOptionImages.has(imgName)) {
                if (selectedQuestionType === 're-order' || isPatternQuestion || (q.questionImages && q.questionImages.length > 1)) {
                  // For pattern questions or re-order questions, collect multiple images
                  if (!questionImages) {
                    questionImages = [];
                  }
                  questionImages.push(Image.resolveAssetSource(img.uri).uri);
                  imageCount++;
                  console.log(`✅ Selected relevant question image: ${imgName} for pattern question: ${q.question.substring(0, 50)}...`);
                  
                  // Stop collecting images if we have enough or if it's not a pattern question
                  if (imageCount >= maxImages || !isPatternQuestion) {
                    break;
                  }
                } else {
                  questionImage = Image.resolveAssetSource(img.uri).uri;
                  console.log(`✅ Selected relevant question image: ${imgName} for question: ${q.question.substring(0, 50)}...`);
                  break;
                }
              }
            }
            if (questionImage || (questionImages && imageCount >= maxImages)) break;
          }
          
          // If no relevant image found, log it
          if (!questionImage && !questionImages) {
            console.log(`⚠️ No relevant image found for question: ${q.question.substring(0, 50)}...`);
          }
        }

        const finalQuestion = {
          ...processedQuestion,
          questionImage: questionImage,
          questionImages: questionImages
        };

        // Debug logging for pattern questions
        if (isPatternQuestion) {
          console.log(`🔍 Pattern question detected: ${q.question.substring(0, 50)}...`);
          console.log(`📸 Question images:`, questionImages);
          console.log(`🖼️ Single image:`, questionImage);
        }

        // Debug logging for identification questions with alternative answers
        if (selectedQuestionType === 'identification' && finalQuestion.fillSettings?.altAnswers?.length) {
          console.log(`🏷️ Identification question with alternatives: ${q.question.substring(0, 50)}...`);
          console.log(`📝 Main answer:`, finalQuestion.answer);
          console.log(`🔄 Alternative answers:`, finalQuestion.fillSettings.altAnswers);
        }

        return finalQuestion;
      });

      // Add generated questions to existing questions
      setQuestions(prev => [...prev, ...newQuestions]);
      
      // Generate TTS audio for all new questions sequentially to avoid rate limits
      console.log('Generating TTS audio for AI-generated questions sequentially...');
      setIsGeneratingTTS(true);
      
      // Process questions one by one with 3-second delays
      const processTTSSequentially = async () => {
        // Initialize progress tracking
        setTtsProgress({ current: 0, total: newQuestions.length });
        
        for (let i = 0; i < newQuestions.length; i++) {
          const question = newQuestions[i];
          
          try {
            console.log(`Processing TTS for question ${i + 1}/${newQuestions.length}: ${question.id}`);
            
            // Update progress
            setTtsProgress({ current: i + 1, total: newQuestions.length });
            
            // Preprocess the question text for TTS (enhanced version)
            const processedText = await preprocessTextForTTS(question.question);
            
            // Generate TTS audio directly without user prompt (use enhanced version)
            const audioData = await generateTTSForAI(processedText, question.id);
            
            if (audioData && typeof audioData === 'string') {
              // Save TTS audio locally
              const localUri = await saveTTSAudioLocally(audioData, question.id);
              
              // Add to pending uploads for later upload to Firebase
              setPendingTTSUploads(prev => [...prev, {
                questionId: question.id,
                localUri: localUri,
                base64Data: audioData
              }]);
              
              // Update the question to show it has TTS audio
              setQuestions(prev => prev.map(q => 
                q.id === question.id 
                  ? { ...q, ttsAudioUrl: 'pending' }
                  : q
              ));
              
              console.log(`✅ TTS generated for question: ${question.id}`);
            } else {
              console.warn(`⚠️ No audio data returned for question: ${question.id}`);
            }
          } catch (error) {
            console.error(`❌ Failed to generate TTS for question ${question.id}:`, error);
            // Continue with next question even if this one fails
          }
          
          // Add 3-second delay between requests (except for the last question)
          if (i < newQuestions.length - 1) {
            console.log('⏳ Waiting 3 seconds before next TTS generation...');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
        
        console.log('🎉 Sequential TTS generation completed for all AI-generated questions');
        setIsGeneratingTTS(false);
        setTtsProgress({ current: 0, total: 0 }); // Reset progress
      };
      
      // Start sequential processing (don't await to keep UI responsive)
      processTTSSequentially().catch((error) => {
        console.error('Sequential TTS generation failed:', error);
        setIsGeneratingTTS(false);
      });
      
      Alert.alert('Success', `Generated ${newQuestions.length} questions successfully! TTS audio is being generated in the background.`);
      setShowAIGenerator(false);
      setAiPrompt('');

    } catch (error) {
      console.error('Error generating AI questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Error', `Failed to generate questions: ${errorMessage}`);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Helper function to add basic stage directions if GPT fails
  const addBasicStageDirections = (text: string): string => {
    let enhanced = text;
    
    // Add excitement at the beginning if it's a greeting or instruction
    if (/^(hello|hi|good|welcome|kumusta|let's|today)/i.test(text)) {
      enhanced = `[excited]${enhanced}`;
    }
    
    // Add curiosity for questions
    if (text.includes('?') && !enhanced.includes('[')) {
      enhanced = enhanced.replace('?', '? [curious]');
    }
    
    // Add laughter for positive statements
    if (/\b(good|great|correct|yes|tama|magaling)\b/i.test(text)) {
      enhanced = enhanced.replace(/\b(good|great|correct|yes|tama|magaling)\b/i, '[laughs]$1');
    }
    
    // Add whisper for secrets or special information
    if (/\b(secret|special|amazing|surprise)\b/i.test(text)) {
      enhanced = enhanced.replace(/\b(secret|special|amazing|surprise)\b/i, '[whispers]$1');
    }
    
    // If still no stage directions, add a general excited tone
    if (!enhanced.includes('[')) {
      enhanced = `[excited]${enhanced}`;
    }
    
    return enhanced;
  };

  // TTS Preprocessing Function - Direct Gemini API call
  const preprocessTextForTTS = async (text: string): Promise<string> => {
    try {
      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";
      const prompt = `Transform this text for Text-to-Speech by adding emotional stage directions and improving punctuation. You MUST add at least 2-3 stage directions to make it engaging.

REQUIRED: Use these stage directions in square brackets:
[excited], [curious], [laughs], [whispers], [sighs], [mischievously], [sarcastic], [starts laughing], [exhales]

Rules:
1. ALWAYS add stage directions - don't return text unchanged
2. Add proper punctuation for natural pauses
3. Make it sound like a lively teacher or storyteller
4. Keep the original language (90% Filipino/10% English mix)
5. Place directions where they feel natural
6. Dont limit it to 1 emotion, add as many as you can
7. Dont say Ok Class, because it will show up 1 by one per student in their home phones.
8. Dont give the answer. hints only.
9. Dont use too much english words. Target audience are grade 1 students and their mother tongue is filipino.

Examples:
- "Hello kids" → "[excited]Hello kids!"
- "Let me tell you" → "[whispers]Let me tell you something amazing..."
- "That's correct" → "[laughs]That's absolutely correct!"

Original text: "${text}"

Enhanced text with emotions:`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        console.warn('⚠️ Gemini API failed, using original text');
        return text;
      }

      const data = await response.json();
      let processedText = data.candidates?.[0]?.content?.parts?.[0]?.text || text;
      console.log('Processed text:', processedText);
      
      // Check if Gemini actually added stage directions, if not, add some basic ones
      if (processedText === text || !processedText.includes('[')) {
        processedText = addBasicStageDirections(text);
      }
      
      return processedText.trim();
      
    } catch (error) {
      console.warn('⚠️ Gemini preprocessing failed, using original text');
      return text;
    }
  };

  // Function to handle TTS regeneration for existing questions
  const regenerateTTSForQuestion = async (questionId: string, text: string) => {
    // Clear any existing local TTS for this question
    setLocalTTSAudio(prev => prev?.questionId === questionId ? null : prev);
    setPendingTTSUploads(prev => {
      const filtered = prev.filter(p => p.questionId !== questionId);
      console.log('🎵 Regenerating TTS - cleared existing for question:', questionId, 'remaining count:', filtered.length);
      return filtered;
    });
    
    // Generate new TTS
    await generateTTS(text, true);
  };

  // TTS Functions
  const generateTTS = async (text: string, isRegenerate: boolean = false) => {
    if (!text.trim()) {
      Alert.alert('Error', 'Please enter some text to convert to speech');
      return;
    }

    // Performance Analytics
    const startTime = Date.now();
    const performanceLog = {
      textLength: text.trim().length,
      isRegenerate,
      steps: {} as Record<string, number>
    };

    console.log('🎤 TTS Generation Started:', {
      textLength: performanceLog.textLength,
      isRegenerate: performanceLog.isRegenerate
    });

    setIsGeneratingTTS(true);
    
    try {
      // Stop current audio if playing
      if (currentAudioPlayer) {
        currentAudioPlayer.remove();
        setCurrentAudioPlayer(null);
        setIsPlayingTTS(false);
      }

      // Step 1: Preprocess text through Gemini API
      const preprocessStart = Date.now();
      const processedText = await preprocessTextForTTS(text.trim());
      performanceLog.steps.preprocessing = Date.now() - preprocessStart;
      
      // Show processed text to teacher for approval
      const shouldProceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Review Processed Text',
          `Original: "${text.trim()}"\n\nProcessed: "${processedText}"\n\nDo you want to generate TTS with this enhanced text?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(false)
            },
            {
              text: 'Use Original',
              onPress: () => {
                // Use original text instead
                resolve(true);
              }
            },
            {
              text: 'Use Enhanced',
              onPress: () => resolve(true)
            }
          ]
        );
      });
      
      if (!shouldProceed) {
        setIsGeneratingTTS(false);
        return;
      }
      
      // Use processed text for TTS generation
      const finalTextForTTS = processedText;

      // Generate parameters for natural speech - ElevenLabs v3 only accepts specific stability values
      const stabilityOptions = [0.0, 0.5, 1.0]; // 0.0 = Creative, 0.5 = Natural, 1.0 = Robust
      const stability = isRegenerate ? 
        stabilityOptions[Math.floor(Math.random() * stabilityOptions.length)] :
        0.5; // Use Natural (0.5) as default
      
      const similarityBoost = isRegenerate ?
        Math.random() * 0.2 + 0.7 : // 0.7 to 0.9
        Math.random() * 0.1 + 0.8;  // 0.8 to 0.9

      // Step 2: Prepare request payload with final text and validated parameters
      const requestPayload: any = {
        text: finalTextForTTS,
        model_id: 'eleven_v3',
        voice_settings: {
          stability: stability,
          similarity_boost: Math.max(0, Math.min(1, similarityBoost)),
          style: 0.0,
          use_speaker_boost: true
        }
      };

      // Step 3: ElevenLabs API call with multiple API key fallback
      const elevenLabsStart = Date.now();
      
      try {
        const result = await callElevenLabsWithFallback(
          finalTextForTTS,
          'cgSgspJ2msm6clMCkdW9',
          true, // useV3
          'mp3_44100_128'
        );

      performanceLog.steps.elevenLabs = Date.now() - elevenLabsStart;
        performanceLog.steps.elevenLabsDetails = result.performanceLog;
        console.log(`✅ ElevenLabs TTS generated using API key: ${result.usedApiKey.substring(0, 10)}...`);

      // Convert response to base64 for React Native
        const audioBlob = result.audioBlob;
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        
        // Save audio locally
        console.log('🎵 TTS Audio generated, editingQuestion:', editingQuestion ? editingQuestion.id : 'null');
        if (editingQuestion) {
          try {
            const base64Audio = base64data.split(',')[1];
            const localUri = await saveTTSAudioLocally(base64Audio, editingQuestion.id);
            
            const ttsAudioData = {
              questionId: editingQuestion.id,
              localUri,
              base64Data: base64Audio
            };
            
            console.log('🎵 Adding TTS audio to pending uploads for question:', editingQuestion.id);
            setLocalTTSAudio(ttsAudioData);
            setPendingTTSUploads(prev => {
              const filtered = prev.filter(p => p.questionId !== editingQuestion.id);
              const updated = [...filtered, ttsAudioData];
              console.log('🎵 Pending uploads updated, count:', updated.length);
              return updated;
            });
          } catch (saveError) {
            console.error('❌ Failed to save TTS audio locally:', saveError);
            Alert.alert('Save Error', 'Audio generated but failed to save locally. Please try again.');
            return;
          }
        } else {
          // If no editingQuestion, we still need to save the audio for the current question being worked on
          // This handles cases where TTS is generated outside of the question editor
          console.warn('⚠️ TTS generated but no editingQuestion set - audio will not be saved for upload');
        }
        
        // Auto-play the generated speech
        try {
          setCurrentAudioUri(base64data);
          setIsPlayingTTS(true);
          
          const audioSource: AudioSource = { uri: base64data };
          const player = createAudioPlayer(audioSource);
          setCurrentAudioPlayer(player);
          
          const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlayingTTS(false);
              player.remove();
              setCurrentAudioPlayer(null);
            }
          });
          
          setTimeout(() => {
            try {
              player.play();
            } catch (playError) {
              console.error('❌ Auto-play failed:', playError);
              setIsPlayingTTS(false);
            }
          }, 100);
          
        } catch (playError) {
          console.error('❌ Auto-play Error:', playError);
          setIsPlayingTTS(false);
          setCurrentAudioPlayer(null);
        }
      };
      
      reader.readAsDataURL(audioBlob);
      
      } catch (elevenLabsError: any) {
        console.error('❌ All ElevenLabs API keys failed:', elevenLabsError);
        performanceLog.steps.elevenLabs = Date.now() - elevenLabsStart;
        throw new Error(`TTS Generation failed: ${elevenLabsError.message}`);
      }
      
      // Performance Analytics - Success
      const totalTime = Date.now() - startTime;
      performanceLog.steps.total = totalTime;
      
      console.log('✅ TTS Generation Complete:', {
        totalTime: `${totalTime}ms`,
        preprocessing: `${performanceLog.steps.preprocessing}ms`,
        elevenLabs: `${performanceLog.steps.elevenLabs}ms`,
        textLength: performanceLog.textLength,
        finalLength: finalTextForTTS.length
      });
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error('❌ TTS Generation Failed:', {
        error: error instanceof Error ? error.message : String(error),
        totalTime: `${totalTime}ms`,
        steps: performanceLog.steps
      });
      Alert.alert('Error', 'Failed to generate speech. Please try again.');
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  // TTS function specifically for AI-generated questions (no user prompt, uses enhanced version)
  const generateTTSForAI = async (processedText: string, questionId: string): Promise<string | null> => {
    if (!processedText.trim()) {
      console.error('No text provided for AI TTS generation');
      return null;
    }

    console.log('🎤 AI TTS Generation Started for question:', questionId);

    try {
      // Generate parameters for natural speech
      const stabilityOptions = [0.0, 0.5, 1.0];
      const stability = 0.5; // Use Natural (0.5) as default
      const similarityBoost = Math.random() * 0.1 + 0.8; // 0.8 to 0.9

      // Prepare request payload
      const requestPayload: any = {
        text: processedText,
        model_id: 'eleven_v3',
        voice_settings: {
          stability: stability,
          similarity_boost: Math.max(0, Math.min(1, similarityBoost)),
          style: 0.0,
          use_speaker_boost: true
        }
      };

      // ElevenLabs API call with multiple API key fallback
      try {
        const result = await callElevenLabsWithFallback(
          processedText,
          'cgSgspJ2msm6clMCkdW9',
          true, // useV3
          'mp3_44100_128'
        );
        
        console.log(`✅ AI TTS generated using API key: ${result.usedApiKey.substring(0, 10)}...`);

      // Process successful response
        const audioBlob = result.audioBlob;
      const reader = new FileReader();
      
      return new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const base64Audio = base64data.split(',')[1];
          console.log('🎵 AI TTS Audio generated successfully');
          resolve(base64Audio);
        };
        reader.onerror = () => reject(new Error('Failed to read audio blob'));
        reader.readAsDataURL(audioBlob);
      });
        
      } catch (elevenLabsError: any) {
        console.error('❌ All ElevenLabs API keys failed for AI TTS:', elevenLabsError);
        throw new Error(`AI TTS Generation failed: ${elevenLabsError.message}`);
      }

    } catch (error) {
      console.error('❌ AI TTS Generation Error:', error);
      return null;
    }
  };

  const playTTS = async (audioData?: string) => {
    // Use provided audioData (base64 for immediate playback) or stored Firebase URL
    let audioToPlay = audioData || editingQuestion?.ttsAudioUrl;
    
    // If TTS is pending, try to get the local audio file
    if (audioToPlay === 'pending' && editingQuestion) {
      const pendingTTS = pendingTTSUploads.find(p => p.questionId === editingQuestion.id);
      if (pendingTTS) {
        audioToPlay = pendingTTS.localUri;
        console.log('Using local TTS audio for pending question:', editingQuestion.id);
      }
    }
    
    console.log('playTTS called with:', {
      hasAudioData: !!audioData,
      hasEditingQuestionTTS: !!editingQuestion?.ttsAudioUrl,
      audioToPlay: audioToPlay ? (audioToPlay.startsWith('http') ? audioToPlay : audioToPlay.substring(0, 50) + '...') : 'null'
    });
    
    if (!audioToPlay) {
      Alert.alert('No Audio', 'Please generate speech first');
      return;
    }

    try {
      // Stop current audio if playing
      if (currentAudioPlayer) {
        console.log('Stopping current audio...');
        currentAudioPlayer.remove();
        setCurrentAudioPlayer(null);
        setIsPlayingTTS(false);
      }

      console.log('Creating new audio player...');
      setCurrentAudioUri(audioToPlay);

      // Create audio player with expo-audio
      const audioSource: AudioSource = { uri: audioToPlay };
      const player = createAudioPlayer(audioSource);
      
      setCurrentAudioPlayer(player);
      
      // Set up status listener
      const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        console.log('Audio status:', status);
        
        if (status.isLoaded) {
          if (status.playing) {
            setIsPlayingTTS(true);
            console.log('Audio is now playing');
          } else if (status.didJustFinish) {
            console.log('Audio playback finished');
            setIsPlayingTTS(false);
            player.remove();
            setCurrentAudioPlayer(null);
          }
        } else if ('error' in status) {
          console.error('Audio loading error:', (status as any).error);
          Alert.alert('Audio Error', 'Failed to load audio file');
          setIsPlayingTTS(false);
          player.remove();
          setCurrentAudioPlayer(null);
        }
      });
      
      // Wait a moment for the player to load, then start playback
      setTimeout(() => {
        try {
          console.log('Starting audio playback...');
          player.play();
          setIsPlayingTTS(true);
          console.log('Play command sent successfully');
        } catch (playError) {
          console.error('Play command failed:', playError);
          Alert.alert('Playback Error', 'Failed to start audio playback');
          setIsPlayingTTS(false);
        }
      }, 100);
      
    } catch (error: any) {
      console.error('Playback Error:', error);
      Alert.alert('Error', `Failed to play audio: ${error.message}`);
      setIsPlayingTTS(false);
      setCurrentAudioPlayer(null);
    }
  };

  const stopTTS = async () => {
    if (currentAudioPlayer) {
      console.log('Stopping audio...');
      currentAudioPlayer.remove();
      setCurrentAudioPlayer(null);
      setIsPlayingTTS(false);
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
    if (!exerciseCategory.trim()) {
      Alert.alert('Error', 'Please select a category');
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
    if (!q.options) return true;
    
    // Check if each option has either text or image
    const hasValidOptions = q.options.every((opt, index) => {
      const hasText = opt.trim().length > 0;
      const hasImage = q.optionImages?.[index] && q.optionImages[index] !== null;
      return hasText || hasImage;
    });
    
    if (!hasValidOptions) return true;
    
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

    // Generate exercise code if not already set
    const finalExerciseCode = exerciseCode || generateExerciseCode();

    // Save to Firebase Realtime Database
    const exercisePayload = {
      title: exerciseTitle.trim(),
      description: exerciseDescription.trim(),
      resourceUrl: uploadedUrl || null,
      questions,
      isPublic,
      exerciseCode: finalExerciseCode,
      category: exerciseCategory,
      createdAt: new Date().toISOString(),
    };

    try {
      console.log('Attempting to save exercise...');
      
      // Show loading indicator for image uploads
      setUploading(true);
      
      // Upload local images to Firebase Storage first
      console.log('Uploading local images to Firebase Storage...');
      const questionsWithRemoteImages = await uploadLocalImages(questions, finalExerciseCode);
      console.log('Local images uploaded successfully');
      
      // Upload pending TTS audio files to Firebase Storage
      let finalQuestions = questions;
      console.log('🎵 Checking pending TTS uploads, count:', pendingTTSUploads.length);
      console.log('🎵 Pending uploads:', pendingTTSUploads.map(p => ({ questionId: p.questionId, hasBase64: !!p.base64Data })));
      
      if (pendingTTSUploads.length > 0) {
        console.log(`🎵 Uploading ${pendingTTSUploads.length} TTS audio files...`);
        try {
          finalQuestions = await uploadPendingTTSAudio(finalExerciseCode, questions);
          console.log('✅ TTS audio files uploaded successfully');
        } catch (ttsError) {
          console.error('❌ Failed to upload TTS audio files:', ttsError);
          Alert.alert('Upload Error', 'Audio generated but failed to upload TTS audio to Firebase.');
          return; // Stop the save process if TTS upload fails
        }
      } else {
        console.log('ℹ️ No TTS audio files to upload');
      }
      
      // Clean the payload to ensure it's serializable
      const cleanPayload = {
        title: exerciseTitle.trim(),
        description: exerciseDescription.trim(),
        resourceUrl: uploadedUrl || null,
        teacherId: currentUserId,
        teacherName: teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Unknown Teacher',
        questionCount: finalQuestions.length,
        timesUsed: 0,
        questions: finalQuestions.map(q => {
          // Create a clean question object, removing all undefined values
          const cleanQuestion: any = {
            id: q.id,
            type: q.type,
            question: q.question?.trim() || '',
            answer: q.answer !== undefined ? (typeof q.answer === 'string' ? q.answer.trim() : q.answer) : null,
          };

          // Only add fields that have values (not undefined)
          if (q.options && q.options.length > 0) {
            cleanQuestion.options = q.options.map(opt => opt?.trim() || '');
          }
          
          if (q.optionImages && q.optionImages.length > 0) {
            cleanQuestion.optionImages = q.optionImages;
          }
          
          if (q.pairs && q.pairs.length > 0) {
            cleanQuestion.pairs = q.pairs;
          }
          
          if (q.order && q.order.length > 0) {
            cleanQuestion.order = q.order;
          }
          
          if (q.reorderItems && q.reorderItems.length > 0) {
            cleanQuestion.reorderItems = q.reorderItems;
          }
          
          if (q.subQuestions && q.subQuestions.length > 0) {
            cleanQuestion.subQuestions = q.subQuestions;
          }
          
          if (q.questionImage) {
            cleanQuestion.questionImage = q.questionImage;
          }
          
          if (q.questionImages && q.questionImages.length > 0) {
            cleanQuestion.questionImages = q.questionImages;
          }
          
          if (q.passage) {
            cleanQuestion.passage = q.passage;
          }
          
          if (q.multiAnswer !== undefined) {
            cleanQuestion.multiAnswer = q.multiAnswer;
          }
          
          if (q.reorderDirection) {
            cleanQuestion.reorderDirection = q.reorderDirection;
          }
          
          if (q.fillSettings) {
            cleanQuestion.fillSettings = q.fillSettings;
          }
          
          // TTS fields
          if (q.ttsAudioUrl) {
            cleanQuestion.ttsAudioUrl = q.ttsAudioUrl;
          }

          return cleanQuestion;
        }),
        isPublic: Boolean(isPublic),
        exerciseCode: finalExerciseCode,
        category: exerciseCategory,
        createdAt: new Date().toISOString(),
      };
      
      // Clean all undefined values from the payload
      const finalCleanPayload = cleanUndefinedValues(cleanPayload);
      
      // Additional check for answer fields specifically
      if (finalCleanPayload.questions) {
        finalCleanPayload.questions = finalCleanPayload.questions.map((q: any) => {
          if (q.answer === undefined) {
            console.warn('Found undefined answer in question:', q.id, 'type:', q.type);
            q.answer = null;
          }
          return q;
        });
      }
      
      // Validate no undefined values remain
      validateNoUndefined(finalCleanPayload, 'payload');
      
      console.log('Saving exercise with payload:', finalCleanPayload);
      console.log('Questions in payload:', finalCleanPayload.questions?.map((q: any) => ({
        id: q.id,
        type: q.type,
        answer: q.answer,
        hasAnswer: 'answer' in q
      })));
      
      let key: string | null = null;
      let error: string | null = null;
      
      if (isEditing && exerciseId) {
        // Update existing exercise
        const { success, error: updateError } = await updateData(`/exercises/${exerciseId}`, finalCleanPayload);
        if (success) {
          key = exerciseId;
        } else {
          error = updateError || 'Failed to update exercise';
        }
      } else {
        // Create new exercise
        const result = await pushData('/exercises', finalCleanPayload);
        key = result.key;
        error = result.error;
      }
      
      if (error || !key) {
        console.error('Firebase error:', error);
        
        // Try to provide more specific error messages
        let errorMessage = `Failed to ${isEditing ? 'update' : 'save'} exercise. `;
        if (error?.includes('permission')) {
          errorMessage += 'Permission denied. Please check your Firebase rules.';
        } else if (error?.includes('network')) {
          errorMessage += 'Network error. Please check your internet connection.';
        } else if (error?.includes('quota')) {
          errorMessage += 'Database quota exceeded. Please try again later.';
        } else {
          errorMessage += `Error: ${error || 'Unknown error'}`;
        }
        
        Alert.alert('Error', errorMessage);
        return;
      }
      
      console.log(`Exercise ${isEditing ? 'updated' : 'saved'} successfully with key:`, key);
      
      // If exercise is public, also save to public exercises collection
      if (isPublic) {
        try {
          const publicExercisePayload = {
            ...finalCleanPayload,
            id: key, // Use the same ID as the main exercise
            creatorName: teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Unknown Teacher',
            creatorId: currentUserId,
          };
          
          await pushData('/publicExercises', publicExercisePayload);
          console.log('Exercise also saved to public exercises');
        } catch (publicError) {
          console.error('Error saving to public exercises:', publicError);
          // Don't fail the whole operation if public save fails
        }
      }
      
      Alert.alert('Success', `Exercise ${isEditing ? 'updated' : 'created'} successfully!`, [
        { text: 'OK', onPress: () => router.push('/TeacherDashboard') }
      ]);
    } catch (error: any) {
      console.error('Error saving exercise:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to save exercise. ';
      if (error?.message?.includes('permission')) {
        errorMessage += 'Permission denied. Please check your Firebase rules.';
      } else if (error?.message?.includes('network')) {
        errorMessage += 'Network error. Please check your internet connection.';
      } else if (error?.message?.includes('quota')) {
        errorMessage += 'Database quota exceeded. Please try again later.';
      } else {
        errorMessage += `Error: ${error?.message || 'Unknown error'}`;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setUploading(false);
    }
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
    
    // Convert require() object to URI string
    const imageUri = Image.resolveAssetSource(imageSource).uri;
    
    if (type === 'question') {
      updateQuestion(questionId, { questionImage: imageUri });
    } else if (type === 'option' && optionIndex !== undefined) {
      const q = questions.find((q) => q.id === questionId);
      if (!q) return;
      const next = [...(q.optionImages || [])];
      next[optionIndex] = imageUri;
      updateQuestion(questionId, { optionImages: next });
    } else if (type === 'pair' && pairIndex !== undefined && side) {
      const q = questions.find((q) => q.id === questionId);
      if (!q || !q.pairs) return;
      const nextPairs = [...q.pairs];
      const target = { ...nextPairs[pairIndex] };
      if (side === 'left') target.leftImage = imageUri;
      else target.rightImage = imageUri;
      nextPairs[pairIndex] = target;
      updateQuestion(questionId, { pairs: nextPairs });
    }
    
    // Close stock image modal and return to question editor
    setShowStockImageModal(false);
    setStockImageContext(null);
    closeModal(); // Close stock image modal
    
    // Ensure question editor remains open
    setTimeout(() => {
      if (!isModalOpen('questionEditor')) {
        openModal('questionEditor');
      }
    }, 100);
  };

  const pickOptionImage = async (questionId: string, optionIndex: number) => {
    setImageLibraryContext({ questionId, optionIndex, type: 'option' });
    setShowImageLibrary(true);
    openModal('imageLibrary');
  };

  const handleImageSelect = (imageUri: string) => {
    if (!imageLibraryContext) return;
    
    const { questionId, optionIndex, pairIndex, side, reorderItemIndex, type } = imageLibraryContext;
    
    // Update the question with the selected image
    if (type === 'option' && optionIndex !== undefined) {
      const q = questions.find((q) => q.id === questionId);
      if (!q) return;
      const next = [...(q.optionImages || [])];
      next[optionIndex] = imageUri;
      updateQuestion(questionId, { optionImages: next });
    } else if (type === 'pair' && pairIndex !== undefined && side) {
      const q = questions.find((q) => q.id === questionId);
      if (!q || !q.pairs) return;
      const nextPairs = [...q.pairs];
      if (side === 'left') {
        nextPairs[pairIndex] = { ...nextPairs[pairIndex], leftImage: imageUri };
      } else {
        nextPairs[pairIndex] = { ...nextPairs[pairIndex], rightImage: imageUri };
      }
      updateQuestion(questionId, { pairs: nextPairs });
    } else if (type === 'question') {
      updateQuestion(questionId, { questionImage: imageUri });
    } else if (type === 'multiple-question') {
      addQuestionImage(questionId, imageUri);
    } else if (type === 'reorder' && reorderItemIndex !== undefined) {
      updateReorderItem(questionId, reorderItemIndex, { 
        type: 'image', 
        content: imageUri, 
        imageUrl: imageUri 
      });
    }
    
    // Close image library and return to question editor
    setShowImageLibrary(false);
    setImageLibraryContext(null);
    closeModal(); // Close image library modal
    
    // Ensure question editor remains open
    setTimeout(() => {
      if (!isModalOpen('questionEditor')) {
        openModal('questionEditor');
      }
    }, 100);
  };

  const handleImageUpload = async (categoryName?: string) => {
    try {
      setUploadingImage(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Check file size (10MB limit)
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Image must be smaller than 10MB');
          return;
        }
        
        // Upload to Firebase Storage
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const timestamp = Date.now();
        const filename = `custom-images/${categoryName || 'Custom Uploads'}/${timestamp}.jpg`;
        
        const { downloadURL, error: uploadError } = await uploadFile(filename, blob, {
          contentType: 'image/jpeg',
        });
        
        if (uploadError) {
          Alert.alert('Upload Failed', 'Failed to upload image to database');
          return;
        }
        
        // Store in database - always use "Custom Uploads" category
        const finalCategoryName = 'Custom Uploads';
        const categoryData = {
          name: finalCategoryName,
          imageUrl: downloadURL,
          uploadedAt: new Date().toISOString(),
        };
        
        const { key, error } = await pushData('/customImageCategories', categoryData);
        if (error) {
          console.error('Database error:', error);
        }
        
        // Update local state - always add to Custom Uploads
        if (downloadURL) {
          setCustomCategories(prev => ({
            ...prev,
            [finalCategoryName]: [...(prev[finalCategoryName] || []), downloadURL]
          }));
        }
        
        handleImageSelect(downloadURL || asset.uri);
      }
    } catch (error) {
      console.error('Image upload error:', error);
      Alert.alert('Upload Failed', 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }
    
    try {
      const categoryData = {
        name: newCategoryName.trim(),
        createdAt: new Date().toISOString(),
        images: [],
      };
      
      const { key, error } = await pushData('/imageCategories', categoryData);
      if (error) {
        Alert.alert('Error', 'Failed to create category');
        return;
      }
      
      setCustomCategories(prev => ({
        ...prev,
        [newCategoryName.trim()]: []
      }));
      
      setNewCategoryName('');
      setShowAddCategory(false);
      Alert.alert('Success', 'Category created successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create category');
    }
  };

  const pickPairImage = async (
    questionId: string,
    pairIndex: number,
    side: 'left' | 'right'
  ) => {
    setImageLibraryContext({ questionId, pairIndex, side, type: 'pair' });
    setShowImageLibrary(true);
    openModal('imageLibrary');
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
    // Directly open the Image Library for question image selection
    setImageLibraryContext({ questionId, type: 'question' });
    setShowImageLibrary(true);
    openModal('imageLibrary');
  };

  const pickMultipleQuestionImages = async (questionId: string) => {
    // Open the Image Library for multiple question image selection
    setImageLibraryContext({ questionId, type: 'multiple-question' });
    setShowImageLibrary(true);
    openModal('imageLibrary');
  };

  const addQuestionImage = (questionId: string, imageUri: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    const currentImages = question.questionImages || [];
    updateQuestion(questionId, { 
      questionImages: [...currentImages, imageUri] 
    });
  };

  const removeQuestionImage = (questionId: string, imageIndex: number) => {
    const question = questions.find(q => q.id === questionId);
    if (!question || !question.questionImages) return;

    const updatedImages = question.questionImages.filter((_, index) => index !== imageIndex);
    updateQuestion(questionId, { 
      questionImages: updatedImages.length > 0 ? updatedImages : undefined 
    });
  };

  // Helper function to clean undefined values from objects
  const cleanUndefinedValues = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => cleanUndefinedValues(item)).filter(item => item !== undefined);
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = cleanUndefinedValues(value);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
      return cleaned;
    }
    
    return obj;
  };

  // Helper function to validate no undefined values remain
  const validateNoUndefined = (obj: any, path: string = ''): void => {
    if (obj === undefined) {
      console.error(`Found undefined value at path: ${path}`);
      return;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        validateNoUndefined(item, `${path}[${index}]`);
      });
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        validateNoUndefined(value, `${path}.${key}`);
      }
    }
  };

  // Reorder item functions
  const addReorderItem = (questionId: string, type: 'text' | 'image' = 'text') => {
    const newItem: ReorderItem = {
      id: Date.now().toString(),
      type,
      content: type === 'text' ? '' : '',
      imageUrl: type === 'image' ? '' : undefined
    };
    
    const question = questions.find(q => q.id === questionId);
    if (question) {
      const currentItems = question.reorderItems || [];
      updateQuestion(questionId, { reorderItems: [...currentItems, newItem] });
      
      // If it's an image item, automatically open the image picker
      if (type === 'image') {
        const newItemIndex = currentItems.length; // Index of the newly added item
        pickReorderItemImage(questionId, newItemIndex);
      }
    }
  };

  const updateReorderItem = (questionId: string, itemIndex: number, updates: Partial<ReorderItem>) => {
    const question = questions.find(q => q.id === questionId);
    if (question && question.reorderItems) {
      const newItems = [...question.reorderItems];
      newItems[itemIndex] = { ...newItems[itemIndex], ...updates };
      updateQuestion(questionId, { reorderItems: newItems });
    }
  };

  const removeReorderItem = (questionId: string, itemIndex: number) => {
    const question = questions.find(q => q.id === questionId);
    if (question && question.reorderItems && question.reorderItems.length > 1) {
      const newItems = question.reorderItems.filter((_, index) => index !== itemIndex);
      updateQuestion(questionId, { reorderItems: newItems });
    }
  };

  const pickReorderItemImage = async (questionId: string, itemIndex: number) => {
    setImageLibraryContext({ questionId, reorderItemIndex: itemIndex, type: 'reorder' });
    setShowImageLibrary(true);
    openModal('imageLibrary');
  };

  const reorderItems = (questionId: string, newItems: ReorderItem[]) => {
    updateQuestion(questionId, { reorderItems: newItems });
  };

  // Render function for draggable reorder items
  const renderReorderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<ReorderItem>) => {
    const index = getIndex?.() ?? 0;
    const question = questions.find(q => q.id === editingQuestion?.id);
    if (!question || !question.reorderItems) return null;

    return (
      <TouchableOpacity
        style={[
          styles.reorderItemContainer,
          isActive && styles.reorderItemActive
        ]}
        onLongPress={drag}
        disabled={isActive}
      >
        <View style={styles.reorderItemContent}>
          <View style={styles.reorderItemNumber}>
            <Text style={styles.reorderItemNumberText}>{index + 1}</Text>
          </View>
          
          {item.type === 'text' ? (
            <TextInput
              style={styles.reorderTextInput}
              value={item.content}
              onChangeText={(text) => updateReorderItem(editingQuestion!.id, index, { content: text })}
              placeholder={`Item ${index + 1}`}
              placeholderTextColor="#9ca3af"
            />
          ) : (
            <View style={styles.reorderImageContainer}>
              {item.imageUrl && item.imageUrl.trim() !== '' ? (
                <Image source={{ uri: item.imageUrl }} style={styles.reorderImageThumbnail} />
              ) : (
                <View style={styles.reorderImagePlaceholder}>
                  <MaterialCommunityIcons name="image" size={24} color="#9ca3af" />
                </View>
              )}
            </View>
          )}
          
          <View style={styles.reorderItemActions}>
            {item.type === 'text' ? (
              <TouchableOpacity
                style={styles.reorderActionButton}
                onPress={() => pickReorderItemImage(editingQuestion!.id, index)}
              >
                <MaterialCommunityIcons name="image-plus" size={20} color="#3b82f6" />
              </TouchableOpacity>
            ) : (
              <View style={styles.reorderItemActionGroup}>
                <TouchableOpacity
                  style={styles.reorderActionButton}
                  onPress={() => pickReorderItemImage(editingQuestion!.id, index)}
                >
                  <MaterialCommunityIcons name="image-plus" size={20} color="#3b82f6" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reorderActionButton}
                  onPress={() => updateReorderItem(editingQuestion!.id, index, { type: 'text', content: '', imageUrl: undefined })}
                >
                  <MaterialCommunityIcons name="text" size={20} color="#3b82f6" />
                </TouchableOpacity>
              </View>
            )}
            
            {question.reorderItems.length > 1 && (
              <TouchableOpacity
                style={styles.reorderActionButton}
                onPress={() => removeReorderItem(editingQuestion!.id, index)}
              >
                <AntDesign name="close" size={16} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        <View style={styles.reorderDragHandle}>
          <MaterialCommunityIcons name="drag" size={20} color="#9ca3af" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderQuestionTypeModal = () => (
      <Modal
        visible={showQuestionTypeModal && getCurrentModal() === 'questionType'}
        transparent
        animationType="none"
        onRequestClose={() => {
          setShowQuestionTypeModal(false);
          closeModal();
        }}
      >
      <View style={styles.questionTypeModalOverlay}>
        <View style={styles.questionTypeModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Question Type</Text>
            <TouchableOpacity onPress={() => {
              setShowQuestionTypeModal(false);
              closeModal();
            }}>
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
        visible={!!editingQuestion && getCurrentModal() === 'questionEditor'}
        transparent={false}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setEditingQuestion(null);
          closeAllModals();
        }}
      >
        <View style={styles.fullScreenModal}>
          <View style={styles.fullScreenHeader}>
            <TouchableOpacity onPress={() => {
              setEditingQuestion(null);
              closeModal();
            }} style={styles.backButton}>
              <AntDesign name="arrow-left" size={24} color="#1e293b" />
            </TouchableOpacity>
            <Text style={styles.fullScreenTitle}>
              Edit {questionTypes.find(t => t.id === editingQuestion.type)?.title} Question
            </Text>
            <View style={styles.placeholder} />
          </View>
            
          <ScrollView style={styles.fullScreenContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Question</Text>
              <View style={styles.questionInputContainer}>
              <TextInput
                style={styles.textInput}
                value={editingQuestion.question}
                onChangeText={(text) => {
                  // Clean the question text to remove any answers
                  const cleanedText = editingQuestion.type === 'identification' && editingQuestion.answer 
                    ? cleanQuestionText(text, editingQuestion.answer as string)
                    : text;
                  updateQuestion(editingQuestion.id, { question: cleanedText });
                }}
                placeholder="Enter your question..."
                placeholderTextColor="#64748b"
                multiline
                textAlignVertical="top"
                autoFocus={true}
              />
                <View style={styles.ttsButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.ttsButton, isGeneratingTTS && styles.ttsButtonDisabled]}
                    onPress={() => generateTTS(editingQuestion.question)}
                    disabled={isGeneratingTTS || !editingQuestion.question.trim()}
                  >
                    <MaterialCommunityIcons 
                      name={isGeneratingTTS ? "loading" : "volume-high"} 
                      size={16} 
                      color={isGeneratingTTS || !editingQuestion.question.trim() ? "#9ca3af" : "#3b82f6"} 
                    />
                    <Text style={[styles.ttsButtonText, (isGeneratingTTS || !editingQuestion.question.trim()) && styles.ttsButtonTextDisabled]}>
                      {isGeneratingTTS ? 'Generating...' : 'Generate Speech'}
                    </Text>
                    {localTTSAudio?.questionId === editingQuestion.id && (
                      <View style={styles.pendingUploadIndicator}>
                        <MaterialCommunityIcons name="cloud-upload" size={12} color="#10b981" />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {editingQuestion.ttsAudioUrl && (
                    <TouchableOpacity
                      style={styles.ttsButton}
                      onPress={isPlayingTTS ? stopTTS : () => playTTS()}
                    >
                      <MaterialCommunityIcons 
                        name={isPlayingTTS ? "stop" : "play"} 
                        size={16} 
                        color="#10b981" 
                      />
                      <Text style={[styles.ttsButtonText, { color: '#10b981' }]}>
                        {isPlayingTTS ? 'Stop' : editingQuestion.ttsAudioUrl === 'pending' ? 'Play (Local)' : 'Play'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {editingQuestion.ttsAudioUrl && (
                    <TouchableOpacity
                      style={[styles.ttsButton, isGeneratingTTS && styles.ttsButtonDisabled]}
                      onPress={() => generateTTS(editingQuestion.question, true)}
                      disabled={isGeneratingTTS}
                    >
                      <MaterialCommunityIcons 
                        name="refresh" 
                        size={16} 
                        color={isGeneratingTTS ? "#9ca3af" : "#f59e0b"} 
                      />
                      <Text style={[styles.ttsButtonText, isGeneratingTTS && styles.ttsButtonTextDisabled, { color: isGeneratingTTS ? '#9ca3af' : '#f59e0b' }]}>
                        Regenerate
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity onPress={() => pickQuestionImage(editingQuestion.id)} style={styles.pickFileButton}>
                  <MaterialCommunityIcons name="image-plus" size={16} color="#ffffff" />
                  <Text style={styles.pickFileButtonText}>{editingQuestion.questionImage ? 'Change image' : 'Add image'}</Text>
                </TouchableOpacity>
                
                {/* Multiple images button for pattern questions */}
                {(editingQuestion.type === 're-order' || editingQuestion.type === 'identification') && (
                  <TouchableOpacity 
                    onPress={() => pickMultipleQuestionImages(editingQuestion.id)} 
                    style={[styles.pickFileButton, { marginLeft: 8, backgroundColor: '#f97316' }]}
                  >
                    <MaterialCommunityIcons name="image-multiple" size={16} color="#ffffff" />
                    <Text style={styles.pickFileButtonText}>Add Multiple Images</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {/* Single question image */}
                {editingQuestion.questionImage && (
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <Image 
                      source={{ uri: editingQuestion.questionImage }} 
                      style={{ width: 140, height: 140, borderRadius: 12, marginRight: 8 }} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                    <TouchableOpacity onPress={() => updateQuestion(editingQuestion.id, { questionImage: null })}>
                      <MaterialCommunityIcons name="trash-can" size={22} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              
              {/* Multiple question images */}
              {editingQuestion.questionImages && editingQuestion.questionImages.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Question Images ({editingQuestion.questionImages.length})</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {editingQuestion.questionImages.map((imageUri, index) => (
                      <View key={index} style={{ marginRight: 8, position: 'relative' }}>
                        <Image 
                          source={{ uri: imageUri }} 
                          style={{ width: 100, height: 100, borderRadius: 8 }} 
                          resizeMode="cover"
                          loadingIndicatorSource={require('../assets/images/icon.png')}
                        />
                        <TouchableOpacity 
                          onPress={() => removeQuestionImage(editingQuestion.id, index)}
                          style={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            backgroundColor: '#ef4444',
                            borderRadius: 12,
                            width: 24,
                            height: 24,
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}
                        >
                          <MaterialCommunityIcons name="close" size={16} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
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
                          placeholder={editingQuestion.optionImages?.[index] ? "Text (optional)" : "Type answer option here"}
                          placeholderTextColor="rgba(255,255,255,0.7)"
                        />
                        <TouchableOpacity onPress={() => pickOptionImage(editingQuestion.id, index)} style={{ marginLeft: 8 }}>
                          <MaterialCommunityIcons name="image-plus" size={22} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                      {(editingQuestion.optionImages?.[index]) && (
                        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                          <Image 
                            source={{ uri: editingQuestion.optionImages[index] as string }} 
                            style={{ width: 72, height: 72, borderRadius: 8, marginRight: 8 }} 
                            resizeMode="cover"
                            loadingIndicatorSource={require('../assets/images/icon.png')}
                          />
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
                      <View style={styles.previewHeader}>
                      <Text style={styles.previewLabel}>Preview</Text>
                        {(editingQuestion.pairs || []).length > 3 && (
                          <Text style={styles.scrollHint}>Scroll to see all pairs</Text>
                        )}
                      </View>
                      <View style={styles.scrollContainer}>
                      <ScrollView
                        style={styles.pairsPreviewVScroll}
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={styles.pairsPreviewVContainer}
                          nestedScrollEnabled={true}
                      >
                        {(editingQuestion.pairs || []).map((pair, idx) => (
                          <View key={`pr-${idx}`} style={[styles.pairPreviewCard, { alignSelf: 'center' }]}>
                            <View style={[styles.pairSide, styles.pairLeft, { backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'][idx % 5] }]}>
                              {pair.leftImage && pair.leftImage.trim() !== '' ? (
                                <Image source={{ uri: pair.leftImage }} style={styles.pairImage} />
                              ) : (
                                <Text style={styles.pairText}>{pair.left || 'Left item'}</Text>
                              )}
                            </View>
                            <View style={styles.pairConnector}>
                              <MaterialCommunityIcons name="arrow-right" size={20} color="#64748b" />
                            </View>
                            <View style={[styles.pairSide, styles.pairRight, { backgroundColor: ['#1e40af','#059669','#d97706','#dc2626','#7c3aed'][idx % 5] }]}>
                              {pair.rightImage && pair.rightImage.trim() !== '' ? (
                                <Image source={{ uri: pair.rightImage }} style={styles.pairImage} />
                              ) : (
                                <Text style={styles.pairText}>{pair.right || 'Right item'}</Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                      </View>
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
                          {pair.leftImage && pair.leftImage.trim() !== '' && (
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
                          {pair.rightImage && pair.rightImage.trim() !== '' && (
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
                  
                  {/* Draggable Reorder Items */}
                  <View style={styles.reorderContainer}>
                    <DraggableFlatList
                      data={editingQuestion.reorderItems || []}
                      renderItem={renderReorderItem}
                      keyExtractor={(item) => item.id}
                      onDragEnd={({ data }) => reorderItems(editingQuestion.id, data)}
                      scrollEnabled={false}
                    />
                  </View>
                  
                  {/* Add Item Buttons */}
                  <View style={styles.reorderAddButtons}>
                        <TouchableOpacity
                      style={styles.addReorderButton}
                      onPress={() => addReorderItem(editingQuestion.id, 'text')}
                    >
                      <MaterialCommunityIcons name="text" size={16} color="#3b82f6" />
                      <Text style={styles.addReorderButtonText}>Add Text Item</Text>
                        </TouchableOpacity>
                  <TouchableOpacity
                      style={styles.addReorderButton}
                      onPress={() => addReorderItem(editingQuestion.id, 'image')}
                    >
                      <MaterialCommunityIcons name="image-plus" size={16} color="#3b82f6" />
                      <Text style={styles.addReorderButtonText}>Add Image Item</Text>
                  </TouchableOpacity>
                  </View>
                  
                  {/* Preview */}
                  {(editingQuestion.reorderItems || []).length > 0 && (
                    <View style={styles.reorderPreview}>
                      <Text style={styles.reorderPreviewLabel}>Preview:</Text>
                      <View style={styles.reorderPreviewContainer}>
                        {(editingQuestion.reorderItems || []).map((item, i) => (
                          <View key={`prev-${i}`} style={[styles.reorderPreviewItem, { backgroundColor: ['#1e3a8a','#0f766e','#92400e','#7f1d1d','#5b21b6'][i % 5] }]}>
                            {item.type === 'text' ? (
                              <Text style={styles.reorderPreviewText}>{item.content || `Item ${i+1}`}</Text>
                            ) : item.imageUrl && item.imageUrl.trim() !== '' ? (
                              <Image source={{ uri: item.imageUrl }} style={styles.reorderPreviewImage} />
                            ) : (
                              <View style={styles.reorderPreviewPlaceholder}>
                                <MaterialCommunityIcons name="image" size={20} color="#ffffff" />
                              </View>
                            )}
                            <View style={styles.reorderPreviewNumber}>
                              <Text style={styles.reorderPreviewNumberText}>{i + 1}</Text>
                          </View>
                        </View>
                      ))}
                      </View>
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
                          <View style={styles.questionInputContainer}>
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
                            <View style={styles.ttsButtonsContainer}>
                              <TouchableOpacity
                                style={[styles.ttsButton, isGeneratingTTS && styles.ttsButtonDisabled]}
                                onPress={() => generateTTS(sub.question)}
                                disabled={isGeneratingTTS || !sub.question.trim()}
                              >
                                <MaterialCommunityIcons 
                                  name={isGeneratingTTS ? "loading" : "volume-high"} 
                                  size={16} 
                                  color={isGeneratingTTS || !sub.question.trim() ? "#9ca3af" : "#3b82f6"} 
                                />
                                <Text style={[styles.ttsButtonText, (isGeneratingTTS || !sub.question.trim()) && styles.ttsButtonTextDisabled]}>
                                  {isGeneratingTTS ? 'Generating...' : 'Generate Speech'}
                                </Text>
                                {localTTSAudio?.questionId === editingQuestion.id && (
                                  <View style={styles.pendingUploadIndicator}>
                                    <MaterialCommunityIcons name="cloud-upload" size={12} color="#10b981" />
                                  </View>
                                )}
                              </TouchableOpacity>
                              
                              {sub.ttsAudioUrl && (
                                <TouchableOpacity
                                  style={styles.ttsButton}
                                  onPress={isPlayingTTS ? stopTTS : () => playTTS(sub.ttsAudioUrl)}
                                >
                                  <MaterialCommunityIcons 
                                    name={isPlayingTTS ? "stop" : "play"} 
                                    size={16} 
                                    color="#10b981" 
                                  />
                                  <Text style={[styles.ttsButtonText, { color: '#10b981' }]}>
                                    {isPlayingTTS ? 'Stop' : sub.ttsAudioUrl === 'pending' ? 'Play (Local)' : 'Play'}
                                  </Text>
                                </TouchableOpacity>
                              )}
                              
                              {sub.ttsAudioUrl && (
                                <TouchableOpacity
                                  style={[styles.ttsButton, isGeneratingTTS && styles.ttsButtonDisabled]}
                                  onPress={() => generateTTS(sub.question, true)}
                                  disabled={isGeneratingTTS}
                                >
                                  <MaterialCommunityIcons 
                                    name="refresh" 
                                    size={16} 
                                    color={isGeneratingTTS ? "#9ca3af" : "#f59e0b"} 
                                  />
                                  <Text style={[styles.ttsButtonText, isGeneratingTTS && styles.ttsButtonTextDisabled, { color: isGeneratingTTS ? '#9ca3af' : '#f59e0b' }]}>
                                    Regenerate
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
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
                                <View style={styles.previewHeader}>
                                <Text style={styles.previewLabel}>Preview</Text>
                                  {(sub.pairs || []).length > 3 && (
                                    <Text style={styles.scrollHint}>Scroll to see all pairs</Text>
                                  )}
                                </View>
                                <View style={styles.scrollContainer}>
                                <ScrollView
                                  style={styles.pairsPreviewVScroll}
                                  showsVerticalScrollIndicator={true}
                                  contentContainerStyle={styles.pairsPreviewVContainer}
                                    nestedScrollEnabled={true}
                                >
                                  {(sub.pairs || []).map((pair, idx) => (
                                    <View key={`sub-pr-${idx}`} style={[styles.pairPreviewCard, { alignSelf: 'center' }]}>
                                      <View style={[styles.pairSide, styles.pairLeft, { backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'][idx % 5] }]}>
                                        {(pair as any).leftImage && (pair as any).leftImage.trim() !== '' ? (
                                          <Image source={{ uri: (pair as any).leftImage }} style={styles.pairImage} />
                                        ) : (
                                          <Text style={styles.pairText}>{pair.left || 'Left item'}</Text>
                                        )}
                                      </View>
                                      <View style={styles.pairConnector}>
                                        <MaterialCommunityIcons name="arrow-right" size={20} color="#64748b" />
                                      </View>
                                      <View style={[styles.pairSide, styles.pairRight, { backgroundColor: ['#1e40af','#059669','#d97706','#dc2626','#7c3aed'][idx % 5] }]}>
                                        {(pair as any).rightImage && (pair as any).rightImage.trim() !== '' ? (
                                          <Image source={{ uri: (pair as any).rightImage }} style={styles.pairImage} />
                                        ) : (
                                          <Text style={styles.pairText}>{pair.right || 'Right item'}</Text>
                                        )}
                                      </View>
                                    </View>
                                  ))}
                                </ScrollView>
                                </View>
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
                                    {(pair as any).leftImage && (pair as any).leftImage.trim() !== '' && (
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
                                    {(pair as any).rightImage && (pair as any).rightImage.trim() !== '' && (
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
                          id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

            <View style={styles.fullScreenActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => setEditingQuestion(null)}
              >
                <Text style={styles.saveButtonText}>Save Question</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{isEditing ? 'Loading exercise...' : 'Loading...'}</Text>
      </View>
    );
  }

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
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Exercise' : 'Create Exercise'}</Text>
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
          
          {/* Category Dropdown */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Category *</Text>
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
              >
                <Text style={[styles.dropdownButtonText, !exerciseCategory && styles.placeholderText]}>
                  {exerciseCategory || 'Select a category...'}
                </Text>
                <MaterialCommunityIcons 
                  name={showCategoryDropdown ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color="#64748b" 
                />
              </TouchableOpacity>
              
              {showCategoryDropdown && (
                <>
                  <TouchableOpacity
                    style={styles.dropdownOverlay}
                    onPress={() => setShowCategoryDropdown(false)}
                    activeOpacity={1}
                  />
                  <View style={styles.dropdownList}>
                    <ScrollView 
                      style={styles.dropdownScrollView}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                    >
                      {categoryOptions.map((category) => (
                        <TouchableOpacity
                          key={category}
                          style={styles.dropdownItem}
                          onPress={() => {
                            if (category === 'Custom') {
                              setShowCategoryDropdown(false);
                              setShowCustomCategoryModal(true);
                            } else {
                              setExerciseCategory(category);
                              setShowCategoryDropdown(false);
                            }
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{category}</Text>
                          {exerciseCategory === category && (
                            <MaterialCommunityIcons name="check" size={20} color="#3b82f6" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </>
              )}
            </View>
          </View>
          
          {/* Public/Private Toggle */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Visibility</Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleOption, !isPublic && styles.toggleOptionActive]}
                onPress={() => setIsPublic(false)}
              >
                <MaterialCommunityIcons name="lock" size={20} color={!isPublic ? "#ffffff" : "#64748b"} />
                <Text style={[styles.toggleText, !isPublic && styles.toggleTextActive]}>Private</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleOption, isPublic && styles.toggleOptionActive]}
                onPress={() => setIsPublic(true)}
              >
                <MaterialCommunityIcons name="earth" size={20} color={isPublic ? "#ffffff" : "#64748b"} />
                <Text style={[styles.toggleText, isPublic && styles.toggleTextActive]}>Public</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.visibilityHint}>
              {isPublic 
                ? "Public exercises can be shared with co-teachers and accessed by anyone with the exercise code"
                : "Private exercises are only visible to you"
              }
            </Text>
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
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.aiGeneratorButton}
                onPress={() => setShowAIGenerator(true)}
                disabled={!exerciseTitle.trim() || !exerciseDescription.trim() || !exerciseCategory.trim()}
              >
                <MaterialCommunityIcons name="robot" size={16} color="#ffffff" />
                <Text style={styles.aiGeneratorButtonText}>AI Generator</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addQuestionButton}
                onPress={() => {
                  setShowQuestionTypeModal(true);
                  openModal('questionType');
                }}
              >
                <AntDesign name="plus" size={16} color="#ffffff" />
                <Text style={styles.addQuestionButtonText}>Add Question</Text>
              </TouchableOpacity>
            </View>
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
                    onPress={() => {
                      setEditingQuestion(question);
                      openModal('questionEditor');
                    }}
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
            <Text style={styles.saveExerciseButtonText}>
              {uploading ? 'Uploading...' : (isEditing ? 'Update Exercise' : 'Create Exercise')}
              {pendingTTSUploads.length > 0 && ` (${pendingTTSUploads.length} TTS pending)`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {renderQuestionTypeModal()}
      {renderQuestionEditor()}
      
      {/* AI Questions Generator Modal */}
      <Modal
        visible={showAIGenerator}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAIGenerator(false)}
      >
        <View style={styles.aiModalOverlay}>
          <ScrollView 
            contentContainerStyle={styles.aiModalScrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.aiModal}>
              <View style={styles.aiModalHeader}>
                <Text style={styles.aiModalTitle}>AI Questions Generator</Text>
                <TouchableOpacity 
                  onPress={() => setShowAIGenerator(false)}
                  style={styles.aiModalClose}
                >
                  <AntDesign name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.aiModalContent}>
                <Text style={styles.aiModalLabel}>Exercise Details</Text>
                <View style={styles.aiExerciseInfo}>
                  <Text style={styles.aiExerciseText}><Text style={styles.aiExerciseLabel}>Title:</Text> {exerciseTitle}</Text>
                  <Text style={styles.aiExerciseText}><Text style={styles.aiExerciseLabel}>Category:</Text> {exerciseCategory}</Text>
                  <Text style={styles.aiExerciseText}><Text style={styles.aiExerciseLabel}>Description:</Text> {exerciseDescription}</Text>
                </View>
                
                <Text style={styles.aiModalLabel}>Additional Requirements</Text>
                <TextInput
                  style={styles.aiModalTextArea}
                  value={aiPrompt}
                  onChangeText={setAiPrompt}
                  placeholder="Halimbawa: 'Tungkol sa mga hayop sa bahay', 'Mga kulay at hugis', 'Bilang 1-10', 'Mga letra A-Z'"
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                />
                
                <View style={styles.aiModalRow}>
                  <View style={styles.aiModalInputGroup}>
                    <Text style={styles.aiModalLabel}>Number of Questions</Text>
                    <View style={styles.aiNumberSelector}>
                      <TouchableOpacity 
                        style={styles.aiNumberButton}
                        onPress={() => setNumberOfQuestions(Math.max(1, numberOfQuestions - 1))}
                      >
                        <AntDesign name="minus" size={16} color="#7c3aed" />
                      </TouchableOpacity>
                      <Text style={styles.aiNumberText}>{numberOfQuestions}</Text>
                      <TouchableOpacity 
                        style={styles.aiNumberButton}
                        onPress={() => setNumberOfQuestions(Math.min(20, numberOfQuestions + 1))}
                      >
                        <AntDesign name="plus" size={16} color="#7c3aed" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.aiModalInputGroup}>
                    <Text style={styles.aiModalLabel}>Question Type</Text>
                    <View style={styles.aiTypeSelector}>
                      {['multiple-choice', 'identification', 'matching', 're-order'].map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.aiTypeOption,
                            selectedQuestionType === type && styles.aiTypeOptionSelected
                          ]}
                          onPress={() => setSelectedQuestionType(type)}
                        >
                          <Text style={[
                            styles.aiTypeOptionText,
                            selectedQuestionType === type && styles.aiTypeOptionTextSelected
                          ]}>
                            {type === 'multiple-choice' ? 'Multiple Choice' : 
                             type === 'identification' ? 'Identification' :
                             type === 'matching' ? 'Matching' : 'Re-order'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
                
                <TouchableOpacity
                  style={[styles.aiGenerateButton, (isGeneratingQuestions || isGeneratingTTS) && styles.aiGenerateButtonDisabled]}
                  onPress={generateAIQuestions}
                  disabled={isGeneratingQuestions || isGeneratingTTS || !aiPrompt.trim()}
                >
                  {isGeneratingQuestions ? (
                    <>
                      <MaterialCommunityIcons name="loading" size={16} color="#ffffff" />
                      <Text style={styles.aiGenerateButtonText}>Generating Questions...</Text>
                    </>
                  ) : isGeneratingTTS ? (
                    <>
                      <MaterialCommunityIcons name="volume-high" size={16} color="#ffffff" />
                      <Text style={styles.aiGenerateButtonText}>Generating Audio...</Text>
                    </>
                  ) : (
                    <>
                      <MaterialCommunityIcons name="robot" size={16} color="#ffffff" />
                      <Text style={styles.aiGenerateButtonText}>Generate Questions</Text>
                    </>
                  )}
                </TouchableOpacity>
                
                {(isGeneratingQuestions || isGeneratingTTS) && (
                  <Text style={styles.aiStatusText}>
                    {isGeneratingQuestions 
                      ? "Creating questions with AI..." 
                      : ttsProgress.total > 0
                        ? `Generating TTS audio... (${ttsProgress.current}/${ttsProgress.total})`
                        : "Generating TTS audio for questions..."
                    }
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
      
      {/* Stock Image Modal */}
      <Modal
        visible={showStockImageModal && getCurrentModal() === 'stockImage'}
        transparent={false}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setShowStockImageModal(false);
          closeModal();
        }}
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
              onPress={() => {
                setShowStockImageModal(false);
                closeModal();
              }}
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

      {/* Inline Image Library */}
      <Modal
        visible={showImageLibrary && getCurrentModal() === 'imageLibrary'}
        transparent={false}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setShowImageLibrary(false);
          setImageLibraryContext(null);
          closeModal();
        }}
      >
        <View style={styles.fullScreenModal}>
            <View style={styles.fullScreenHeader}>
              <TouchableOpacity 
                onPress={() => {
                  setShowImageLibrary(false);
                  setImageLibraryContext(null);
                  closeModal();
                }}
                style={styles.backButton}
              >
                <AntDesign name="arrow-left" size={24} color="#1e293b" />
              </TouchableOpacity>
              <Text style={styles.fullScreenTitle}>Choose Image</Text>
              <View style={styles.placeholder} />
            </View>
            
            <ScrollView style={styles.fullScreenContent} showsVerticalScrollIndicator={false}>
            {/* Water Animals Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Water Animals</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Water Animals')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Water Animals'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`water-animal-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Alphabet Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Alphabet</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Alphabet')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Alphabet'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`alphabet-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Fruits Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Fruits</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Fruits')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Fruits'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`fruit-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Land Animals Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Land Animals</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Land Animals')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Land Animals'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`land-animal-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Math Symbols Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Math Symbols</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Math Symbols')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Math Symbols'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`math-symbol-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Numbers Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Numbers</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Numbers')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Numbers'].map((image, index) => (
                  <TouchableOpacity
                    key={`number-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* School Supplies Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>School Supplies</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('School Supplies')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['School Supplies'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`school-supply-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Shapes Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Shapes</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Shapes')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Shapes'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`shape-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Toys Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Toys</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Toys')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {stockImages['Toys'].slice(0, 8).map((image, index) => (
                  <TouchableOpacity
                    key={`toy-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(Image.resolveAssetSource(image.uri).uri)}
                  >
                    <Image 
                      source={image.uri} 
                      style={styles.horizontalImageThumbnail} 
                      resizeMode="cover"
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Custom Categories */}
            {Object.keys(customCategories).map((categoryName) => (
              <View key={categoryName} style={styles.imageCategory}>
                <Text style={styles.categoryTitle}>{categoryName}</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.horizontalImageScroll}
                  contentContainerStyle={styles.horizontalImageContainer}
                >
                  {/* Add button as first item */}
                  <TouchableOpacity
                    style={styles.addImageButton}
                    onPress={() => handleImageUpload(categoryName)}
                  >
                    <AntDesign name="plus" size={24} color="#3b82f6" />
                  </TouchableOpacity>
                  
                  {customCategories[categoryName].map((imageUrl, index) => (
                    <TouchableOpacity
                      key={`custom-${categoryName}-${index}`}
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(imageUrl)}
                    >
                      <Image 
                        source={{ uri: imageUrl }} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}

            {/* Custom Uploads Category - Always show this */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Custom Uploads</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalImageScroll}
                contentContainerStyle={styles.horizontalImageContainer}
              >
                {/* Add button as first item */}
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={() => handleImageUpload('Custom Uploads')}
                >
                  <AntDesign name="plus" size={24} color="#3b82f6" />
                </TouchableOpacity>
                
                {(customCategories['Custom Uploads'] || []).map((imageUrl, index) => (
                  <TouchableOpacity
                    key={`custom-uploads-${index}`}
                    style={styles.horizontalImageItem}
                    onPress={() => handleImageSelect(imageUrl)}
                  >
                    <Image source={{ uri: imageUrl }} style={styles.horizontalImageThumbnail} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Create Another Category Button */}
            <TouchableOpacity
              style={styles.createCategoryButton}
              onPress={() => {
                setShowAddCategory(true);
                openModal('addCategory');
              }}
            >
              <AntDesign name="plus" size={16} color="#10b981" />
              <Text style={styles.createCategoryButtonText}>Create another Category</Text>
            </TouchableOpacity>

            {/* Upload Button */}
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => handleImageUpload()}
              disabled={uploadingImage}
            >
              <AntDesign name="plus" size={16} color="#3b82f6" />
              <Text style={styles.uploadButtonText}>
                {uploadingImage ? 'Uploading...' : 'Upload Custom Image'}
              </Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>

      {/* Create Category Modal */}
      <Modal
        visible={showAddCategory && getCurrentModal() === 'addCategory'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowAddCategory(false);
          closeModal();
        }}
      >
        <View style={styles.categoryModalOverlay}>
          <View style={styles.categoryModal}>
            <View style={styles.categoryModalHeader}>
              <Text style={styles.categoryModalTitle}>Create New Category</Text>
              <TouchableOpacity 
                onPress={() => {
                  setShowAddCategory(false);
                  closeModal();
                }}
                style={styles.categoryModalClose}
              >
                <AntDesign name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.categoryModalContent}>
              <Text style={styles.categoryModalLabel}>Category Name</Text>
              <TextInput
                style={styles.categoryModalInput}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="Enter category name (e.g., Fruits, Shapes)"
                placeholderTextColor="#9ca3af"
              />
              
              <View style={styles.categoryModalActions}>
                <TouchableOpacity 
                  style={styles.categoryModalCancel}
                  onPress={() => {
                    setShowAddCategory(false);
                    setNewCategoryName('');
                  }}
                >
                  <Text style={styles.categoryModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.categoryModalCreate}
                  onPress={handleCreateCategory}
                >
                  <Text style={styles.categoryModalCreateText}>Create Category</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Category Modal */}
      <Modal
        visible={showCustomCategoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCustomCategoryModal(false);
          setCustomCategoryInput('');
        }}
      >
        <View style={styles.customCategoryModalOverlay}>
          <View style={styles.customCategoryModal}>
            <View style={styles.customCategoryModalHeader}>
              <Text style={styles.customCategoryModalTitle}>Custom Category</Text>
              <TouchableOpacity 
                onPress={() => {
                  setShowCustomCategoryModal(false);
                  setCustomCategoryInput('');
                }}
                style={styles.customCategoryModalClose}
              >
                <AntDesign name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.customCategoryModalContent}>
              <Text style={styles.customCategoryModalLabel}>Enter custom category name</Text>
              <TextInput
                style={styles.customCategoryModalInput}
                value={customCategoryInput}
                onChangeText={setCustomCategoryInput}
                placeholder="e.g., Science, History, Art..."
                placeholderTextColor="#9ca3af"
                autoFocus
              />
              
              <View style={styles.customCategoryModalActions}>
                <TouchableOpacity 
                  style={styles.customCategoryModalCancel}
                  onPress={() => {
                    setShowCustomCategoryModal(false);
                    setCustomCategoryInput('');
                  }}
                >
                  <Text style={styles.customCategoryModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.customCategoryModalSave,
                    !customCategoryInput.trim() && styles.customCategoryModalSaveDisabled
                  ]}
                  onPress={() => {
                    if (customCategoryInput.trim()) {
                      setExerciseCategory(customCategoryInput.trim());
                      setShowCustomCategoryModal(false);
                      setCustomCategoryInput('');
                    }
                  }}
                  disabled={!customCategoryInput.trim()}
                >
                  <Text style={[
                    styles.customCategoryModalSaveText,
                    !customCategoryInput.trim() && styles.customCategoryModalSaveTextDisabled
                  ]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
  
  // TTS Styles
  questionInputContainer: {
    position: 'relative',
  },
  ttsButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  ttsButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#d1d5db',
  },
  ttsButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 4,
  },
  ttsButtonTextDisabled: {
    color: '#9ca3af',
  },
  pendingUploadIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  
  // Dropdown Styles
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdownOverlay: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 999,
  },
  dropdownButton: {
    borderWidth: 2,
    borderColor: '#7c3aed',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#1e293b',
    flex: 1,
  },
  placeholderText: {
    color: '#64748b',
  },
  dropdownList: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7c3aed',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1001,
    maxHeight: 200,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownScrollView: {
    maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#1e293b',
    flex: 1,
  },
  
  // Button Container
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  
  // AI Generator Button
  aiGeneratorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  aiGeneratorButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
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
  
  // Full Screen Modal Styles
  fullScreenModal: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fullScreenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  fullScreenContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fullScreenActions: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  
  
  // Horizontal Image Layout Styles
  horizontalImageScroll: {
    marginTop: 8,
  },
  horizontalImageContainer: {
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  horizontalImageItem: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  horizontalImageThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  addImageButton: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scrollHint: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  scrollContainer: {
    position: 'relative',
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
    maxHeight: 300,
    marginVertical: 8,
  },
  pairsPreviewVContainer: {
    paddingBottom: 12,
    paddingHorizontal: 4,
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
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minWidth: 280,
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
    width: 72,
    height: 72,
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
  
  // Inline Image Library Styles
  inlineImageLibrary: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  libraryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  libraryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  libraryCloseButton: {
    padding: 4,
  },
  libraryContent: {
    backgroundColor: '#ffffff',
    maxHeight: '70%',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  imageCategory: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imageItem: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    margin: 20,
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 8,
  },
  createCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    margin: 20,
  },
  createCategoryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
    marginLeft: 8,
  },
  
  // Create Category Modal Styles
  categoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  categoryModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  categoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  categoryModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  categoryModalClose: {
    padding: 4,
  },
  categoryModalContent: {
    padding: 20,
  },
  categoryModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  categoryModalInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 20,
  },
  categoryModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryModalCancel: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  categoryModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  categoryModalCreate: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  categoryModalCreateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  
  // Custom Category Modal Styles
  customCategoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  customCategoryModal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  customCategoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customCategoryModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  customCategoryModalClose: {
    padding: 4,
  },
  customCategoryModalContent: {
    padding: 20,
  },
  customCategoryModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  customCategoryModalInput: {
    borderWidth: 2,
    borderColor: '#7c3aed',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    marginBottom: 20,
  },
  customCategoryModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  customCategoryModalCancel: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  customCategoryModalCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  customCategoryModalSave: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#7c3aed',
  },
  customCategoryModalSaveDisabled: {
    backgroundColor: '#d1d5db',
  },
  customCategoryModalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  customCategoryModalSaveTextDisabled: {
    color: '#9ca3af',
  },
  
  // Toggle styles
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 4,
  },
  toggleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  toggleOptionActive: {
    backgroundColor: '#3b82f6',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginLeft: 8,
  },
  toggleTextActive: {
    color: '#ffffff',
  },
  
  
  // Code info styles
  codeInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  codeInfoText: {
    fontSize: 14,
    color: '#3b82f6',
    marginLeft: 8,
    flex: 1,
  },
  
  // Visibility hint styles
  visibilityHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  
  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },

  // Reorder Items Styles
  reorderContainer: {
    marginBottom: 16,
  },
  reorderItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reorderItemActive: {
    backgroundColor: '#f0f9ff',
    borderColor: '#3b82f6',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  reorderItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reorderItemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reorderItemNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  reorderTextInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reorderImageContainer: {
    flex: 1,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reorderImageThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  reorderImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  reorderItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  reorderItemActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reorderActionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    marginLeft: 4,
  },
  reorderDragHandle: {
    padding: 8,
    marginLeft: 8,
  },
  reorderAddButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  addReorderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  addReorderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 6,
  },
  reorderPreview: {
    marginTop: 16,
  },
  reorderPreviewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  reorderPreviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reorderPreviewItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
    minWidth: 64,
    alignItems: 'center',
    position: 'relative',
  },
  reorderPreviewText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  reorderPreviewImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    resizeMode: 'cover',
  },
  reorderPreviewPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderPreviewNumber: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  reorderPreviewNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  
  // AI Questions Generator Modal Styles
  aiModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  aiModalScrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100%',
  },
  aiModal: {
    width: '100%',
    maxWidth: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '95%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
  },
  aiModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  aiModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
    marginRight: 16,
  },
  aiModalClose: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
  },
  aiModalContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  aiModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  aiExerciseInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  aiExerciseText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 20,
  },
  aiExerciseLabel: {
    fontWeight: '600',
    color: '#1e293b',
  },
  aiModalTextArea: {
    borderWidth: 2,
    borderColor: '#7c3aed',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#ffffff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  aiModalRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  aiModalInputGroup: {
    flex: 1,
    minWidth: 120,
  },
  aiNumberSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#7c3aed',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  aiNumberButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f3ff',
  },
  aiNumberText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    minWidth: 30,
    textAlign: 'center',
  },
  aiTypeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  aiTypeOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    minWidth: 60,
    alignItems: 'center',
  },
  aiTypeOptionSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  aiTypeOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  aiTypeOptionTextSelected: {
    color: '#7c3aed',
  },
  aiGenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 8,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  aiGenerateButtonDisabled: {
    backgroundColor: '#d1d5db',
    shadowOpacity: 0,
    elevation: 0,
  },
  aiGenerateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  aiStatusText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});