import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { AudioSource, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
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
import { getRandomApiKey, markApiKeyAsFailed, markApiKeyAsUsed, updateApiKeyCredits } from '../lib/elevenlabs-keys';
import { createExercise } from '../lib/entity-helpers';
import { onAuthChange } from '../lib/firebase-auth';
import { pushData, readData, updateData } from '../lib/firebase-database';
import { uploadFile } from '../lib/firebase-storage';

// Import ElevenLabs API key management



// Maintenance placeholder (kept to minimize code churn)
const performApiKeyMaintenance = async () => {
  // Optionally: remove or mark failed/expired keys; for now no-op using Firebase list
  return;
};

// Helper function to check if API key has low credits and update status
const checkAndUpdateApiKeyCredits = async (apiKey: string, response: Response, errorText: string): Promise<boolean> => {
  try {
    // Try to extract credits directly from the raw text using regex
    const creditsMatch = errorText.match(/"credits_remaining":\s*(\d+)/);
    const requiredMatch = errorText.match(/"credits_required":\s*(\d+)/);
    
    if (creditsMatch) {
      const creditsRemaining = parseInt(creditsMatch[1]);
      const creditsRequired = requiredMatch ? parseInt(requiredMatch[1]) : 0;
      
      // Update the API key credits and status
      if (apiKey) {
        await updateApiKeyCredits(apiKey, creditsRemaining);
      }
      // If credits are below 300, flag as low credits in DB
      if (creditsRemaining < 300) return true;
    } else {
      // Fallback to JSON parsing
      const errorData = JSON.parse(errorText);
      
      // Check if it's a quota exceeded error with specific credit information
      if (errorData.detail && (errorData.detail.status === 'quota_exceeded' || errorData.detail.status === 'qquota_exceeded')) {
        const creditsRemaining = errorData.detail.credits_remaining || 0;
        const creditsRequired = errorData.detail.credits_required || 0;
        
        // Update the API key credits and status
        if (apiKey) await updateApiKeyCredits(apiKey, creditsRemaining);
        
        // If credits are below 300, immediately remove this key
        if (creditsRemaining < 300) return true;
      }
    }
  } catch (parseError) {
    console.warn('⚠️ Could not parse error response for credit check:', parseError);
  }
  
  return false; // Key was not marked as low credits
};

// Helper function to try multiple ElevenLabs API keys with fallback
const callElevenLabsWithFallback = async (
  text: string, 
  voiceId: string = 'jBpfuIE2acCO8z3wKNLl',
  useV3: boolean = true,
  outputFormat: string = 'mp3_44100_128'
): Promise<{ audioBlob: Blob; usedApiKey: string; performanceLog: any } | null> => {
  const performanceLog: any = {};
  
  // Get a random API key
  const apiKey = await getRandomApiKey();
  if (!apiKey) {
    throw new Error('No active ElevenLabs API keys available');
  }
  
  const attemptStart = Date.now();
    
    try {
      console.log(`🔄 Trying ElevenLabs API key (${apiKey.substring(0, 10)}...)`);
      
      // Prepare request payload based on version
      const requestPayload = useV3 ? {
        text: text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          speed: 0.8,
          stability: 0.5,
          similarity_boost: 0.75,
        },
        language_code: 'fil'
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
        performanceLog.apiKey = Date.now() - attemptStart;
        
        // Mark this key as used in DB with TTS generation time
        await markApiKeyAsUsed(apiKey, performanceLog.apiKey);
        
        return {
          audioBlob,
          usedApiKey: apiKey,
          performanceLog
        };
      } else {
        const errorText = await response.text();
        
        // Check for IP address unusual activity first - this should stop all retries
        if (errorText.includes('detected_unusual_activity') || 
            errorText.includes('Unusual activity detected') ||
            errorText.includes('Free Tier usage disabled')) {
          
          // Stop retrying and return null instead of throwing error to prevent crash
          return null;
        }
        
        // Handle different error types
        if (response.status === 401) {
          // Unauthorized - invalid API key
          await markApiKeyAsFailed(apiKey);
        } else if (response.status === 429) {
          // Rate limit or quota exceeded
          const hasLowCredits = await checkAndUpdateApiKeyCredits(apiKey, response, errorText);
        } else {
          // Check if this key has low credits and update status
          const hasLowCredits = await checkAndUpdateApiKeyCredits(apiKey, response, errorText);
          
          // Mark key as failed if it's not a credit issue and not a temporary error
          if (!hasLowCredits && response.status >= 400 && response.status < 500) {
            await markApiKeyAsFailed(apiKey);
          }
        }
        
        // Throw error to indicate this key failed
        throw new Error(`API call failed with status ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.warn(`⚠️ ElevenLabs API key error:`, error);
      
      // Mark key as failed
      await markApiKeyAsFailed(apiKey);
      
      // Re-throw the error
      throw error;
    }
};

// Utility placeholders removed (DB-driven now)

// Configuration - Now using direct API calls to Gemini and ElevenLabs

// Stock image library data - Complete collection from all Stock-Images folders
const stockImages: Record<string, Array<{ name: string; uri: any }>> = {
  '3D Alphabet': [
    { name: '3D A', uri: require('../assets/images/Stock-Images/3D Alphabet/A1.png') },
    { name: '3D B', uri: require('../assets/images/Stock-Images/3D Alphabet/B1.png') },
    { name: '3D C', uri: require('../assets/images/Stock-Images/3D Alphabet/C1.png') },
    { name: '3D D', uri: require('../assets/images/Stock-Images/3D Alphabet/D1.png') },
    { name: '3D E', uri: require('../assets/images/Stock-Images/3D Alphabet/E1.png') },
    { name: '3D F', uri: require('../assets/images/Stock-Images/3D Alphabet/F1.png') },
    { name: '3D G', uri: require('../assets/images/Stock-Images/3D Alphabet/G1.png') },
    { name: '3D H', uri: require('../assets/images/Stock-Images/3D Alphabet/H1.png') },
    { name: '3D I', uri: require('../assets/images/Stock-Images/3D Alphabet/I1.png') },
    { name: '3D J', uri: require('../assets/images/Stock-Images/3D Alphabet/J1.png') },
    { name: '3D K', uri: require('../assets/images/Stock-Images/3D Alphabet/K1.png') },
    { name: '3D L', uri: require('../assets/images/Stock-Images/3D Alphabet/L1.png') },
    { name: '3D M', uri: require('../assets/images/Stock-Images/3D Alphabet/M1.png') },
    { name: '3D N', uri: require('../assets/images/Stock-Images/3D Alphabet/N1.png') },
    { name: '3D O', uri: require('../assets/images/Stock-Images/3D Alphabet/O1.png') },
    { name: '3D P', uri: require('../assets/images/Stock-Images/3D Alphabet/P1.png') },
    { name: '3D Q', uri: require('../assets/images/Stock-Images/3D Alphabet/Q1.png') },
    { name: '3D R', uri: require('../assets/images/Stock-Images/3D Alphabet/R1.png') },
    { name: '3D S', uri: require('../assets/images/Stock-Images/3D Alphabet/S1.png') },
    { name: '3D T', uri: require('../assets/images/Stock-Images/3D Alphabet/T1.png') },
    { name: '3D U', uri: require('../assets/images/Stock-Images/3D Alphabet/U1.png') },
    { name: '3D V', uri: require('../assets/images/Stock-Images/3D Alphabet/V1.png') },
    { name: '3D W', uri: require('../assets/images/Stock-Images/3D Alphabet/W1.png') },
    { name: '3D X', uri: require('../assets/images/Stock-Images/3D Alphabet/X1.png') },
    { name: '3D Y', uri: require('../assets/images/Stock-Images/3D Alphabet/Y1.png') },
    { name: '3D Z', uri: require('../assets/images/Stock-Images/3D Alphabet/Z1.png') },
  ],
  'Alphabet': [
    { name: 'A', uri: require('../assets/images/Stock-Images/Alphabet/A.png') },
    { name: 'B', uri: require('../assets/images/Stock-Images/Alphabet/B.png') },
    { name: 'C', uri: require('../assets/images/Stock-Images/Alphabet/C.png') },
    { name: 'D', uri: require('../assets/images/Stock-Images/Alphabet/D.png') },
    { name: 'E', uri: require('../assets/images/Stock-Images/Alphabet/E.png') },
    { name: 'F', uri: require('../assets/images/Stock-Images/Alphabet/F.png') },
    { name: 'G', uri: require('../assets/images/Stock-Images/Alphabet/G.png') },
    { name: 'H', uri: require('../assets/images/Stock-Images/Alphabet/H.png') },
    { name: 'I', uri: require('../assets/images/Stock-Images/Alphabet/I.png') },
    { name: 'J', uri: require('../assets/images/Stock-Images/Alphabet/J.png') },
    { name: 'K', uri: require('../assets/images/Stock-Images/Alphabet/K.png') },
    { name: 'L', uri: require('../assets/images/Stock-Images/Alphabet/L.png') },
    { name: 'M', uri: require('../assets/images/Stock-Images/Alphabet/M.png') },
    { name: 'N', uri: require('../assets/images/Stock-Images/Alphabet/N.png') },
    { name: 'O', uri: require('../assets/images/Stock-Images/Alphabet/O.png') },
    { name: 'P', uri: require('../assets/images/Stock-Images/Alphabet/P.png') },
    { name: 'Q', uri: require('../assets/images/Stock-Images/Alphabet/Q.png') },
    { name: 'R', uri: require('../assets/images/Stock-Images/Alphabet/R.png') },
    { name: 'S', uri: require('../assets/images/Stock-Images/Alphabet/S.png') },
    { name: 'T', uri: require('../assets/images/Stock-Images/Alphabet/T.png') },
    { name: 'U', uri: require('../assets/images/Stock-Images/Alphabet/U.png') },
    { name: 'V', uri: require('../assets/images/Stock-Images/Alphabet/V.png') },
    { name: 'W', uri: require('../assets/images/Stock-Images/Alphabet/W.png') },
    { name: 'X', uri: require('../assets/images/Stock-Images/Alphabet/X.png') },
    { name: 'Y', uri: require('../assets/images/Stock-Images/Alphabet/Y.png') },
    { name: 'Z', uri: require('../assets/images/Stock-Images/Alphabet/Z.png') },
  ],
  'Animals': [
    // Land Animals
    { name: 'Bee', uri: require('../assets/images/Stock-Images/Animals/Land Animals/bee.png') },
    { name: 'Bird', uri: require('../assets/images/Stock-Images/Animals/Land Animals/bird.png') },
    { name: 'Black Cat', uri: require('../assets/images/Stock-Images/Animals/Land Animals/black cat.png') },
    { name: 'Bug', uri: require('../assets/images/Stock-Images/Animals/Land Animals/bug.png') },
    { name: 'Bunny', uri: require('../assets/images/Stock-Images/Animals/Land Animals/bunny.png') },
    { name: 'Butterfly', uri: require('../assets/images/Stock-Images/Animals/Land Animals/butterfly.png') },
    { name: 'Cat', uri: require('../assets/images/Stock-Images/Animals/Land Animals/cat.png') },
    { name: 'Cheetah', uri: require('../assets/images/Stock-Images/Animals/Land Animals/cheetah.png') },
    { name: 'Chicken', uri: require('../assets/images/Stock-Images/Animals/Land Animals/chicken.png') },
    { name: 'Cow', uri: require('../assets/images/Stock-Images/Animals/Land Animals/cow.png') },
    { name: 'Deer', uri: require('../assets/images/Stock-Images/Animals/Land Animals/deer.png') },
    { name: 'Dog', uri: require('../assets/images/Stock-Images/Animals/Land Animals/dog.png') },
    { name: 'Elephant', uri: require('../assets/images/Stock-Images/Animals/Land Animals/elephant.png') },
    { name: 'Fox', uri: require('../assets/images/Stock-Images/Animals/Land Animals/fox.png') },
    { name: 'Frog', uri: require('../assets/images/Stock-Images/Animals/Land Animals/frog.png') },
    { name: 'Giraffe', uri: require('../assets/images/Stock-Images/Animals/Land Animals/guraffe.png') },
    { name: 'Hippo', uri: require('../assets/images/Stock-Images/Animals/Land Animals/hipo.png') },
    { name: 'Horse', uri: require('../assets/images/Stock-Images/Animals/Land Animals/horse.png') },
    { name: 'Koala', uri: require('../assets/images/Stock-Images/Animals/Land Animals/koala.png') },
    { name: 'Lion', uri: require('../assets/images/Stock-Images/Animals/Land Animals/lion.png') },
    { name: 'Monkey', uri: require('../assets/images/Stock-Images/Animals/Land Animals/monkey.png') },
    { name: 'Owl', uri: require('../assets/images/Stock-Images/Animals/Land Animals/owl.png') },
    { name: 'Panda', uri: require('../assets/images/Stock-Images/Animals/Land Animals/panda.png') },
    { name: 'Penguin', uri: require('../assets/images/Stock-Images/Animals/Land Animals/penguin.png') },
    { name: 'Pig', uri: require('../assets/images/Stock-Images/Animals/Land Animals/pig.png') },
    { name: 'Red Panda', uri: require('../assets/images/Stock-Images/Animals/Land Animals/red panda.png') },
    { name: 'Snail', uri: require('../assets/images/Stock-Images/Animals/Land Animals/snail.png') },
    { name: 'Snake', uri: require('../assets/images/Stock-Images/Animals/Land Animals/snake.png') },
    { name: 'Tiger', uri: require('../assets/images/Stock-Images/Animals/Land Animals/tiger.png') },
    { name: 'Turkey', uri: require('../assets/images/Stock-Images/Animals/Land Animals/turkey.png') },
    { name: 'Wolf', uri: require('../assets/images/Stock-Images/Animals/Land Animals/wolf.png') },
    { name: 'Zebra', uri: require('../assets/images/Stock-Images/Animals/Land Animals/zebra.png') },
    // Sea Animals
    { name: 'Whale', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/1.png') },
    { name: 'Fish', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/2.png') },
    { name: 'Crab', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/4.png') },
    { name: 'Octopus', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/5.png') },
    { name: 'Starfish', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/6.png') },
    { name: 'Coral', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/7.png') },
    { name: 'Puffer Fish', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/8.png') },
    { name: 'Dolphin', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/10.png') },
    { name: 'Turtle', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/11.png') },
    { name: 'Clam', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/12.png') },
    { name: 'Shark', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/13.png') },
    { name: 'Seahorse', uri: require('../assets/images/Stock-Images/Animals/Sea Animals/15.png') },
  ],
  'Boxed Alphabet': [
    { name: 'Boxed A', uri: require('../assets/images/Stock-Images/Boxed Alphabet/A.png') },
    { name: 'Boxed B', uri: require('../assets/images/Stock-Images/Boxed Alphabet/B.png') },
    { name: 'Boxed C', uri: require('../assets/images/Stock-Images/Boxed Alphabet/C.png') },
    { name: 'Boxed D', uri: require('../assets/images/Stock-Images/Boxed Alphabet/D.png') },
    { name: 'Boxed E', uri: require('../assets/images/Stock-Images/Boxed Alphabet/E.png') },
    { name: 'Boxed F', uri: require('../assets/images/Stock-Images/Boxed Alphabet/F.png') },
    { name: 'Boxed G', uri: require('../assets/images/Stock-Images/Boxed Alphabet/G.png') },
    { name: 'Boxed H', uri: require('../assets/images/Stock-Images/Boxed Alphabet/H.png') },
    { name: 'Boxed I', uri: require('../assets/images/Stock-Images/Boxed Alphabet/I.png') },
    { name: 'Boxed J', uri: require('../assets/images/Stock-Images/Boxed Alphabet/J.png') },
    { name: 'Boxed K', uri: require('../assets/images/Stock-Images/Boxed Alphabet/K.png') },
    { name: 'Boxed L', uri: require('../assets/images/Stock-Images/Boxed Alphabet/L.png') },
    { name: 'Boxed M', uri: require('../assets/images/Stock-Images/Boxed Alphabet/M.png') },
    { name: 'Boxed N', uri: require('../assets/images/Stock-Images/Boxed Alphabet/N.png') },
    { name: 'Boxed O', uri: require('../assets/images/Stock-Images/Boxed Alphabet/O.png') },
    { name: 'Boxed P', uri: require('../assets/images/Stock-Images/Boxed Alphabet/P.png') },
    { name: 'Boxed Q', uri: require('../assets/images/Stock-Images/Boxed Alphabet/Q.png') },
    { name: 'Boxed R', uri: require('../assets/images/Stock-Images/Boxed Alphabet/R.png') },
    { name: 'Boxed S', uri: require('../assets/images/Stock-Images/Boxed Alphabet/S.png') },
    { name: 'Boxed T', uri: require('../assets/images/Stock-Images/Boxed Alphabet/T.png') },
    { name: 'Boxed U', uri: require('../assets/images/Stock-Images/Boxed Alphabet/U.png') },
    { name: 'Boxed V', uri: require('../assets/images/Stock-Images/Boxed Alphabet/V.png') },
    { name: 'Boxed W', uri: require('../assets/images/Stock-Images/Boxed Alphabet/W.png') },
    { name: 'Boxed X', uri: require('../assets/images/Stock-Images/Boxed Alphabet/X.png') },
    { name: 'Boxed Y', uri: require('../assets/images/Stock-Images/Boxed Alphabet/Y.png') },
    { name: 'Boxed Z', uri: require('../assets/images/Stock-Images/Boxed Alphabet/Z.png') },
  ],
  'Boxed Numbers 1-9': [
    { name: 'Boxed 1', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/1.png') },
    { name: 'Boxed 2', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/2.png') },
    { name: 'Boxed 3', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/3.png') },
    { name: 'Boxed 4', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/4.png') },
    { name: 'Boxed 5', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/5.png') },
    { name: 'Boxed 6', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/6.png') },
    { name: 'Boxed 7', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/7.png') },
    { name: 'Boxed 8', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/8.png') },
    { name: 'Boxed 9', uri: require('../assets/images/Stock-Images/Boxed Numbers 1-9/9.png') },
  ],
  'Comparing Quantities': [
    { name: '1 + 9 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/1 + 9 (2).png') },
    { name: '1 + 9', uri: require('../assets/images/Stock-Images/Comparing Quantities/1 + 9.png') },
    { name: '1 Apple', uri: require('../assets/images/Stock-Images/Comparing Quantities/1 apple.png') },
    { name: '1 Candy', uri: require('../assets/images/Stock-Images/Comparing Quantities/1 candy.png') },
    { name: '1 Pencil', uri: require('../assets/images/Stock-Images/Comparing Quantities/1 pencil.png') },
    { name: '1 Stack Book', uri: require('../assets/images/Stock-Images/Comparing Quantities/1 stack book.png') },
    { name: '12 Eggs', uri: require('../assets/images/Stock-Images/Comparing Quantities/12 eggs.png') },
    { name: '13 - One Long and Three Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/13 - one long and three units.png') },
    { name: '14 Eggs', uri: require('../assets/images/Stock-Images/Comparing Quantities/14 eggs.png') },
    { name: '15 - One Long and Five Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/15 - one long and five units.png') },
    { name: '15 Eggs', uri: require('../assets/images/Stock-Images/Comparing Quantities/15 eggs.png') },
    { name: '17 - One Long and Seven Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/17 - one long and seven units.png') },
    { name: '19 - One Long and Nine Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/19 - one long and nine units.png') },
    { name: '2 + 8 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/2 + 8 (2).png') },
    { name: '2 + 8', uri: require('../assets/images/Stock-Images/Comparing Quantities/2 + 8.png') },
    { name: '2 Apples', uri: require('../assets/images/Stock-Images/Comparing Quantities/2 apples.png') },
    { name: '2 Candies', uri: require('../assets/images/Stock-Images/Comparing Quantities/2 candies.png') },
    { name: '2 Pencils', uri: require('../assets/images/Stock-Images/Comparing Quantities/2 pencil.png') },
    { name: '2 Stack Books', uri: require('../assets/images/Stock-Images/Comparing Quantities/2 stack book.png') },
    { name: '22 - Two Longs and Two Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/22 - two longs and two units.png') },
    { name: '25 - Two Longs and Five Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/25 - two longs and five units.png') },
    { name: '27 Marbles', uri: require('../assets/images/Stock-Images/Comparing Quantities/27 marbles.png') },
    { name: '2 Guavas with 1 Banana on Each Plate', uri: require('../assets/images/Stock-Images/Comparing Quantities/2guavas with 1 banana on each plate.png') },
    { name: '3 + 7 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/3 + 7 (2).png') },
    { name: '3 + 7', uri: require('../assets/images/Stock-Images/Comparing Quantities/3 + 7.png') },
    { name: '3 Apples', uri: require('../assets/images/Stock-Images/Comparing Quantities/3 apples.png') },
    { name: '3 Candies', uri: require('../assets/images/Stock-Images/Comparing Quantities/3 candies.png') },
    { name: '3 Girls', uri: require('../assets/images/Stock-Images/Comparing Quantities/3 girls.png') },
    { name: '3 Pencils', uri: require('../assets/images/Stock-Images/Comparing Quantities/3 pencil.png') },
    { name: '3 Stack Books', uri: require('../assets/images/Stock-Images/Comparing Quantities/3 stack book.png') },
    { name: '3-1 Fish', uri: require('../assets/images/Stock-Images/Comparing Quantities/3-1 fish.png') },
    { name: '30 - Three Longs', uri: require('../assets/images/Stock-Images/Comparing Quantities/30 - three longs.png') },
    { name: '32 - Three Longs and Two Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/32 - three longs and two units.png') },
    { name: '35 - Three Longs and Five Units', uri: require('../assets/images/Stock-Images/Comparing Quantities/35 - three longs and five units.png') },
    { name: '4 + 6 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/4 + 6 (2).png') },
    { name: '4 + 6', uri: require('../assets/images/Stock-Images/Comparing Quantities/4 + 6.png') },
    { name: '4 Apples', uri: require('../assets/images/Stock-Images/Comparing Quantities/4 apples.png') },
    { name: '4 Candies', uri: require('../assets/images/Stock-Images/Comparing Quantities/4 candies.png') },
    { name: '4 Guavas and 2 Bananas', uri: require('../assets/images/Stock-Images/Comparing Quantities/4 guavas and 2 bananas.png') },
    { name: '4 Pencils', uri: require('../assets/images/Stock-Images/Comparing Quantities/4 pencil.png') },
    { name: '4 Stack Books', uri: require('../assets/images/Stock-Images/Comparing Quantities/4 stack book.png') },
    { name: '4-2 Fish', uri: require('../assets/images/Stock-Images/Comparing Quantities/4-2 fish.png') },
    { name: '5 + 5 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/5 + 5 (2).png') },
    { name: '5 + 5', uri: require('../assets/images/Stock-Images/Comparing Quantities/5 + 5.png') },
    { name: '5 Apples', uri: require('../assets/images/Stock-Images/Comparing Quantities/5 apples.png') },
    { name: '5 Boys', uri: require('../assets/images/Stock-Images/Comparing Quantities/5 boys.png') },
    { name: '5 Candies', uri: require('../assets/images/Stock-Images/Comparing Quantities/5 candies.png') },
    { name: '5 Pencils (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/5 pencil (2).png') },
    { name: '5 Pencils', uri: require('../assets/images/Stock-Images/Comparing Quantities/5 pencil.png') },
    { name: '5-2 Fish', uri: require('../assets/images/Stock-Images/Comparing Quantities/5-2 fish.png') },
    { name: '6 + 4 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/6 + 4 (2).png') },
    { name: '6 + 4', uri: require('../assets/images/Stock-Images/Comparing Quantities/6 + 4.png') },
    { name: '6 Apples', uri: require('../assets/images/Stock-Images/Comparing Quantities/6 apples.png') },
    { name: '6 Eggs in a Jar', uri: require('../assets/images/Stock-Images/Comparing Quantities/6 eggs in a jar.png') },
    { name: '7 + 3 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/7 + 3 (2).png') },
    { name: '7 + 3', uri: require('../assets/images/Stock-Images/Comparing Quantities/7 + 3.png') },
    { name: '7 Apples', uri: require('../assets/images/Stock-Images/Comparing Quantities/7 apples.png') },
    { name: '7 Children Playing and 3 Children Joining', uri: require('../assets/images/Stock-Images/Comparing Quantities/7 children playing and 3 children joining.png') },
    { name: '7-4 Fish', uri: require('../assets/images/Stock-Images/Comparing Quantities/7-4 fish.png') },
    { name: '8 + 2 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/8 + 2 (2).png') },
    { name: '8 + 2', uri: require('../assets/images/Stock-Images/Comparing Quantities/8 + 2.png') },
    { name: '8-7 Fish', uri: require('../assets/images/Stock-Images/Comparing Quantities/8-7 fish.png') },
    { name: '9 + 1 (2)', uri: require('../assets/images/Stock-Images/Comparing Quantities/9 + 1 (2).png') },
    { name: '9 + 1', uri: require('../assets/images/Stock-Images/Comparing Quantities/9 + 1.png') },
    { name: '9-3 Fish', uri: require('../assets/images/Stock-Images/Comparing Quantities/9-3 fish.png') },
    { name: 'Empty Fruits on Plate', uri: require('../assets/images/Stock-Images/Comparing Quantities/empty fruits on plate.png') },
    { name: 'Zeny 19 Counters, Ernie 14 Counters, Sitti Box, Akmad Box', uri: require('../assets/images/Stock-Images/Comparing Quantities/zeny 19 counters, Ernie 14 counters, sitti box, Akmad box.png') },
  ],
  'Dates': [
    { name: 'Date 1', uri: require('../assets/images/Stock-Images/Dates/1.png') },
    { name: 'Date 3', uri: require('../assets/images/Stock-Images/Dates/3.png') },
    { name: 'Date 4', uri: require('../assets/images/Stock-Images/Dates/4.png') },
    { name: 'Date 5', uri: require('../assets/images/Stock-Images/Dates/5.png') },
    { name: 'Date 6', uri: require('../assets/images/Stock-Images/Dates/6.png') },
    { name: 'Date 7', uri: require('../assets/images/Stock-Images/Dates/7.png') },
    { name: 'Date 8', uri: require('../assets/images/Stock-Images/Dates/8.png') },
    { name: 'Date 9', uri: require('../assets/images/Stock-Images/Dates/9.png') },
    { name: 'Date 10', uri: require('../assets/images/Stock-Images/Dates/10.png') },
    { name: 'Fill Shaded', uri: require('../assets/images/Stock-Images/Dates/fill the shaded.png') },
  ],
  'Extra Objects': [
    { name: '1 Cube', uri: require('../assets/images/Stock-Images/Extra Objects/1 cube.png') },
    { name: 'Alarm', uri: require('../assets/images/Stock-Images/Extra Objects/Alarm.png') },
    { name: 'Balloon', uri: require('../assets/images/Stock-Images/Extra Objects/balloon.png') },
    { name: 'Basketball', uri: require('../assets/images/Stock-Images/Extra Objects/basketball.png') },
    { name: 'Blue Ball', uri: require('../assets/images/Stock-Images/Extra Objects/blue ball.png') },
    { name: 'Brown Chair', uri: require('../assets/images/Stock-Images/Extra Objects/Brown Chair.png') },
    { name: 'Brown Tumbler', uri: require('../assets/images/Stock-Images/Extra Objects/Brown Tumbler.png') },
    { name: 'Cap', uri: require('../assets/images/Stock-Images/Extra Objects/cap.png') },
    { name: 'Chair', uri: require('../assets/images/Stock-Images/Extra Objects/Chair.png') },
    { name: 'Donut', uri: require('../assets/images/Stock-Images/Extra Objects/Donut.png') },
    { name: 'Duck', uri: require('../assets/images/Stock-Images/Extra Objects/duck.png') },
    { name: 'Electric Fan', uri: require('../assets/images/Stock-Images/Extra Objects/Electric Fan.png') },
    { name: 'Green Coat', uri: require('../assets/images/Stock-Images/Extra Objects/Green Coat.png') },
    { name: 'Key', uri: require('../assets/images/Stock-Images/Extra Objects/Key.png') },
    { name: 'Kite', uri: require('../assets/images/Stock-Images/Extra Objects/kite.png') },
    { name: 'Microscope', uri: require('../assets/images/Stock-Images/Extra Objects/Microscope.png') },
    { name: 'Pink Rose', uri: require('../assets/images/Stock-Images/Extra Objects/pink rose.png') },
    { name: 'Popsicles', uri: require('../assets/images/Stock-Images/Extra Objects/Popciscles.png') },
    { name: 'Pot', uri: require('../assets/images/Stock-Images/Extra Objects/pot.png') },
    { name: 'Racket', uri: require('../assets/images/Stock-Images/Extra Objects/Racket.png') },
    { name: 'Red Ball', uri: require('../assets/images/Stock-Images/Extra Objects/red ball.png') },
    { name: 'Red Rose', uri: require('../assets/images/Stock-Images/Extra Objects/red rose.png') },
    { name: 'Rocket', uri: require('../assets/images/Stock-Images/Extra Objects/Rocket.png') },
    { name: 'Shuttlecock', uri: require('../assets/images/Stock-Images/Extra Objects/Shuttlecock.png') },
    { name: 'Soccer Ball', uri: require('../assets/images/Stock-Images/Extra Objects/soccer ball.png') },
    { name: 'Star', uri: require('../assets/images/Stock-Images/Extra Objects/star.png') },
    { name: 'Telescope', uri: require('../assets/images/Stock-Images/Extra Objects/Telescope.png') },
    { name: 'Unicycle', uri: require('../assets/images/Stock-Images/Extra Objects/Unicycle.png') },
    { name: 'Volleyball', uri: require('../assets/images/Stock-Images/Extra Objects/Volleyball.png') },
    { name: 'Watering Can', uri: require('../assets/images/Stock-Images/Extra Objects/Watering Can.png') },
  ],
  'Fractions': [
    { name: 'Half Blue', uri: require('../assets/images/Stock-Images/Fractions/1_2 blue.png') },
    { name: 'Half Circle', uri: require('../assets/images/Stock-Images/Fractions/1_2 Circle.png') },
    { name: 'Half Hexagon', uri: require('../assets/images/Stock-Images/Fractions/1_2 Hexagon.png') },
    { name: 'Half Octagon', uri: require('../assets/images/Stock-Images/Fractions/1_2 Octagon.png') },
    { name: 'Half Orange', uri: require('../assets/images/Stock-Images/Fractions/1_2 orange.png') },
    { name: 'Half Pentagon', uri: require('../assets/images/Stock-Images/Fractions/1_2 Pentagon.png') },
    { name: 'Half Square', uri: require('../assets/images/Stock-Images/Fractions/1_2 Square.png') },
    { name: 'Half Triangle', uri: require('../assets/images/Stock-Images/Fractions/1_2 Triangle.png') },
    { name: 'Quarter Circle Right', uri: require('../assets/images/Stock-Images/Fractions/1_4 Circle Right.png') },
    { name: 'Quarter Circle', uri: require('../assets/images/Stock-Images/Fractions/1_4 Circle.png') },
    { name: 'Quarter Green', uri: require('../assets/images/Stock-Images/Fractions/1_4 green.png') },
    { name: 'Quarter Hexagon', uri: require('../assets/images/Stock-Images/Fractions/1_4 Hexagon.png') },
    { name: 'Quarter Orange', uri: require('../assets/images/Stock-Images/Fractions/1_4 orange.png') },
    { name: 'Quarter Rectangle', uri: require('../assets/images/Stock-Images/Fractions/1_4 Rectangle.png') },
    { name: 'Quarter Square', uri: require('../assets/images/Stock-Images/Fractions/1_4 Square.png') },
  ],
  'Fruits and Vegetables': [
    { name: 'Carrot', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/20.png') },
    { name: 'Cabbage', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/21.png') },
    { name: 'Corn', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/22.png') },
    { name: 'Atis', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Atis.png') },
    { name: 'Avocado', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Avocado.png') },
    { name: 'Bayabas', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Bayabas.png') },
    { name: 'Blueberry', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Blueberry.png') },
    { name: 'Buko', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Buko.png') },
    { name: 'Dragon Fruit', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Dragon Fruit.png') },
    { name: 'Kalabasa', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Kalabasa.png') },
    { name: 'Kamatis', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Kamatis.png') },
    { name: 'Mangga', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Mangga.png') },
    { name: 'Niyog', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Niyog.png') },
    { name: 'Orange', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Orange.png') },
    { name: 'Pinya', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Pinya.png') },
    { name: 'Potato', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Potato.png') },
    { name: 'Red Apple', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Red Apple.png') },
    { name: 'Saging', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Saging.png') },
    { name: 'Sibuyas', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Sibuyas.png') },
    { name: 'Strawberry', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Strawberry.png') },
    { name: 'Talong', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Talong.png') },
    { name: 'Ubas', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Ubas.png') },
    { name: 'Watermelon', uri: require('../assets/images/Stock-Images/Fruits and Vegetables/Watermelon.png') },
  ],
  'Length and Distance': [
    { name: 'Arm Span', uri: require('../assets/images/Stock-Images/Length and Distance/arm span.png') },
    { name: 'Bungi Bunging Pagsukat Gamit Ang Clips', uri: require('../assets/images/Stock-Images/Length and Distance/bungi bunging pagsukat gamit ang clips.png') },
    { name: 'Foot Span', uri: require('../assets/images/Stock-Images/Length and Distance/foot span.png') },
    { name: 'Hand Span', uri: require('../assets/images/Stock-Images/Length and Distance/hand span.png') },
    { name: 'Kulang Na Pagsukat Gamit Ang Clips', uri: require('../assets/images/Stock-Images/Length and Distance/kulang na pagsukat gamit ang clips.png') },
    { name: 'Longest', uri: require('../assets/images/Stock-Images/Length and Distance/longest.png') },
    { name: 'Makapal Na Libro', uri: require('../assets/images/Stock-Images/Length and Distance/makapal na libro.png') },
    { name: 'Malaking Papaya', uri: require('../assets/images/Stock-Images/Length and Distance/malaking papaya.png') },
    { name: 'Maliit Na Saging', uri: require('../assets/images/Stock-Images/Length and Distance/maliit na saging.png') },
    { name: 'Manipis Na Libro', uri: require('../assets/images/Stock-Images/Length and Distance/manipis na libro.png') },
    { name: 'Medium', uri: require('../assets/images/Stock-Images/Length and Distance/medium.png') },
    { name: 'Medyo Makapal Na Libro', uri: require('../assets/images/Stock-Images/Length and Distance/medyo makapal na libro.png') },
    { name: 'Medyo Malapit', uri: require('../assets/images/Stock-Images/Length and Distance/medyo malapit.png') },
    { name: 'Pinaka Malapit Sa Apple', uri: require('../assets/images/Stock-Images/Length and Distance/pinaka malapit sa apple.png') },
    { name: 'Pinaka Malayo Sa Apple', uri: require('../assets/images/Stock-Images/Length and Distance/pinaka malayo sa apple.png') },
    { name: 'Short Box', uri: require('../assets/images/Stock-Images/Length and Distance/Short Box.png') },
    { name: 'Shortest', uri: require('../assets/images/Stock-Images/Length and Distance/Shortest.png') },
    { name: 'Sobrang Ang Pagsukat Gamit Ang Clips', uri: require('../assets/images/Stock-Images/Length and Distance/sobrang ang pagsukat gamit ang clips.png') },
    { name: 'Tall Cylinder', uri: require('../assets/images/Stock-Images/Length and Distance/Tall Cylinder.png') },
    { name: 'Taller', uri: require('../assets/images/Stock-Images/Length and Distance/Taller.png') },
    { name: 'Tallest', uri: require('../assets/images/Stock-Images/Length and Distance/Tallest.png') },
    { name: 'Tama At Saktong Pagsukat Gamit Ang Clips', uri: require('../assets/images/Stock-Images/Length and Distance/tama at saktong pagsukat gamit ang clips.png') },
    { name: 'Wide', uri: require('../assets/images/Stock-Images/Length and Distance/wide.png') },
    { name: 'Wider', uri: require('../assets/images/Stock-Images/Length and Distance/wider.png') },
    { name: 'Widest', uri: require('../assets/images/Stock-Images/Length and Distance/widest.png') },
  ],
  'Math Symbols': [
    { name: 'Plus', uri: require('../assets/images/Stock-Images/Math Symbols/plus.png') },
    { name: 'Minus', uri: require('../assets/images/Stock-Images/Math Symbols/minus.png') },
    { name: 'Equal', uri: require('../assets/images/Stock-Images/Math Symbols/equal.png') },
    { name: 'Greater Than', uri: require('../assets/images/Stock-Images/Math Symbols/greater than.png') },
    { name: 'Less Than', uri: require('../assets/images/Stock-Images/Math Symbols/less than.png') },
    { name: 'Not Equal To', uri: require('../assets/images/Stock-Images/Math Symbols/not equal to.png') },
  ],
  'Money': [
    { name: '100 (20 coins)', uri: require('../assets/images/Stock-Images/Money/100 (20 coins).png') },
    { name: '100 (two 50 bills)', uri: require('../assets/images/Stock-Images/Money/100 (two 50 bills).png') },
    { name: '16 Pesos', uri: require('../assets/images/Stock-Images/Money/16.png') },
    { name: '23 Pesos', uri: require('../assets/images/Stock-Images/Money/23.png') },
    { name: '27 pesos', uri: require('../assets/images/Stock-Images/Money/27.png') },
    { name: 'Piso (1 peso coin)', uri: require('../assets/images/Stock-Images/Money/28.png') },
    { name: 'Limampiso (5 peso coin)', uri: require('../assets/images/Stock-Images/Money/29.png') },
    { name: 'Sampung  (10 peso coin)', uri: require('../assets/images/Stock-Images/Money/30.png') },
    { name: 'Bentepesos (20 peso coin)', uri: require('../assets/images/Stock-Images/Money/31.png') },
    { name: 'Beynte (20 Peso bill)', uri: require('../assets/images/Stock-Images/Money/32.png') },
    { name: 'Singkwenta (50 peso bill)', uri: require('../assets/images/Stock-Images/Money/33.png') },
    { name: 'Isandaan (100 peso bill)', uri: require('../assets/images/Stock-Images/Money/34.png') },
    { name: '40 pesos', uri: require('../assets/images/Stock-Images/Money/40.png') },
    { name: '72 pesos', uri: require('../assets/images/Stock-Images/Money/72.png') },
    { name: '84 pesos', uri: require('../assets/images/Stock-Images/Money/84.png') },
    { name: '85 pesos', uri: require('../assets/images/Stock-Images/Money/85.png') },
    { name: '90 pesos', uri: require('../assets/images/Stock-Images/Money/90.png') },
  ],
  'Numbers': [
    // Numbers 0-9 (blue)
    { name: '1', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/1.png') },
    { name: '2', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/2.png') },
    { name: '3', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/3.png') },
    { name: '4', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/4.png') },
    { name: '5', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/5.png') },
    { name: '6', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/6.png') },
    { name: '7', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/7.png') },
    { name: '8', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/8.png') },
    { name: '9', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/9.png') },
    { name: '10', uri: require('../assets/images/Stock-Images/Numbers/Numbers 0-9 (blue)/10.png') },
    // Numbers 1-100
    { name: '1', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/1.png') },
    { name: '2', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/2.png') },
    { name: '3', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/3.png') },
    { name: '4', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/4.png') },
    { name: '5', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/5.png') },
    { name: '6', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/6.png') },
    { name: '7', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/7.png') },
    { name: '8', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/8.png') },
    { name: '9', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/9.png') },
    { name: '10', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/10.png') },
    { name: '11', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/11.png') },
    { name: '12', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/12.png') },
    { name: '13', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/13.png') },
    { name: '14', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/14.png') },
    { name: '15', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/15.png') },
    { name: '16', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/16.png') },
    { name: '17', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/17.png') },
    { name: '18', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/18.png') },
    { name: '19', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/19.png') },
    { name: '20', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/20.png') },
    { name: '21', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/21.png') },
    { name: '22', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/22.png') },
    { name: '23', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/23.png') },
    { name: '24', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/24.png') },
    { name: '25', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/25.png') },
    { name: '26', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/26.png') },
    { name: '27', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/27.png') },
    { name: '28', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/28.png') },
    { name: '29', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/29.png') },
    { name: '30', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/30.png') },
    { name: '31', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/31.png') },
    { name: '32', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/32.png') },
    { name: '33', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/33.png') },
    { name: '34', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/34.png') },
    { name: '35', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/35.png') },
    { name: '36', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/36.png') },
    { name: '37', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/37.png') },
    { name: '38', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/38.png') },
    { name: '39', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/39.png') },
    { name: '40', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/40.png') },
    { name: '41', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/41.png') },
    { name: '42', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/42.png') },
    { name: '43', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/43.png') },
    { name: '44', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/44.png') },
    { name: '45', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/45.png') },
    { name: '46', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/46.png') },
    { name: '47', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/47.png') },
    { name: '48', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/48.png') },
    { name: '49', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/49.png') },
    { name: '50', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/50.png') },
    { name: '51', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/51.png') },
    { name: '52', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/52.png') },
    { name: '53', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/53.png') },
    { name: '54', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/54.png') },
    { name: '55', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/55.png') },
    { name: '56', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/56.png') },
    { name: '57', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/57.png') },
    { name: '58', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/58.png') },
    { name: '59', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/59.png') },
    { name: '60', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/60.png') },
    { name: '61', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/61.png') },
    { name: '62', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/62.png') },
    { name: '63', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/63.png') },
    { name: '64', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/64.png') },
    { name: '65', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/65.png') },
    { name: '66', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/66.png') },
    { name: '67', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/67.png') },
    { name: '68', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/68.png') },
    { name: '69', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/69.png') },
    { name: '70', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/70.png') },
    { name: '71', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/71.png') },
    { name: '72', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/72.png') },
    { name: '73', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/73.png') },
    { name: '74', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/74.png') },
    { name: '75', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/75.png') },
    { name: '76', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/76.png') },
    { name: '77', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/77.png') },
    { name: '78', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/78.png') },
    { name: '79', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/79.png') },
    { name: '80', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/80.png') },
    { name: '81', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/81.png') },
    { name: '82', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/82.png') },
    { name: '83', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/83.png') },
    { name: '84', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/84.png') },
    { name: '85', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/85.png') },
    { name: '86', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/86.png') },
    { name: '87', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/87.png') },
    { name: '88', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/88.png') },
    { name: '89', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/89.png') },
    { name: '90', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/90.png') },
    { name: '91', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/91.png') },
    { name: '92', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/92.png') },
    { name: '93', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/93.png') },
    { name: '94', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/94.png') },
    { name: '95', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/95.png') },
    { name: '96', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/96.png') },
    { name: '97', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/97.png') },
    { name: '98', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/98.png') },
    { name: '99', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/99.png') },
    { name: '100', uri: require('../assets/images/Stock-Images/Numbers/Numbers 1-100/100.png') },
  ],
  'Patterns': [
    { name: '1 Purple 3 Blue', uri: require('../assets/images/Stock-Images/Patterns/1 purple 3 blue.png') },
    { name: '2 Boy 2 Girl', uri: require('../assets/images/Stock-Images/Patterns/2 boy 2 girl.png') },
    { name: '2 Yellow 1 Orange', uri: require('../assets/images/Stock-Images/Patterns/2 yellow 1 orange.png') },
    { name: '3 Boy 3 Girl', uri: require('../assets/images/Stock-Images/Patterns/3 boy 3 girl.png') },
    { name: '3 Shapes', uri: require('../assets/images/Stock-Images/Patterns/3 shapes.png') },
    { name: '647', uri: require('../assets/images/Stock-Images/Patterns/647.png') },
    { name: 'Blue Pink', uri: require('../assets/images/Stock-Images/Patterns/blue pink.png') },
    { name: 'Boy Girl', uri: require('../assets/images/Stock-Images/Patterns/boy girl.png') },
    { name: 'Girl Boy', uri: require('../assets/images/Stock-Images/Patterns/girl boy.png') },
    { name: 'Heart Star', uri: require('../assets/images/Stock-Images/Patterns/heart star.png') },
    { name: 'Star Card Smile', uri: require('../assets/images/Stock-Images/Patterns/star card smile.png') },
    { name: 'Up Down', uri: require('../assets/images/Stock-Images/Patterns/up down.png') },
  ],
  'School Supplies': [
    { name: '4 Brushes', uri: require('../assets/images/Stock-Images/School Supplies/4 brushes.png') },
    { name: 'Abacus', uri: require('../assets/images/Stock-Images/School Supplies/abacus.png') },
    { name: 'Bag', uri: require('../assets/images/Stock-Images/School Supplies/bag.png') },
    { name: 'Board', uri: require('../assets/images/Stock-Images/School Supplies/board.png') },
    { name: 'Dilaw Na Ruler', uri: require('../assets/images/Stock-Images/School Supplies/dilaw na ruler.png') },
    { name: 'Globe', uri: require('../assets/images/Stock-Images/School Supplies/globe.png') },
    { name: 'Glue', uri: require('../assets/images/Stock-Images/School Supplies/glue.png') },
    { name: 'Gunting', uri: require('../assets/images/Stock-Images/School Supplies/gunting.png') },
    { name: 'Isang Crayola', uri: require('../assets/images/Stock-Images/School Supplies/Isang crayola.png') },
    { name: 'Lapis', uri: require('../assets/images/Stock-Images/School Supplies/Lapis.png') },
    { name: 'Mid Thick Book', uri: require('../assets/images/Stock-Images/School Supplies/mid thick book.png') },
    { name: 'Notebook', uri: require('../assets/images/Stock-Images/School Supplies/Notebook.png') },
    { name: 'Paint Brush', uri: require('../assets/images/Stock-Images/School Supplies/paint brush.png') },
    { name: 'Pambura', uri: require('../assets/images/Stock-Images/School Supplies/Pambura.png') },
    { name: 'Pantasa', uri: require('../assets/images/Stock-Images/School Supplies/Pantasa.png') },
    { name: 'Paper', uri: require('../assets/images/Stock-Images/School Supplies/papel.png') },
    { name: 'Paper Clip', uri: require('../assets/images/Stock-Images/School Supplies/paper clip.png') },
    { name: 'Pencil Case', uri: require('../assets/images/Stock-Images/School Supplies/pencil case.png') },
    { name: 'Ruler', uri: require('../assets/images/Stock-Images/School Supplies/ruler.png') },
    { name: 'Stapler', uri: require('../assets/images/Stock-Images/School Supplies/stapler.png') },
    { name: 'Tatlong Crayola', uri: require('../assets/images/Stock-Images/School Supplies/Tatlong Crayola.png') },
    { name: 'Tatlong Patong Na Libro', uri: require('../assets/images/Stock-Images/School Supplies/tatlong patong na libro.png') },
    { name: 'Thickest Book', uri: require('../assets/images/Stock-Images/School Supplies/thickest book.png') },
    { name: 'Thin Book', uri: require('../assets/images/Stock-Images/School Supplies/thin book.png') },
    { name: 'Yellow Notebook', uri: require('../assets/images/Stock-Images/School Supplies/yellow notebook.png') },
  ],
  'Shapes': [
    { name: '2 Right Angle with Rectangle', uri: require('../assets/images/Stock-Images/Shapes/2 right angle with rectangle.png') },
    { name: '2 Right Angles with Tall Rectangle', uri: require('../assets/images/Stock-Images/Shapes/2 right angles with tall rectangle.png') },
    { name: 'Circle', uri: require('../assets/images/Stock-Images/Shapes/circle.png') },
    { name: 'Decagon', uri: require('../assets/images/Stock-Images/Shapes/decagon.png') },
    { name: 'Diagonal Bar', uri: require('../assets/images/Stock-Images/Shapes/diagonal bar.png') },
    { name: 'Diamond', uri: require('../assets/images/Stock-Images/Shapes/diamond.png') },
    { name: 'Heart', uri: require('../assets/images/Stock-Images/Shapes/heart.png') },
    { name: 'Heptagon', uri: require('../assets/images/Stock-Images/Shapes/heptagon.png') },
    { name: 'Hexagon', uri: require('../assets/images/Stock-Images/Shapes/hexagon.png') },
    { name: 'Inverted Triangle', uri: require('../assets/images/Stock-Images/Shapes/inverted triangle.png') },
    { name: 'Medium Rectangle', uri: require('../assets/images/Stock-Images/Shapes/medium rectangle.png') },
    { name: 'Medium Square', uri: require('../assets/images/Stock-Images/Shapes/medium square.png') },
    { name: 'Nonagon', uri: require('../assets/images/Stock-Images/Shapes/nonagon.png') },
    { name: 'Octagon', uri: require('../assets/images/Stock-Images/Shapes/octagon.png') },
    { name: 'Oval', uri: require('../assets/images/Stock-Images/Shapes/oval.png') },
    { name: 'Pentagon', uri: require('../assets/images/Stock-Images/Shapes/pentagon.png') },
    { name: 'Rectangle', uri: require('../assets/images/Stock-Images/Shapes/rectangle.png') },
    { name: 'Rectangle Door', uri: require('../assets/images/Stock-Images/Shapes/rectangle door.png') },
    { name: 'Rectangle Flag', uri: require('../assets/images/Stock-Images/Shapes/rectangle flag.png') },
    { name: 'Rectangle Picture Frame', uri: require('../assets/images/Stock-Images/Shapes/rectangle picture frame.png') },
    { name: 'Rectangle Shoe Box', uri: require('../assets/images/Stock-Images/Shapes/rectangle shoe box.png') },
    { name: 'Right Angle Triangle', uri: require('../assets/images/Stock-Images/Shapes/right angle triangle.png') },
    { name: 'Right Angles', uri: require('../assets/images/Stock-Images/Shapes/right angles.png') },
    { name: 'Small', uri: require('../assets/images/Stock-Images/Shapes/small.png') },
    { name: 'Small Inverted Triangle', uri: require('../assets/images/Stock-Images/Shapes/small inverted triangle.png') },
    { name: 'Small Square', uri: require('../assets/images/Stock-Images/Shapes/small square.png') },
    { name: 'Small Triangle', uri: require('../assets/images/Stock-Images/Shapes/small triangle.png') },
    { name: 'Square', uri: require('../assets/images/Stock-Images/Shapes/square.png') },
    { name: 'Square Gift Box', uri: require('../assets/images/Stock-Images/Shapes/square gift box.png') },
    { name: 'Star Shaped Lantern', uri: require('../assets/images/Stock-Images/Shapes/star shaped lantern.png') },
    { name: 'Tall Rectangle', uri: require('../assets/images/Stock-Images/Shapes/tall rectangle.png') },
    { name: 'Thin Rectangle', uri: require('../assets/images/Stock-Images/Shapes/thin rectangle.png') },
    { name: 'Triangle', uri: require('../assets/images/Stock-Images/Shapes/triangle.png') },
    { name: 'Triangle and 2 Squares', uri: require('../assets/images/Stock-Images/Shapes/triangle and 2 squares.png') },
    { name: 'Triangle Banderitas', uri: require('../assets/images/Stock-Images/Shapes/triangle banderitas.png') },
    { name: 'Triangle Flag', uri: require('../assets/images/Stock-Images/Shapes/triangle flag.png') },
    { name: 'Triangle Road Sign', uri: require('../assets/images/Stock-Images/Shapes/triangle road sign.png') },
    { name: 'Trapezoid', uri: require('../assets/images/Stock-Images/Shapes/trapezoid.png') },
  ],
  'Time and Position': [
    { name: '00:00', uri: require('../assets/images/Stock-Images/Time and Position/00_00.png') },
    { name: '1:00', uri: require('../assets/images/Stock-Images/Time and Position/1_00.png') },
    { name: '1:15', uri: require('../assets/images/Stock-Images/Time and Position/1_15.png') },
    { name: '1:30', uri: require('../assets/images/Stock-Images/Time and Position/1_30.png') },
    { name: '1:45', uri: require('../assets/images/Stock-Images/Time and Position/1_45.png') },
    { name: '10:00', uri: require('../assets/images/Stock-Images/Time and Position/10_00.png') },
    { name: '10:15', uri: require('../assets/images/Stock-Images/Time and Position/10_15.png') },
    { name: '10:30', uri: require('../assets/images/Stock-Images/Time and Position/10_30.png') },
    { name: '10:45', uri: require('../assets/images/Stock-Images/Time and Position/10_45.png') },
    { name: '11:00', uri: require('../assets/images/Stock-Images/Time and Position/11_00.png') },
    { name: '11:15', uri: require('../assets/images/Stock-Images/Time and Position/11_15.png') },
    { name: '11:30', uri: require('../assets/images/Stock-Images/Time and Position/11_30.png') },
    { name: '11:45', uri: require('../assets/images/Stock-Images/Time and Position/11_45.png') },
    { name: '12:00', uri: require('../assets/images/Stock-Images/Time and Position/12_00.png') },
    { name: '12:15', uri: require('../assets/images/Stock-Images/Time and Position/12_15.png') },
    { name: '12:30', uri: require('../assets/images/Stock-Images/Time and Position/12_30.png') },
    { name: '12:45', uri: require('../assets/images/Stock-Images/Time and Position/12_45.png') },
    { name: '2:00', uri: require('../assets/images/Stock-Images/Time and Position/2_00.png') },
    { name: '2:15', uri: require('../assets/images/Stock-Images/Time and Position/2_15.png') },
    { name: '2:30', uri: require('../assets/images/Stock-Images/Time and Position/2_30.png') },
    { name: '2:45', uri: require('../assets/images/Stock-Images/Time and Position/2_45.png') },
    { name: '27', uri: require('../assets/images/Stock-Images/Time and Position/27.png') },
    { name: '3:00', uri: require('../assets/images/Stock-Images/Time and Position/3_00.png') },
    { name: '3:30', uri: require('../assets/images/Stock-Images/Time and Position/3_30.png') },
    { name: '3:45', uri: require('../assets/images/Stock-Images/Time and Position/3_45.png') },
    { name: '4:00', uri: require('../assets/images/Stock-Images/Time and Position/4_00.png') },
    { name: '4:15', uri: require('../assets/images/Stock-Images/Time and Position/4_15.png') },
    { name: '4:30', uri: require('../assets/images/Stock-Images/Time and Position/4_30.png') },
    { name: '4:45', uri: require('../assets/images/Stock-Images/Time and Position/4_45.png') },
    { name: '5:00', uri: require('../assets/images/Stock-Images/Time and Position/5_00.png') },
    { name: '5:15', uri: require('../assets/images/Stock-Images/Time and Position/5_15.png') },
    { name: '5:30', uri: require('../assets/images/Stock-Images/Time and Position/5_30.png') },
    { name: '52', uri: require('../assets/images/Stock-Images/Time and Position/52.png') },
    { name: '6:00 (2)', uri: require('../assets/images/Stock-Images/Time and Position/6_00 (2).png') },
    { name: '6:00', uri: require('../assets/images/Stock-Images/Time and Position/6_00.png') },
    { name: '6:15', uri: require('../assets/images/Stock-Images/Time and Position/6_15.png') },
    { name: '6:30', uri: require('../assets/images/Stock-Images/Time and Position/6_30.png') },
    { name: '6:45', uri: require('../assets/images/Stock-Images/Time and Position/6_45.png') },
    { name: '7:00', uri: require('../assets/images/Stock-Images/Time and Position/7_00.png') },
    { name: '7:15', uri: require('../assets/images/Stock-Images/Time and Position/7_15.png') },
    { name: '7:30', uri: require('../assets/images/Stock-Images/Time and Position/7_30.png') },
    { name: '7:45', uri: require('../assets/images/Stock-Images/Time and Position/7_45.png') },
    { name: '8:00', uri: require('../assets/images/Stock-Images/Time and Position/8_00.png') },
    { name: '8:15', uri: require('../assets/images/Stock-Images/Time and Position/8_15.png') },
    { name: '8:30', uri: require('../assets/images/Stock-Images/Time and Position/8_30.png') },
    { name: '8:45', uri: require('../assets/images/Stock-Images/Time and Position/8_45.png') },
    { name: '9:00', uri: require('../assets/images/Stock-Images/Time and Position/9_00.png') },
    { name: '9:15', uri: require('../assets/images/Stock-Images/Time and Position/9_15.png') },
    { name: '9:30', uri: require('../assets/images/Stock-Images/Time and Position/9_30.png') },
    { name: '9:45', uri: require('../assets/images/Stock-Images/Time and Position/9_45.png') },
    { name: 'Arm Circle Clockwise', uri: require('../assets/images/Stock-Images/Time and Position/arm circle clockwise.png') },
    { name: 'Clockwise', uri: require('../assets/images/Stock-Images/Time and Position/clockwise.png') },
    { name: 'Half Turn', uri: require('../assets/images/Stock-Images/Time and Position/half-turn.png') },
    { name: 'Hip Clockwise Exercise', uri: require('../assets/images/Stock-Images/Time and Position/hip clockwise exercise.png') },
    { name: 'Home', uri: require('../assets/images/Stock-Images/Time and Position/home.png') },
    { name: 'Kid', uri: require('../assets/images/Stock-Images/Time and Position/kid.png') },
    { name: 'Knee Clockwise Exercise', uri: require('../assets/images/Stock-Images/Time and Position/knee clockwise exercise.png') },
    { name: 'Park', uri: require('../assets/images/Stock-Images/Time and Position/park.png') },
    { name: 'Quarter Turn', uri: require('../assets/images/Stock-Images/Time and Position/quarter-turn.png') },
  ],
  'Toys': [
    { name: 'Airplane', uri: require('../assets/images/Stock-Images/Toys/airplane.png') },
    { name: 'Ball', uri: require('../assets/images/Stock-Images/Toys/ball.png') },
    { name: 'Beach Ball', uri: require('../assets/images/Stock-Images/Toys/beach ball.png') },
    { name: 'Bear', uri: require('../assets/images/Stock-Images/Toys/bear.png') },
    { name: 'Bike', uri: require('../assets/images/Stock-Images/Toys/bike.png') },
    { name: 'Boat', uri: require('../assets/images/Stock-Images/Toys/boat.png') },
    { name: 'Car', uri: require('../assets/images/Stock-Images/Toys/car.png') },
    { name: 'Dice', uri: require('../assets/images/Stock-Images/Toys/dice.png') },
    { name: 'Dino', uri: require('../assets/images/Stock-Images/Toys/dino.png') },
    { name: 'Drums', uri: require('../assets/images/Stock-Images/Toys/drums.png') },
    { name: 'Excavator', uri: require('../assets/images/Stock-Images/Toys/excavator.png') },
    { name: 'House', uri: require('../assets/images/Stock-Images/Toys/house.png') },
    { name: 'Joystick', uri: require('../assets/images/Stock-Images/Toys/joystick.png') },
    { name: 'Kite', uri: require('../assets/images/Stock-Images/Toys/kite.png') },
    { name: 'Lego', uri: require('../assets/images/Stock-Images/Toys/lego.png') },
    { name: 'Magnet', uri: require('../assets/images/Stock-Images/Toys/magnet.png') },
    { name: 'Paper Boat', uri: require('../assets/images/Stock-Images/Toys/paper boat.png') },
    { name: 'Puzzle', uri: require('../assets/images/Stock-Images/Toys/puzzle.png') },
    { name: 'Racket', uri: require('../assets/images/Stock-Images/Toys/racket.png') },
    { name: 'Robot', uri: require('../assets/images/Stock-Images/Toys/robot.png') },
    { name: 'Rubik', uri: require('../assets/images/Stock-Images/Toys/rubik.png') },
    { name: 'Stack Ring', uri: require('../assets/images/Stock-Images/Toys/stack ring.png') },
    { name: 'Train', uri: require('../assets/images/Stock-Images/Toys/train.png') },
    { name: 'Xylophone', uri: require('../assets/images/Stock-Images/Toys/xylophone.png') },
    { name: 'Yo-yo', uri: require('../assets/images/Stock-Images/Toys/yoyo.png') },
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
  optionImages?: (string | null)[]; // Legacy single image per option
  optionMultipleImages?: (string[] | null)[]; // New multiple images per option
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
  ttsAudioUrl?: string; // AI-generated TTS audio
  recordedTtsUrl?: string; // Teacher-recorded audio (takes priority over ttsAudioUrl)
  ttsStatus?: 'idle' | 'generating' | 'ready' | 'failed'; // TTS generation status
}

export default function CreateExercise() {
  const router = useRouter();
  
  // Scroll references for scroll-to-top functionality
  const mainScrollRef = useRef<ScrollView>(null);
  const questionEditorScrollRef = useRef<ScrollView>(null);
  const stockImagesScrollRef = useRef<ScrollView>(null);
  
  // Scroll to top functionality
  const scrollToTop = useCallback((scrollRef: React.RefObject<ScrollView | null>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: 0, animated: true });
    }
  }, []);
  
  // Image preloading for better performance
  const preloadImages = useCallback(async () => {
    try {
      // Preload common stock images
      const commonImages = [
        require('../assets/images/icon.png'),
        ...stockImages['Alphabet'].slice(0, 5).map(img => img.uri),
        ...stockImages['Numbers'].slice(0, 5).map(img => img.uri),
        ...stockImages['Shapes'].slice(0, 5).map(img => img.uri),
      ];
      
      await Promise.all(
        commonImages.map(imageSource => 
          Image.prefetch(Image.resolveAssetSource(imageSource).uri)
        )
      );
    } catch (error) {
      console.log('Image preloading failed:', error);
    }
  }, []);

  useEffect(() => {
    preloadImages();
  }, [preloadImages]);
  const { edit } = useLocalSearchParams();
  const [exerciseTitle, setExerciseTitle] = useState('');
  const [exerciseDescription, setExerciseDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [exerciseCode, setExerciseCode] = useState('');
  const [exerciseCategory, setExerciseCategory] = useState('');
  const [timeLimitPerItem, setTimeLimitPerItem] = useState<number | null>(120); // Default 2 minutes (120 seconds)
  const [maxAttemptsPerItem, setMaxAttemptsPerItem] = useState<number | null>(null); // null = unlimited attempts
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
  
  // AI Improve state
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  
  // TTS Upload Progress state
  const [showTTSProgressModal, setShowTTSProgressModal] = useState(false);
  const [ttsUploadProgress, setTtsUploadProgress] = useState({ current: 0, total: 0 });
  const [ttsUploadStatus, setTtsUploadStatus] = useState<string>('');
  
  // Main Upload Progress state
  const [showUploadProgressModal, setShowUploadProgressModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState<string>('');
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
  
  // TTS timing/metrics for UI (generation + upload)
  const [ttsGenerationStartTime, setTtsGenerationStartTime] = useState<number | null>(null);
  const [ttsGenerationElapsedMs, setTtsGenerationElapsedMs] = useState(0);
  const [ttsGenerationLastDurationMs, setTtsGenerationLastDurationMs] = useState<number | null>(null);
  const [ttsProcessStartTime, setTtsProcessStartTime] = useState<number | null>(null);
  const [ttsProcessElapsedSeconds, setTtsProcessElapsedSeconds] = useState(0);
  const [ttsEstimatedTimeRemaining, setTtsEstimatedTimeRemaining] = useState<number | null>(null);
  const [ttsUploadStartTime, setTtsUploadStartTime] = useState<number | null>(null);
  const [ttsUploadElapsedMs, setTtsUploadElapsedMs] = useState(0);
  const [ttsUploadLastDurationMs, setTtsUploadLastDurationMs] = useState<number | null>(null);

  // Tick timers for generation/upload progress
  useEffect(() => {
    let timer: any;
    if (isGeneratingTTS) {
      if (!ttsGenerationStartTime) setTtsGenerationStartTime(Date.now());
      timer = setInterval(() => {
        setTtsGenerationElapsedMs(prev => {
          const start = ttsGenerationStartTime || Date.now();
          return Date.now() - start;
        });
      }, 1000);
    } else {
      if (ttsGenerationStartTime) {
        setTtsGenerationLastDurationMs(Date.now() - ttsGenerationStartTime);
      }
      setTtsGenerationStartTime(null);
      setTtsGenerationElapsedMs(0);
    }
    return () => timer && clearInterval(timer);
  }, [isGeneratingTTS]);

  useEffect(() => {
    let timer: any;
    const uploadingActive = ttsUploadProgress.total > 0 && ttsUploadProgress.current < ttsUploadProgress.total;
    if (uploadingActive) {
      if (!ttsUploadStartTime) setTtsUploadStartTime(Date.now());
      timer = setInterval(() => {
        setTtsUploadElapsedMs(prev => {
          const start = ttsUploadStartTime || Date.now();
          return Date.now() - start;
        });
      }, 1000);
    } else if (ttsUploadProgress.total === 0) {
      if (ttsUploadStartTime) {
        setTtsUploadLastDurationMs(Date.now() - ttsUploadStartTime);
      }
      setTtsUploadStartTime(null);
      setTtsUploadElapsedMs(0);
    }
    return () => timer && clearInterval(timer);
  }, [ttsUploadProgress.total, ttsUploadProgress.current]);


  const formatMs = (ms: number) => {
    const sec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  
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
    type: 'question' | 'option' | 'pair' | 'reorder' | 'multiple-question' | 'multiple-option';
  } | null>(null);
  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>({});
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [modalStack, setModalStack] = useState<string[]>([]);
  
  // Custom Alert state
  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>;
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: []
  });

  // Text Review Modal state
  const [textReviewModal, setTextReviewModal] = useState<{
    visible: boolean;
    originalText: string;
    processedText: string;
    onUseOriginal?: (text: string) => void;
    onUseProcessed?: (text: string) => void;
    onCancel?: () => void;
  }>({
    visible: false,
    originalText: '',
    processedText: '',
  });

  // Track failed TTS generations
  const [failedTTSQuestions, setFailedTTSQuestions] = useState<Set<string>>(new Set());
  const [isRetryingFailedTTS, setIsRetryingFailedTTS] = useState(false);

  // Voice Recording state
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null);
  const [hasPreviousRecording, setHasPreviousRecording] = useState(false);
  const recordingSound = useRef<Audio.Sound | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // AI TTS Toggle state (for AI question generator)
  const [generateAITTS, setGenerateAITTS] = useState(true);

  // Timer for TTS process (generation + upload)
  useEffect(() => {
    let timer: any;
    
    if (ttsProcessStartTime && (isGeneratingTTS || isRetryingFailedTTS)) {
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - ttsProcessStartTime) / 1000);
        setTtsProcessElapsedSeconds(elapsed);
        
        // Calculate estimated time remaining based on progress
        if (ttsProgress.total > 0 && ttsProgress.current > 0) {
          const progressRatio = ttsProgress.current / ttsProgress.total;
          const estimatedTotalTime = elapsed / progressRatio;
          const remaining = Math.max(0, Math.floor(estimatedTotalTime - elapsed));
          setTtsEstimatedTimeRemaining(remaining);
        }
      }, 1000);
    } else {
      setTtsProcessElapsedSeconds(0);
      setTtsEstimatedTimeRemaining(null);
    }
    
    return () => timer && clearInterval(timer);
  }, [ttsProcessStartTime, isGeneratingTTS, isRetryingFailedTTS, ttsProgress.current, ttsProgress.total]);
  
  // Generate 6-digit code for exercise
  const generateExerciseCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setExerciseCode(code);
    return code;
  };

  // Custom Alert functions
  const showCustomAlert = (
    title: string,
    message: string,
    buttons: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }> = [{ text: 'OK' }]
  ) => {
    setCustomAlert({
      visible: true,
      title,
      message,
      buttons
    });
  };

  const hideCustomAlert = () => {
    setCustomAlert({
      visible: false,
      title: '',
      message: '',
      buttons: []
    });
  };

  // Text Review Modal functions
  const showTextReviewModal = (
    originalText: string,
    processedText: string,
    onUseOriginal?: (text: string) => void,
    onUseProcessed?: (text: string) => void,
    onCancel?: () => void
  ) => {
    setTextReviewModal({
      visible: true,
      originalText,
      processedText,
      onUseOriginal,
      onUseProcessed,
      onCancel
    });
  };

  const hideTextReviewModal = () => {
    setTextReviewModal({
      visible: false,
      originalText: '',
      processedText: '',
    });
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

  // Optionally, we could refresh key cache here in future (DB-driven now)
  const maintenanceInterval = setInterval(() => {}, 5 * 60 * 1000); // noop

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
            }
          } catch (error) {
            console.warn('Failed to clean up current local TTS file:', error);
          }
        } else {
        }
      }
      
      // DON'T clean up pending uploads - they need to stay for upload
      
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
        setTimeLimitPerItem(data.timeLimitPerItem || 120);
        setMaxAttemptsPerItem(data.maxAttemptsPerItem || null);
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
        showCustomAlert('Error', 'Exercise not found');
        router.back();
      }
    } catch (error) {
      console.error('Error loading exercise for edit:', error);
      showCustomAlert('Error', 'Failed to load exercise');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  // Check if an image URI is local (from require())
  const isLocalImage = (uri: string): boolean => {
    if (!uri) return false;
    
    // Check for various local URI patterns
    const localPatterns = [
      'assets/',           // Bundled assets
      'file://',           // Local file system
      'content://',        // Android content provider
      'http://192.168.',   // Local dev server
      'http://10.',        // Local dev server
      'http://localhost:', // Local dev server
      'http://127.0.0.1:', // Local dev server
      '/static/media/',    // Webpack static assets
    ];
    
    // Check if URI matches any local pattern
    const isLocal = localPatterns.some(pattern => uri.includes(pattern));
    
    // Also check if URI is NOT a Firebase Storage URL
    const isFirebaseUrl = uri.includes('firebasestorage.googleapis.com') || 
                         uri.includes('storage.googleapis.com');
    
    return isLocal && !isFirebaseUrl;
  };

  // Upload local images to Firebase Storage and return remote URLs
  const uploadLocalImages = async (questions: Question[], exerciseCode: string): Promise<Question[]> => {
    const updatedQuestions = [...questions];
    const imagesToUpload: Array<{
      questionIndex: number;
      imageType: 'question' | 'questionImages' | 'optionImages' | 'pairLeft' | 'pairRight' | 'reorderItem';
      imageIndex?: number;
      imageUri: string;
      storagePath: string;
    }> = [];

    // Collect all images that need to be uploaded
    for (let qIndex = 0; qIndex < updatedQuestions.length; qIndex++) {
      const question = updatedQuestions[qIndex];
      
      // Handle question image
      if (question.questionImage && isLocalImage(question.questionImage)) {
        imagesToUpload.push({
          questionIndex: qIndex,
          imageType: 'question',
          imageUri: question.questionImage,
          storagePath: `exercises/${exerciseCode}/question-${qIndex}`
        });
      }

      // Handle multiple question images
      if (question.questionImages && Array.isArray(question.questionImages)) {
        question.questionImages.forEach((imageUri, imgIndex) => {
          if (isLocalImage(imageUri)) {
            imagesToUpload.push({
              questionIndex: qIndex,
              imageType: 'questionImages',
              imageIndex: imgIndex,
              imageUri,
              storagePath: `exercises/${exerciseCode}/question-${qIndex}-image-${imgIndex}`
            });
          }
        });
      }

      // Handle option images
      if (question.optionImages) {
        question.optionImages.forEach((imageUri, optionIndex) => {
          if (imageUri && isLocalImage(imageUri)) {
            imagesToUpload.push({
              questionIndex: qIndex,
              imageType: 'optionImages',
              imageIndex: optionIndex,
              imageUri,
              storagePath: `exercises/${exerciseCode}/question-${qIndex}/option-${optionIndex}`
            });
          }
        });
      }

      // Handle pair images
      if (question.pairs) {
        question.pairs.forEach((pair, pairIndex) => {
          if (pair.leftImage && isLocalImage(pair.leftImage)) {
            imagesToUpload.push({
              questionIndex: qIndex,
              imageType: 'pairLeft',
              imageIndex: pairIndex,
              imageUri: pair.leftImage,
              storagePath: `exercises/${exerciseCode}/question-${qIndex}/pair-${pairIndex}-left`
            });
          }
          if (pair.rightImage && isLocalImage(pair.rightImage)) {
            imagesToUpload.push({
              questionIndex: qIndex,
              imageType: 'pairRight',
              imageIndex: pairIndex,
              imageUri: pair.rightImage,
              storagePath: `exercises/${exerciseCode}/question-${qIndex}/pair-${pairIndex}-right`
            });
          }
        });
      }

      // Handle reorder item images
      if (question.reorderItems) {
        question.reorderItems.forEach((item, itemIndex) => {
          if (item.type === 'image' && item.imageUrl && isLocalImage(item.imageUrl)) {
            imagesToUpload.push({
              questionIndex: qIndex,
              imageType: 'reorderItem',
              imageIndex: itemIndex,
              imageUri: item.imageUrl,
              storagePath: `exercises/${exerciseCode}/question-${qIndex}/reorder-${itemIndex}`
            });
          }
        });
      }
    }

    // Upload images in parallel batches for better performance
    const BATCH_SIZE = 3; // Upload 3 images at a time to avoid overwhelming the server
    const uploadResults: Array<{ success: boolean; imageInfo: any; remoteUrl?: string; error?: any }> = [];
    
    for (let i = 0; i < imagesToUpload.length; i += BATCH_SIZE) {
      const batch = imagesToUpload.slice(i, i + BATCH_SIZE);
      
      // Upload batch in parallel
      const batchPromises = batch.map(async (imageInfo) => {
      try {
        const remoteUrl = await uploadLocalImageToStorage(imageInfo.imageUri, imageInfo.storagePath);
          return { success: true, imageInfo, remoteUrl };
        } catch (error) {
          console.error(`Failed to upload image:`, error);
          return { success: false, imageInfo, error };
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      uploadResults.push(...batchResults);
      
      // Update progress
      const progress = Math.round(((i + batch.length) / imagesToUpload.length) * 100);
      setUploadStatus(`Uploading images... ${progress}%`);
      
      // Small delay between batches to prevent overwhelming the server
      if (i + BATCH_SIZE < imagesToUpload.length) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    
    // Update questions with successful uploads
    uploadResults.forEach(({ success, imageInfo, remoteUrl }) => {
      if (success && remoteUrl) {
        const question = updatedQuestions[imageInfo.questionIndex];
        switch (imageInfo.imageType) {
          case 'question':
            question.questionImage = remoteUrl;
            break;
          case 'questionImages':
            if (!question.questionImages) {
              question.questionImages = [...(question.questionImages || [])];
            }
            if (question.questionImages && Array.isArray(question.questionImages) && 
                question.questionImages.length > (imageInfo.imageIndex || 0)) {
              question.questionImages[imageInfo.imageIndex!] = remoteUrl;
            }
            break;
          case 'optionImages':
            if (!question.optionImages) {
              question.optionImages = [];
            }
            question.optionImages[imageInfo.imageIndex!] = remoteUrl;
            break;
          case 'pairLeft':
            if (question.pairs && question.pairs.length > (imageInfo.imageIndex || 0)) {
              question.pairs[imageInfo.imageIndex!].leftImage = remoteUrl;
            }
            break;
          case 'pairRight':
            if (question.pairs && question.pairs.length > (imageInfo.imageIndex || 0)) {
              question.pairs[imageInfo.imageIndex!].rightImage = remoteUrl;
            }
            break;
          case 'reorderItem':
            if (question.reorderItems && question.reorderItems.length > (imageInfo.imageIndex || 0)) {
              question.reorderItems[imageInfo.imageIndex!].imageUrl = remoteUrl;
              question.reorderItems[imageInfo.imageIndex!].content = remoteUrl;
            }
            break;
        }
      }
    });
    
    const successCount = uploadResults.filter(r => r.success).length;
    const failCount = uploadResults.filter(r => !r.success).length;
    console.log(`📸 Image upload complete: ${successCount} successful, ${failCount} failed`);

    return updatedQuestions;
  };

  // Upload a single local image to Firebase Storage
  const uploadLocalImageToStorage = async (localUri: string, storagePath: string): Promise<string> => {
    try {
      // Add timeout protection
      const uploadPromise = (async () => {
        // For local images from require(), we need to get the actual file
        const response = await fetch(localUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const blob = await response.blob();
        if (blob.size === 0) {
          throw new Error('Image blob is empty');
        }
        
        const { downloadURL, error } = await uploadFile(`${storagePath}.png`, blob, {
          contentType: 'image/png',
        });
        
        if (error) {
          throw new Error(`Upload failed: ${error}`);
        }
        
        if (!downloadURL) {
          throw new Error('No download URL returned');
        }
        
        return downloadURL;
      })();
      
      // Add 15-second timeout for faster failure detection
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Upload timeout after 15 seconds')), 15000);
      });
      
      return await Promise.race([uploadPromise, timeoutPromise]);
      
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
  ];

  // Dynamic stock image categories - Updated with new Stock-Images categories
  const stockImageCategories = [
    {
      id: '3d-alphabet',
      name: '3D Alphabet',
      icon: 'cube-outline',
      color: '#8b5cf6',
      images: stockImages['3D Alphabet'].map(letter => ({
        name: letter.name,
        source: letter.uri
      }))
    },
    {
      id: 'alphabet',
      name: 'Alphabet',
      icon: 'alphabetical',
      color: '#3b82f6',
      images: stockImages['Alphabet'].map(letter => ({
        name: letter.name,
        source: letter.uri
      }))
    },
    {
      id: 'animals',
      name: 'Animals',
      icon: 'paw',
      color: '#f59e0b',
      images: stockImages['Animals'].map(animal => ({
        name: animal.name,
        source: animal.uri
      }))
    },
    {
      id: 'boxed-alphabet',
      name: 'Boxed Alphabet',
      icon: 'square-outline',
      color: '#10b981',
      images: stockImages['Boxed Alphabet'].map(letter => ({
        name: letter.name,
        source: letter.uri
      }))
    },
    {
      id: 'boxed-numbers',
      name: 'Boxed Numbers 1-9',
      icon: 'numeric-1-box',
      color: '#ef4444',
      images: stockImages['Boxed Numbers 1-9'].map(number => ({
        name: number.name,
        source: number.uri
      }))
    },
    {
      id: 'comparing-quantities',
      name: 'Comparing Quantities',
      icon: 'scale-balance',
      color: '#f97316',
      images: stockImages['Comparing Quantities'].map(item => ({
        name: item.name,
        source: item.uri
      }))
    },
    {
      id: 'dates',
      name: 'Dates',
      icon: 'calendar',
      color: '#06b6d4',
      images: stockImages['Dates'].map(date => ({
        name: date.name,
        source: date.uri
      }))
    },
    {
      id: 'extra-objects',
      name: 'Extra Objects',
      icon: 'shape',
      color: '#84cc16',
      images: stockImages['Extra Objects'].map(obj => ({
        name: obj.name,
        source: obj.uri
      }))
    },
    {
      id: 'fractions',
      name: 'Fractions',
      icon: 'fraction',
      color: '#ec4899',
      images: stockImages['Fractions'].map(fraction => ({
        name: fraction.name,
        source: fraction.uri
      }))
    },
    {
      id: 'fruits-vegetables',
      name: 'Fruits and Vegetables',
      icon: 'food-apple',
      color: '#22c55e',
      images: stockImages['Fruits and Vegetables'].map(item => ({
        name: item.name,
        source: item.uri
      }))
    },
    {
      id: 'length-distance',
      name: 'Length and Distance',
      icon: 'ruler',
      color: '#6366f1',
      images: stockImages['Length and Distance'].map(item => ({
        name: item.name,
        source: item.uri
      }))
    },
    {
      id: 'math-symbols',
      name: 'Math Symbols',
      icon: 'calculator',
      color: '#dc2626',
      images: stockImages['Math Symbols'].map(symbol => ({
        name: symbol.name,
        source: symbol.uri
      }))
    },
    {
      id: 'money',
      name: 'Money',
      icon: 'currency-usd',
      color: '#16a34a',
      images: stockImages['Money'].map(item => ({
        name: item.name,
        source: item.uri
      }))
    },
    {
      id: 'numbers',
      name: 'Numbers',
      icon: 'numeric',
      color: '#2563eb',
      images: stockImages['Numbers'].map(number => ({
        name: number.name,
        source: number.uri
      }))
    },
    {
      id: 'patterns',
      name: 'Patterns',
      icon: 'pattern',
      color: '#7c3aed',
      images: stockImages['Patterns'].map(pattern => ({
        name: pattern.name,
        source: pattern.uri
      }))
    },
    {
      id: 'school-supplies',
      name: 'School Supplies',
      icon: 'school',
      color: '#0891b2',
      images: stockImages['School Supplies'].map(supply => ({
        name: supply.name,
        source: supply.uri
      }))
    },
    {
      id: 'shapes',
      name: 'Shapes',
      icon: 'shape',
      color: '#ea580c',
      images: stockImages['Shapes'].map(shape => ({
        name: shape.name,
        source: shape.uri
      }))
    },
    {
      id: 'time-position',
      name: 'Time and Position',
      icon: 'clock',
      color: '#be185d',
      images: stockImages['Time and Position'].map(item => ({
        name: item.name,
        source: item.uri
      }))
    },
    {
      id: 'toys',
      name: 'Toys',
      icon: 'toy-brick',
      color: '#db2777',
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
      const initialItem = { id: Date.now().toString(), type: 'text', content: '' };
      newQuestion.order = [''];
      newQuestion.reorderItems = [initialItem];
      newQuestion.reorderDirection = 'asc';
      newQuestion.answer = []; // Empty array to be filled when items are added
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
      
      // Create file name and local path using the cache directory
      const fileName = `tts_${questionId}_${Date.now()}.mp3`;
      const localUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      // Write to local file system using the legacy API
      await FileSystem.writeAsStringAsync(localUri, base64Audio, {
        encoding: 'base64',
      });
      
      return localUri;
      
    } catch (error) {
      console.error('Error saving TTS audio locally:', error);
      throw error;
    }
  };

  // Function to upload local MP3 file to Firebase Storage
  const uploadTTSAudioToStorage = async (localUri: string, exerciseCode: string, questionId: string): Promise<string> => {
    try {
      
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        throw new Error(`Local TTS file not found: ${localUri}`);
      }
      
      
      // Create file name and storage path
      const fileName = `tts_${questionId}_${Date.now()}.mp3`;
      const storagePath = `exercises/${exerciseCode}/tts/${fileName}`;
      
      // Fetch the local file and convert to blob
      const response = await fetch(localUri);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch local file: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      
      // Upload blob to Firebase Storage
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
    
    // Initialize progress
    setTtsUploadProgress({ current: 0, total: pendingTTSUploads.length });
    setTtsUploadStartTime(Date.now());
    
    let updatedQuestions = [...currentQuestions];
    const successfulUploads: string[] = [];
    const failedUploads: any[] = [];
    
    for (let i = 0; i < pendingTTSUploads.length; i++) {
      const ttsAudio = pendingTTSUploads[i];
      
      // Update progress
      setTtsUploadProgress({ current: i + 1, total: pendingTTSUploads.length });
      setTtsUploadStatus(`Uploading TTS audio ${i + 1} of ${pendingTTSUploads.length}...`);
      try {
        const fileStart = Date.now();
        
        // Upload using local file path
        const audioUrl = await uploadTTSAudioToStorage(ttsAudio.localUri, exerciseCode, ttsAudio.questionId);
        const fileTime = Date.now() - fileStart;
        
        
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
          }
        } catch (cleanupError) {
          console.warn('⚠️ Failed to clean up local TTS file:', cleanupError);
        }
        
        // Track successful upload
        successfulUploads.push(ttsAudio.questionId);
        
      } catch (error) {
        console.error(`❌ Failed to upload TTS audio for question ${ttsAudio.questionId}:`, error);
        
        // Track failed upload
        failedUploads.push(ttsAudio);
      }
    }
    
    const totalTime = Date.now() - uploadStart;
    
    // Reset progress and store duration
    setTtsUploadProgress({ current: 0, total: 0 });
    setTtsUploadLastDurationMs(Date.now() - uploadStart);
    setTtsUploadStartTime(null);
    
    // Only clear successful uploads from pending list
    if (successfulUploads.length > 0) {
      setPendingTTSUploads(prev => prev.filter(p => !successfulUploads.includes(p.questionId)));
    }
    
    // Keep failed uploads in pending list for retry
    if (failedUploads.length > 0) {
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
      showCustomAlert('Error', 'Please fill in the exercise title, description, and category first');
      return;
    }

    // Additional requirements are now optional since there's already a specific prompt

    setIsGeneratingQuestions(true);

    try {
      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";
      
      
      // Get available stock images for reference (without category names)
      const allAvailableImages = Object.keys(stockImages)
        .flatMap(category => stockImages[category].map(img => img.name))
        .join(', ');
      
      const availableImages = `Available images: ${allAvailableImages}`;

      // Use existing questions as both context (to avoid duplicates) and samples (to match style)
      const existingQuestionsContext = questions.length > 0 
        ? `\n\nEXISTING QUESTIONS (Use these as examples for style, difficulty, and topic focus - DO NOT REPEAT THESE):\n${questions.map((q, idx) => `${idx + 1}. [${q.type}] ${q.question}`).join('\n')}\n\n**CRITICAL**: Generate NEW questions that:\n- Match the style and difficulty of the existing questions above\n- Cover different aspects of the same topic\n- DO NOT repeat or closely paraphrase any existing question\n- Maintain the same teaching approach and language mix (Filipino/English ratio)`
        : '';

      const prompt = `You are an expert educational content creator for Grade 1 students in the Philippines. Generate ${numberOfQuestions} ${selectedQuestionType} questions based on the following exercise details:

EXERCISE DETAILS:
- Title: ${exerciseTitle}
- Description: ${exerciseDescription}
- Category: ${exerciseCategory}
- Additional Requirements: ${aiPrompt}

QUESTION TYPE: ${selectedQuestionType}${existingQuestionsContext}

AVAILABLE STOCK IMAGES (use these in your questions when relevant):
${availableImages}

**CRITICAL IMAGE NAMING RULE:**
When referencing images, use ONLY the image name itself. 
❌ NEVER write: "Fruits and Vegetables: Banana"
✅ ALWAYS write: "Banana"
❌ NEVER write: "Animals: Cat"  
✅ ALWAYS write: "Cat"
❌ NEVER write: "Numbers: 5"
✅ ALWAYS write: "5"

=== PREMIUM VISUAL PRESENTATION STANDARDS ===

VISUAL ACCURACY REQUIREMENTS:
1. **questionImages should provide CONTEXT, NEVER reveal the answer**
2. Images must be EXACTLY relevant - no approximations or "close enough" matches
3. The visual should clarify what to look at, not give away the answer
4. If asking about a specific object, show THAT object (answer is the name/color/count, not the object itself)
5. Images should support understanding, not just decorate

IMAGE MATCHING PRECISION & WHEN TO USE IMAGES:
- Question: "Ano ang hugis nito?" → Use questionImages: ["Triangle"] (show shape, answer is the NAME)
- Question: "Ilan ang mga ito?" → Use questionImages: ["Apple", "Apple", "Apple"] (show objects, answer is the COUNT)
- Question: "Anong kulay ang bulaklak?" → Use questionImages: ["Pink Rose"] (show flower, answer is the COLOR)
- Question: "Alin ang mas malaki?" → Use questionImages with size comparisons (show comparison context)
- Question: "Ano ang sagot sa 2 + 3?" → NO questionImages (math problem, no visual needed)
- Question: "Ano ang tawag sa...?" → Only use questionImages if the "ito" refers to something visual
- WRONG: Asking about dogs but showing cat image
- WRONG: Asking about numbers but showing letters
- WRONG: Asking about shapes but showing animals
- WRONG: Adding decorative images that don't help answer the question

MULTIPLE CHOICE IMAGE RULES:
- When using option images, each option MUST have a matching image from stock library
- Images should be clearly distinguishable from each other
- All option images should be the same category (all animals, all shapes, all numbers, etc.)
- Option images should match the question's visual context
- Example: Question about animals → All options should be animal images
- Example: Question about shapes → All options should be shape images

**MATCHING & RE-ORDER IMAGE RULES (VERY IMPORTANT):**
- Each matching pair or reorder item can only show ONE image (not multiple)
- Use COMPOSITE/MULTI-ITEM images from these categories:
  ✅ "Comparing Quantities" (e.g., "2 Apples", "3 Candies", "5 Pencils")
  ✅ "Money" (e.g., "16 Pesos", "23 Pesos", "Piso (1 peso coin)")
  ✅ "Patterns" (e.g., "2 Boy 2 Girl", "Blue Pink", "Heart Star")
  ✅ "Time and Position" (e.g., "1:00", "2:30", "Quarter Turn")
  ✅ "Boxed Numbers" (numbers in boxes)
  ✅ "Numbers" (for number sequences)
- ❌ DON'T use single fruits like "Red Apple" alone - use "2 Apples" from Comparing Quantities
- ❌ DON'T use single animals like "Cat" alone for counting - use quantity images
- Each item should be a complete visual unit

PATTERN & SEQUENCE VISUALIZATION:
- For number sequences in questionImages: Use ["1", "2", "3"] to show the pattern
- For shape patterns in questionImages: Use ["Circle", "Square", "Circle", "Square"]
- For quantity visualization in questionImages: Repeat the same image N times
- Pattern questions MUST use questionImages array (3-4 images minimum)
- The pattern must be visually clear and obvious to Grade 1 students

**FOR MATCHING/RE-ORDER ITEMS - USE COMPOSITE IMAGES:**
- ✅ Counting/Quantities: Use "2 Apples", "3 Candies", "5 Boys" (one image shows multiple items)
- ✅ Money: Use "16 Pesos", "23 Pesos", "40 pesos" (one image shows the amount)
- ✅ Time: Use "1:00", "2:30", "6:00" (one clock image)
- ✅ Patterns: Use "2 Boy 2 Girl", "Blue Pink", "Heart Star"
- ❌ Don't use "Red Apple" alone when asking about quantities
- ❌ Don't combine multiple single-item images - use pre-made composite images

QUANTITY VISUALIZATION (CRITICAL):
**IMPORTANT DISTINCTION:**
- **questionImages** (for IDENTIFICATION questions) = Can repeat images to show quantity
  ✅ questionImages: ["Red Apple", "Red Apple", "Red Apple"] (shows 3 apples to count)
- **reorderItems/pairs** (for MATCHING/RE-ORDER) = Must use ONE composite image per item
  ✅ reorderItems: [{"type": "image", "imageUrl": "3 Apples"}] (one image showing 3 apples)
  ❌ reorderItems: Can't use multiple images like ["Red Apple", "Red Apple", "Red Apple"]

- When question mentions a number (e.g., "5 apples", "lima na mansanas") in IDENTIFICATION:
  → Use questionImages to repeat the image that many times
  → Example: "May 5 apples" → questionImages: ["Red Apple", "Red Apple", "Red Apple", "Red Apple", "Red Apple"]
- For MATCHING/RE-ORDER with quantities:
  → Use composite images from "Comparing Quantities"
  → Example: Use "3 Apples" as ONE image, not three separate apple images
- Maximum 10 repetitions for questionImages clarity

=== FILIPINO GRADE 1 STUDENT REQUIREMENTS ===

LANGUAGE:
1. Use simple Filipino (Tagalog) as primary language (90% Filipino, 10% English when needed)
2. Age-appropriate for 6-7 year old Filipino children
3. Use familiar Filipino words: "bahay", "pamilya", "pagkain", "kulay", "bilang", "hayop"
4. Simple sentence structures only
5. Engaging Filipino cultural context

QUESTION QUALITY:
1. Natural and conversational - like a friendly teacher
2. NO category labels or prefixes
3. Pure questions only (e.g., "Ano ito?", "Ilan ang mga ito?", "Anong kulay ito?")
4. NEVER reveal answers in question text
5. No parenthetical hints or instructions

=== QUESTION TYPE SPECIFIC RULES ===

FOR MULTIPLE CHOICE:
- Provide 4 clear, distinct options
- Only 1 correct answer (unless multiAnswer specified)
- "answer" field contains EXACT text from options array
- Correct answer in RANDOM position (not always first)
- All options should be plausible distractors
- If using images, ALL options must have images
- Option images should be from the same visual category

FOR IDENTIFICATION:
- Ask for specific Filipino words, objects, or concepts
- "answer" field contains the correct answer text
- NO options array
- NO emojis in answer text
- Single-word or short phrase answers
- questionImage shows EXACTLY what student should identify
- ALWAYS include 6-10 alternative answers (Filipino, English, regional variations)
- Never reveal answer in question text

FOR MATCHING:
- Create clear, logical pairs (3-5 pairs recommended)
- "answer" field is array of correct pair indices [0, 1, 2, ...]
- Include "pairs" array with left and right items
- **Use COMPOSITE images** from "Comparing Quantities", "Money", "Time and Position", "Patterns"
- Each pair item = ONE image only (no multiple images per item)
- Good examples: Match times ("7:00", "12:00"), money amounts ("16 Pesos", "23 Pesos"), quantities ("2 Apples", "3 Candies")
- ❌ BAD: Don't use just "Red Apple" - use "2 Apples" or "3 Apples" from Comparing Quantities
- Pairs should have obvious relationships for Grade 1 level

FOR RE-ORDER:
- Create logical sequences (numbers, money amounts, time sequences, quantity comparisons)
- "answer" field is array of items in correct order
- "reorderItems" array with text and/or image items
- **Use COMPOSITE images** that show complete units (money amounts, quantities, times, boxed numbers)
- Each reorderItem = ONE image only (no multiple images per item)
- Good examples: Order money amounts ("16 Pesos", "23 Pesos", "40 pesos"), times ("1:00", "2:00", "3:00"), numbers ("1", "2", "3")
- ❌ BAD: Don't use just "Cat" - use "2 + 8", "3 Girls", "5 Boys" from Comparing Quantities
- Items should be obvious and age-appropriate
- Direction: ascending by default (can be descending for advanced)

=== CRITICAL IMAGE SELECTION GUIDELINES ===

**STRICT IMAGE USAGE RULES:**
1. **NEVER add answer images to questionImage or questionImages** - These should only show context, NOT the answer!
2. **ALWAYS use questionImages array** (even for single images) - NEVER use questionImage field
3. **Image names only** - Use just "Banana" NOT "Fruits and Vegetables: Banana"
4. **Only add relevant images** - If question asks "Ano ang kulay ng langit?" (What color is sky?), don't add any image
5. **Context only** - Images should provide context for the question, NOT reveal the answer

EXACT MATCHING:
- Question asks about "Cat" → Use image named "Cat" ONLY
- Question asks about "Triangle" → Use image named "Triangle" ONLY
- Question asks about "5" → Use image named "5" ONLY
- NO approximations, NO substitutions

CONTEXTUAL RELEVANCE (NOT ANSWER REVEALING):
- Question about counting animals → Show animals in questionImages, answer is the COUNT
  Example: questionImages: ["Cat", "Cat", "Cat"] (shows context, answer is "3")
- Question about shape names → Show the shape in questionImages, answer is the NAME
  Example: questionImages: ["Triangle"] (shows shape, answer is "Triangle" or "Tatsulok")
- Question about colors → Show colored objects in questionImages, answer is the COLOR
  Example: questionImages: ["Red Apple"] (shows object, answer is "Red" or "Pula")
- Animals that give milk → Use "Cow" or "Goat" (NOT pig, NOT cat)
- Filipino fruits → Use "Mangga", "Saging", "Bayabas" (clean names, no folder prefix)

IF NO PERFECT IMAGE EXISTS:
- Do NOT force an image
- Simply omit the questionImages or optionImages field
- Focus on clear text instead
- Better to have no image than wrong image

IMPORTANT: Respond ONLY with valid JSON array. No additional text before or after.

=== JSON RESPONSE FORMATS ===

Multiple Choice Example (with option images - CLEAN NAMES ONLY):
[
  {
    "question": "Ano ang hayop na ito?",
    "answer": "Cat",
    "options": ["Dog", "Cat", "Bird", "Fish"],
    "optionImages": ["Dog", "Cat", "Bird", "Fish"]
  }
]
❌ WRONG: "optionImages": ["Animals: Dog", "Animals: Cat", "Animals: Bird", "Animals: Fish"]
✅ CORRECT: "optionImages": ["Dog", "Cat", "Bird", "Fish"]

Identification Example (with quantity visualization - SHOWS CONTEXT, NOT ANSWER):
[
  {
    "question": "Ilan ang mga mansanas?",
    "answer": "5",
    "questionImages": ["Red Apple", "Red Apple", "Red Apple", "Red Apple", "Red Apple"],
    "alternativeAnswers": ["lima", "five", "5", "limang mansanas", "5 apples", "five apples"]
  }
]
❌ WRONG: "questionImages": ["Fruits and Vegetables: Red Apple", ...]
✅ CORRECT: "questionImages": ["Red Apple", "Red Apple", ...]

Identification Example (with context image - SHOWS WHAT TO IDENTIFY, NOT THE ANSWER TEXT):
[
  {
    "question": "Ano ang hugis nito?",
    "answer": "Triangle",
    "questionImages": ["Triangle"],
    "alternativeAnswers": ["tatsulok", "triangle", "tatlong gilid", "three sides", "triangulo"]
  }
]

Matching Example (using composite images - ONE IMAGE PER ITEM):
[
  {
    "question": "Itambal ang oras sa tamang panahon",
    "answer": [0, 1, 2],
    "pairs": [
      {"left": "Umaga", "right": "7:00", "rightImage": "7:00"},
      {"left": "Tanghali", "right": "12:00", "rightImage": "12:00"},
      {"left": "Gabi", "right": "6:00", "rightImage": "6:00"}
    ]
  }
]
❌ WRONG: "leftImage": "Time and Position: 7:00"
✅ CORRECT: "rightImage": "7:00"

Matching Example (shapes - single items OK for shapes):
[
  {
    "question": "Itambal ang hugis sa pangalan nito",
    "answer": [0, 1, 2],
    "pairs": [
      {"left": "Bilog", "right": "Circle", "leftImage": "Circle"},
      {"left": "Parisukat", "right": "Square", "leftImage": "Square"},
      {"left": "Tatsulok", "right": "Triangle", "leftImage": "Triangle"}
    ]
  }
]

Re-order Example (using composite images - EACH ITEM IS ONE IMAGE):
[
  {
    "question": "Ayusin ayon sa dami ng pera",
    "answer": ["16 Pesos", "23 Pesos", "27 pesos", "40 pesos"],
    "reorderItems": [
      {"type": "image", "content": "40 pesos", "imageUrl": "40 pesos"},
      {"type": "image", "content": "16 Pesos", "imageUrl": "16 Pesos"},
      {"type": "image", "content": "27 pesos", "imageUrl": "27 pesos"},
      {"type": "image", "content": "23 Pesos", "imageUrl": "23 Pesos"}
    ]
  }
]
❌ WRONG: Using "Isandaan (100 peso bill)" + "Singkwenta (50 peso bill)" separately
✅ CORRECT: Using "40 pesos" (one composite image showing the amount)

Re-order Example (number sequence - CLEAN NAMES):
[
  {
    "question": "Ayusin ang mga numero mula sa pinakamaliit hanggang pinakamalaki",
    "answer": ["1", "3", "5", "7"],
    "reorderItems": [
      {"type": "image", "content": "7", "imageUrl": "7"},
      {"type": "image", "content": "3", "imageUrl": "3"},
      {"type": "image", "content": "1", "imageUrl": "1"},
      {"type": "image", "content": "5", "imageUrl": "5"}
    ]
  }
]
❌ WRONG: "imageUrl": "Numbers: 1"
✅ CORRECT: "imageUrl": "1"

Re-order Example (pattern completion):
[
  {
    "question": "Ano ang susunod sa pattern?",
    "questionImages": ["Circle", "Square", "Circle", "Square"],
    "answer": "Circle"
  }
]

=== FINAL REMINDERS ===

**IMAGE NAMING (CRITICAL):**
- Use ONLY image names: "Banana", "Cat", "Triangle", "1", "16 Pesos", "2 Apples"
- NEVER include folder names: ❌ "Fruits and Vegetables: Banana" ✅ "Banana"
- NEVER include categories: ❌ "Animals: Cat" ✅ "Cat"
- Clean names for ALL image fields: questionImages, optionImages, leftImage, rightImage, imageUrl

**IMAGE USAGE (CRITICAL):**
- questionImages = CONTEXT only (what to look at), NOT the answer
- optionImages = Answer choices (each option gets its own image)
- ALWAYS use questionImages array (even for 1 image), NEVER use imageReferences field
- Only add images when they truly help understand the question

**MATCHING & RE-ORDER IMAGES (CRITICAL):**
- Each item = ONE single image (can't use multiple images per item)
- Use COMPOSITE images that show complete concepts:
  ✅ "2 Apples", "3 Candies", "16 Pesos", "7:00", "2 Boy 2 Girl"
  ❌ Don't use single items like "Red Apple" alone for quantity questions
- Prefer images from: Comparing Quantities, Money, Time and Position, Patterns, Boxed Numbers
- For shapes/alphabet: Single items are OK ("Circle", "A", "Triangle")

**EXAMPLES OF GOOD IMAGE CHOICES:**
- Re-order by money amount: "16 Pesos", "23 Pesos", "27 pesos", "40 pesos"
- Re-order by quantity: "1 Apple", "2 Apples", "3 Apples", "4 Apples" (from Comparing Quantities)
- Re-order by time: "1:00", "2:00", "3:00", "4:00"
- Match quantities with numbers: Left="2 Candies", Right="2"
- ❌ BAD: Using "Cat", "Cat", "Cat" as separate reorder items
- ✅ GOOD: Using "3 Girls" as ONE reorder item

**QUALITY STANDARDS:**
- All option images must be same category (all animals, all shapes, etc.)
- Never reveal answers in question text or images
- Keep language simple and Filipino-focused
- Only use available stock images by exact name
- Better no image than wrong image`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
      
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
      
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!generatedText) {
        throw new Error('No content generated by AI');
      }
      
      
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
          
          // Enhanced helper function to check if image is relevant to question
          const isImageRelevant = (imgName: string, questionText: string, answerText?: string) => {
            const imgLower = imgName.toLowerCase();
            const questionLower = questionText.toLowerCase();
            const answerLower = answerText ? answerText.toLowerCase() : '';
            
            // Priority 1: Check if image name matches the answer exactly
            if (answerLower && imgLower === answerLower) return true;
            
            // Priority 2: Check for direct mentions in question
            const imgWords = imgLower.split(/\s+/);
            const questionWords = questionLower.split(/\s+/);
            if (imgWords.some(word => questionWords.includes(word))) return true;
            
            // Priority 3: Check for conceptual relevance
            
            // Animals & their products
            if (questionLower.includes('gatas') || questionLower.includes('milk')) {
              return imgLower.includes('cow') || imgLower.includes('goat') || imgLower.includes('baka');
            }
            
            // Colors - match by color words
            const colorWords = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'pula', 'asul', 'berde', 'dilaw', 'kahel', 'lila', 'rosas'];
            if (questionLower.includes('kulay') || questionLower.includes('color')) {
              return colorWords.some(color => imgLower.includes(color));
            }
            
            // Shapes - exact shape matching
            const shapeWords = ['circle', 'square', 'triangle', 'rectangle', 'oval', 'bilog', 'parisukat', 'tatsulok', 'parihaba'];
            if (questionLower.includes('hugis') || questionLower.includes('shape')) {
              return shapeWords.some(shape => imgLower.includes(shape));
            }
            
            // Numbers - digit matching
            if (questionLower.includes('numero') || questionLower.includes('number') || questionLower.includes('bilang')) {
              return /\d/.test(imgLower) || imgLower.includes('number');
            }
            
            // Fruits & Vegetables
            const fruitWords = ['apple', 'banana', 'orange', 'grape', 'mango', 'mansanas', 'saging', 'dalandan', 'ubas', 'mangga'];
            if (questionLower.includes('prutas') || questionLower.includes('fruit')) {
              return fruitWords.some(fruit => imgLower.includes(fruit));
            }
            
            // Animals
            const animalWords = ['cat', 'dog', 'bird', 'fish', 'cow', 'pig', 'pusa', 'aso', 'ibon', 'isda', 'baka', 'baboy'];
            if (questionLower.includes('hayop') || questionLower.includes('animal')) {
              return animalWords.some(animal => imgLower.includes(animal));
            }
            
            // School supplies
            if (questionLower.includes('school') || questionLower.includes('paaralan') || questionLower.includes('gamit')) {
              return imgLower.includes('pencil') || imgLower.includes('book') || imgLower.includes('bag') || 
                     imgLower.includes('lapis') || imgLower.includes('libro') || imgLower.includes('bag');
            }
            
            // Patterns & sequences
            if (questionLower.includes('pattern') || questionLower.includes('sunod') || 
                questionLower.includes('next') || questionLower.includes('susunod') ||
                questionLower.includes('sequence') || questionLower.includes('order') ||
                questionLower.includes('ayusin')) {
              // For patterns, numbers and shapes are most relevant
              return /\d/.test(imgLower) || shapeWords.some(shape => imgLower.includes(shape));
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
              
              // Process optionImages if provided by AI
              if (q.optionImages && Array.isArray(q.optionImages)) {
                optionImages = q.optionImages.map((imgName: string) => {
                  // Clean image name (remove any folder prefixes like "Fruits and Vegetables: Banana")
                  const cleanName = imgName.split(':').pop()?.trim() || imgName;
                  return findStockImageByName(cleanName);
                });
              } else {
                // Fallback: try to find images from option text
                optionImages = q.options.map((opt: any) => {
                  const imageName = String(opt).trim();
                  return findStockImageByName(imageName);
                });
              }
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
            // Process pairs with image support
            let processedPairs = undefined;
            if (q.pairs && Array.isArray(q.pairs)) {
              processedPairs = q.pairs.map((pair: any) => {
                // Clean image names (remove any folder prefixes)
                const cleanLeftImage = pair.leftImage ? pair.leftImage.split(':').pop()?.trim() : null;
                const cleanRightImage = pair.rightImage ? pair.rightImage.split(':').pop()?.trim() : null;
                
                return {
                  left: pair.left?.trim() || '',
                  right: pair.right?.trim() || '',
                  leftImage: cleanLeftImage ? findStockImageByName(cleanLeftImage) : null,
                  rightImage: cleanRightImage ? findStockImageByName(cleanRightImage) : null
                };
              });
            }

            processedQuestion = {
              ...processedQuestion,
              answer: Array.isArray(q.answer) ? q.answer : [],
              pairs: processedPairs
            };
            break;

          case 're-order':
            // Process reorder items with safety checks
            let processedReorderItems = undefined;
            
            if (q.reorderItems && Array.isArray(q.reorderItems) && q.reorderItems.length > 0) {
              processedReorderItems = q.reorderItems.map((item: any, idx: number) => {
                // Clean image names (remove any folder prefixes)
                let imageUrl = undefined;
                if (item.imageUrl) {
                  const cleanName = item.imageUrl.split(':').pop()?.trim() || item.imageUrl;
                  imageUrl = findStockImageByName(cleanName);
                } else if (item.type === 'image' && item.content) {
                  const cleanName = item.content.split(':').pop()?.trim() || item.content;
                  imageUrl = findStockImageByName(cleanName);
                }
                
                return {
                  id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
                  type: item.type || 'text',
                  content: item.content?.trim() || '',
                  imageUrl: imageUrl
                };
              });
            } else if (q.answer && Array.isArray(q.answer) && q.answer.length > 0) {
              // Fallback: Create reorderItems from answer array if reorderItems not provided
              processedReorderItems = q.answer.map((answerItem: string, idx: number) => ({
                id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'text' as const,
                content: String(answerItem).trim(),
              }));
            }

            // Ensure items are properly sorted according to answer array (which should be in correct order)
            const reorderDirection = q.reorderDirection || 'asc';
            const answerArray = Array.isArray(q.answer) ? q.answer : [];
            
            // If we have both reorderItems and answer array, order reorderItems to match answer array
            let finalReorderItems = processedReorderItems || [];
            if (answerArray.length > 0 && finalReorderItems.length > 0) {
              // Create a map of items by content
              const itemsMap = new Map<string, ReorderItem>(
                finalReorderItems.map((item: ReorderItem) => [item.content, item])
              );
              
              // Reorder items to match answer array order
              finalReorderItems = answerArray
                .map((answerItem: string) => itemsMap.get(String(answerItem)))
                .filter((item: ReorderItem | undefined): item is ReorderItem => item !== undefined);
              
              // Add any items not in answer array at the end
              const allMapValues = Array.from(itemsMap.values()) as ReorderItem[];
              finalReorderItems.push(
                ...allMapValues.filter(
                  (item: ReorderItem) => !answerArray.includes(item.content)
                )
              );
            }

            processedQuestion = {
              ...processedQuestion,
              answer: answerArray,
              reorderItems: finalReorderItems,
              reorderDirection: reorderDirection
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
        let questionImages = undefined;

        // Process questionImages if provided (NEVER use questionImage field)
        if (q.questionImages && Array.isArray(q.questionImages) && q.questionImages.length > 0) {
          questionImages = q.questionImages.map((imgRef: string) => {
            // Clean image name (remove any folder prefixes like "Fruits and Vegetables: Banana")
            const cleanName = imgRef.split(':').pop()?.trim() || imgRef;
            return findStockImageByName(cleanName);
          }).filter(Boolean);
        }

        // AI should provide questionImages - we don't auto-add anymore to prevent answer leakage
        // This section is now intentionally minimal to respect the AI's image choices

        // Quantity-based multi-visualization (e.g., "There are 5 apples")
        // If the question implies multiple instances of the same object, create multiple images to visualize quantity
        if (!questionImages) {
          const numberWords: Record<string, number> = {
            'zero': 0, 'none': 0,
            'one': 1, 'isa': 1,
            'two': 2, 'dalawa': 2,
            'three': 3, 'tatlo': 3,
            'four': 4, 'apat': 4,
            'five': 5, 'lima': 5,
            'six': 6, 'anim': 6,
            'seven': 7, 'pito': 7,
            'eight': 8, 'walo': 8,
            'nine': 9, 'siyam': 9,
            'ten': 10, 'sampu': 10
          };

          const translations: Record<string, string> = {
            // Filipino to English common classroom nouns present in stock images
            'mansanas': 'Apple',
            'saging': 'Banana',
            'ubas': 'Grapes',
            'pakwan': 'Watermelon',
            'peras': 'Pear',
            'pusa': 'Cat',
            'aso': 'Dog',
            'isda': 'Fish',
            'ibon': 'Bird',
            'bituin': 'Star',
            'bola': 'Ball',
          };

          const rawText = q.question.trim();
          const lowerText = rawText.toLowerCase();

          // Try to extract a quantity (digit or word) and a noun near it
          let qty: number | null = null;
          // 1) digits pattern e.g., "5 apples" or "apples 5"
          const digitMatch = lowerText.match(/(\b\d{1,2}\b)\s+([a-zñáéíóúü]+)|([a-zñáéíóúü]+)\s+(\b\d{1,2}\b)/i);
          if (digitMatch) {
            qty = parseInt(digitMatch[1] || digitMatch[4], 10);
          }
          // 2) number words pattern e.g., "five apples" or "lima na mansanas"
          if (qty == null) {
            const words = lowerText.split(/[^a-zñáéíóúü]+/i).filter(Boolean);
            const idx = words.findIndex((w: string) => w in numberWords);
            if (idx !== -1) {
              qty = numberWords[words[idx]];
            }
          }

          // Only proceed for small quantities where visual repetition makes sense
          if (qty != null && qty > 1 && qty <= 12) {
            // Heuristically pick a noun token near the number
            let nounCandidate = '';
            if (digitMatch) {
              nounCandidate = (digitMatch[2] || digitMatch[3] || '').trim();
            } else {
              // fallback: next token after the number word
              const words = lowerText.split(/[^a-zñáéíóúü]+/i).filter(Boolean);
              const idx = words.findIndex((w: string) => w in numberWords);
              nounCandidate = idx !== -1 && idx + 1 < words.length ? words[idx + 1] : '';
            }

            // Normalize plural/singular
            const normalize = (w: string) => {
              if (!w) return w;
              if (w.endsWith('es')) return w.slice(0, -2);
              if (w.endsWith('s')) return w.slice(0, -1);
              return w;
            };

            const englishCandidate = translations[nounCandidate] || nounCandidate;
            const normalized = normalize(englishCandidate);

            // Try several name variants to find a stock image
            const candidates = [
              normalized,
              englishCandidate,
              normalized.charAt(0).toUpperCase() + normalized.slice(1),
              englishCandidate.charAt(0).toUpperCase() + englishCandidate.slice(1)
            ].filter(Boolean);

            let baseImageUri: string | null = null;
            for (const name of candidates) {
              const uri = findStockImageByName(name);
              if (uri) {
                baseImageUri = uri;
                break;
              }
            }

            if (baseImageUri) {
              // Build repeated images to visualize the quantity
              const maxRepeat = Math.min(qty, 12);
              questionImages = Array.from({ length: maxRepeat }, () => baseImageUri);
              console.log(`📊 Auto-generated multi-visualization: ${maxRepeat} x "${normalized}" for question: ${q.question.substring(0, 50)}...`);
            }
          }
        }

        const finalQuestion = {
          ...processedQuestion,
          questionImages: questionImages
        };

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
      
      // Check if AI TTS generation is enabled
      if (!generateAITTS) {
        console.log('AI TTS generation skipped - toggle is off');
        showCustomAlert('Success', `${newQuestions.length} questions generated successfully! You can record voice or generate TTS individually for each question.`);
        setShowAIGenerator(false);
        setAiPrompt('');
        setIsGeneratingQuestions(false);
        return;
      }
      
      // Generate TTS audio for all new questions sequentially to avoid rate limits
      setIsGeneratingTTS(true);
      
      // TTS generation will run in background without blocking modal
      
      // Process questions in batches of 2 using the same API key, then randomly select next key
      const processTTSSequentially = async () => {
        // Initialize progress tracking
        setTtsProgress({ current: 0, total: newQuestions.length });
        setTtsUploadProgress({ current: 0, total: newQuestions.length });
        setTtsUploadStatus('Starting TTS generation...');
        setShowTTSProgressModal(true);
        setTtsProcessStartTime(Date.now());

        // Get initial random API key
        const firstKey = await getRandomApiKey();
        let currentApiKey = firstKey || null;
        if (!currentApiKey) {
          throw new Error('No active API keys available for TTS processing');
        }
        
        let requestsWithCurrentKey = 0;
        const REQUESTS_PER_KEY = 2;
        const MAX_RETRIES_PER_QUESTION = 3; // Limit retries per question
        const REQUEST_TIMEOUT = 30000; // 30 second timeout per request
        
        
        let firstFailureIndex: number | null = null;

        for (let i = 0; i < newQuestions.length; i++) {
          const question = newQuestions[i];
          
          try {
            
            // Update progress - simplified to prevent freezing
            const current = i + 1;
            const total = newQuestions.length;
            setTtsProgress({ current, total });
            setTtsUploadProgress({ current, total });
            setTtsUploadStatus(`Generating TTS audio ${current} of ${total}...`);
            
            // Add delay between requests to prevent rate limiting and allow UI updates
            if (i > 0) {
              const delay = 1000 + Math.random() * 1000; // 1-2 seconds random delay
              // setTtsUploadStatus(`Waiting ${Math.round(delay/1000)}s before next request...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Allow UI to update by yielding control - increased delay
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Preprocess the question text for TTS (enhanced version)
            const processedText = await preprocessTextForTTS(question.question);
            
            // Generate TTS audio using the current API key with timeout and retry
            let audioData = null;
            let retryCount = 0;
            let skipQuestion = false; // Flag to skip this question entirely
            
            while (!audioData && retryCount < MAX_RETRIES_PER_QUESTION && !skipQuestion) {
              try {
                
                // Create a timeout promise
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('TTS request timeout')), REQUEST_TIMEOUT)
                );
                
                // Race between TTS generation and timeout
                audioData = await Promise.race([
                  generateTTSForAIWithKey(processedText, question.id, currentApiKey),
                  timeoutPromise
                ]);
                
                if (audioData && typeof audioData === 'string') {
                  break;
                }
              } catch (error: any) {
                retryCount++;
                console.warn(`⚠️ TTS attempt ${retryCount} failed for question ${i + 1}:`, error);
                
                // Check if it's an unusual activity error - skip to next question immediately
                if (error?.message?.includes('UNUSUAL_ACTIVITY_DETECTED')) {
                  // Mark this question as failed TTS
                  setFailedTTSQuestions(prev => new Set([...prev, question.id]));
                  // Mark the problematic API key as failed (keep in database)
                  await markApiKeyAsFailed(currentApiKey);
                  // Try to get a different API key for the next question
                  const newApiKey = await getRandomApiKey();
                  if (newApiKey && newApiKey !== currentApiKey) {
                    currentApiKey = newApiKey;
                    requestsWithCurrentKey = 0;
                  }
                  // Add a longer delay to avoid triggering more suspicious activity
                  await new Promise(resolve => setTimeout(resolve, 10000));
                  skipQuestion = true; // Set flag to skip this question entirely
                  break; // Exit the retry loop
                }
                
                // Check if it's a quota exceeded error - skip to next question immediately
                if (error?.message?.includes('QUOTA_EXCEEDED')) {
                  // Mark this question as failed TTS
                  setFailedTTSQuestions(prev => new Set([...prev, question.id]));
                  // Try to get a different API key for the next question
                  const newApiKey = await getRandomApiKey();
                  if (newApiKey && newApiKey !== currentApiKey) {
                    currentApiKey = newApiKey;
                    requestsWithCurrentKey = 0;
                  }
                  // Add a delay to avoid rapid switching
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  skipQuestion = true; // Set flag to skip this question entirely
                  break; // Exit the retry loop
                }
                
                if (retryCount < MAX_RETRIES_PER_QUESTION) {
                  const retryDelay = 2000 * retryCount; // Exponential backoff
                  // setTtsUploadStatus(`Retrying TTS for question ${i + 1} (attempt ${retryCount + 1}/${MAX_RETRIES_PER_QUESTION})...`);
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                } else {
                  console.error(`❌ All TTS attempts failed for question ${i + 1}`);
                  // setTtsUploadStatus(`Failed to generate TTS for question ${i + 1} after ${MAX_RETRIES_PER_QUESTION} attempts`);
                }
              }
            }
            
            
            // Skip TTS processing if unusual activity was detected
            if (skipQuestion) {
              continue; // Skip to next question
            }
            
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
              
            } else {
              console.warn(`⚠️ No audio data returned for question: ${question.id}`);
              if (firstFailureIndex === null) firstFailureIndex = i;
            }
            
            // Increment request counter for current key
            requestsWithCurrentKey++;
            
            // Check if we need to switch to a new API key
            if (requestsWithCurrentKey >= REQUESTS_PER_KEY && i < newQuestions.length - 1) {
              // Get a new random API key
              const newApiKey = await getRandomApiKey();
              if (newApiKey && newApiKey !== currentApiKey) {
                currentApiKey = newApiKey;
                requestsWithCurrentKey = 0;
                console.log(`🔄 Switching to new API key: ${currentApiKey.substring(0, 10)}... for next batch`);
              } else {
                // If no different key available, reset counter to reuse current key
                requestsWithCurrentKey = 0;
                console.log(`🔄 Reusing current API key: ${currentApiKey.substring(0, 10)}... for next batch`);
              }
            }
            
          } catch (error: any) {
            console.error(`❌ Error processing TTS for question ${question.id}:`, error);
            
            // Check if it's an unusual activity error - skip to next question
            const errorMessage = error?.message || error?.toString() || '';
            if (errorMessage.includes('UNUSUAL_ACTIVITY_DETECTED')) {
              console.log(`🚫 Unusual activity detected for question ${question.id} - skipping to next question`);
              // Mark this question as failed TTS
              setFailedTTSQuestions(prev => new Set([...prev, question.id]));
              // Mark the problematic API key as failed (keep in database)
              await markApiKeyAsFailed(currentApiKey);
              // Try to get a different API key for the next question
              const newApiKey = await getRandomApiKey();
              if (newApiKey && newApiKey !== currentApiKey) {
                currentApiKey = newApiKey;
                requestsWithCurrentKey = 0;
                console.log(`🔄 Switching to new API key: ${currentApiKey.substring(0, 10)}... due to unusual activity`);
              }
              // Add a longer delay to avoid triggering more suspicious activity
              console.log(`⏳ Adding 10-second delay to avoid triggering more suspicious activity...`);
              await new Promise(resolve => setTimeout(resolve, 10000));
              continue; // Skip to next question
            }
            
            // Check if it's a quota exceeded error - skip to next question
            if (errorMessage.includes('QUOTA_EXCEEDED')) {
              console.log(`💰 Quota exceeded for question ${question.id} - skipping to next question`);
              // Mark this question as failed TTS
              setFailedTTSQuestions(prev => new Set([...prev, question.id]));
              // Try to get a different API key for the next question
              const newApiKey = await getRandomApiKey();
              if (newApiKey && newApiKey !== currentApiKey) {
                currentApiKey = newApiKey;
                requestsWithCurrentKey = 0;
                console.log(`🔄 Switching to new API key: ${currentApiKey.substring(0, 10)}... due to quota exceeded`);
              }
              // Add a delay to avoid rapid switching
              console.log(`⏳ Adding 5-second delay due to quota exceeded...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue; // Skip to next question
            }
            
            // Check if it's a rate limiting error
            const isRateLimitError = errorMessage.includes('rate_limit') || 
                                   errorMessage.includes('too_many_requests');
            
            if (isRateLimitError) {
              console.log(`🚫 Rate limit detected for question ${question.id}. Adding longer delay...`);
              
              // Add longer delay for rate limit errors
              const extendedDelay = 5000 + Math.random() * 3000; // 5-8 seconds
              console.log(`⏳ Extended delay: ${Math.round(extendedDelay)}ms due to rate limiting...`);
              await new Promise(resolve => setTimeout(resolve, extendedDelay));
              
              // Try to get a different API key
              const newApiKey = await getRandomApiKey();
              if (newApiKey && newApiKey !== currentApiKey) {
                currentApiKey = newApiKey;
                requestsWithCurrentKey = 0;
                console.log(`🔄 Switching to new API key: ${currentApiKey.substring(0, 10)}... due to rate limiting`);
                
                // Retry the same question with new key
                i--; // Decrement to retry the same question
                continue;
              }
            }
            
            // If current key fails, try to switch to another key
            const newApiKey = await getRandomApiKey();
            if (newApiKey && newApiKey !== currentApiKey) {
              currentApiKey = newApiKey;
              requestsWithCurrentKey = 0;
            } else {
              // Reset counter to retry with current key
              requestsWithCurrentKey = 0;
            }
          }
        }
        
        setTtsUploadStatus('TTS generation completed successfully!');

        // If we failed at or before 25% progress, guide the user to record voice instead of waiting
        if (firstFailureIndex !== null) {
          const progressFraction = (firstFailureIndex + 1) / Math.max(newQuestions.length, 1);
          if (progressFraction <= 0.25) {
            setTimeout(() => {
              showCustomAlert(
                'TTS Currently Unavailable',
                'TTS failed early in the batch. Please consider recording your voice for these questions using the mic button. You can retry TTS later when the service is stable.'
              );
              // Ensure save buttons are enabled by clearing TTS generation state
              setIsGeneratingTTS(false);
              setTtsProgress({ current: 0, total: 0 });
              setTtsProcessStartTime(null);
            }, 400);
          }
        }
        
        // Close progress modal after a short delay
        setTimeout(() => {
          setShowTTSProgressModal(false);
        }, 1500);
        
        setIsGeneratingTTS(false);
        setTtsProgress({ current: 0, total: 0 }); // Reset progress
        setTtsProcessStartTime(null); // Reset process start time
      };
      
      // Start sequential processing (don't await to keep UI responsive)
      setTtsGenerationStartTime(Date.now());
      processTTSSequentially().catch((error) => {
        console.error('Sequential TTS generation failed:', error);
        setShowTTSProgressModal(false);
        setIsGeneratingTTS(false);
        setTtsProgress({ current: 0, total: 0 });
        setTtsProcessStartTime(null);
        showCustomAlert('TTS Generation Error', 'Failed to generate audio for some questions. You can regenerate them individually.');
      });
      
      // Success - questions generated, TTS will run in background
      setShowAIGenerator(false);
      setAiPrompt('');

    } catch (error) {
      console.error('Error generating AI questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showCustomAlert('Error', `Failed to generate questions: ${errorMessage}`);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // TTS Preprocessing Function - Direct Gemini API call
  const preprocessTextForTTS = async (text: string): Promise<string> => {
    try {
      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";
      const prompt = `Enhance this text for Text-to-Speech by improving punctuation and rhythm for natural speech delivery.

      Rules:
      1. Do NOT add any stage directions, emotions, or parentheses.
      2. Add proper punctuation for natural pauses and storytelling flow.
      3. Make it sound lively, like a cheerful Grade 1 teacher or storyteller.
      4. Keep the original language (about 90% Filipino, 10% English mix).
      5. Maintain natural expressions suited for young learners.
      6. Do NOT include “Ok class” since this will play per student.
      7. Do NOT reveal answers — give hints only.
      8. Avoid using too many English words. Prioritize simple Filipino that’s easy for Grade 1 pupils.
      
      Original text: "${text}"
      
      Enhanced text:`;
      

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
      showCustomAlert('Error', 'Please enter some text to convert to speech');
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
      const selectedText = await new Promise<string | null>((resolve) => {
        showTextReviewModal(
          '', // No original text needed
          processedText,
          undefined, // No original text callback
          (selectedText) => {
            // Use selected processed text (may have been edited)
            hideTextReviewModal();
            resolve(selectedText);
          },
          () => {
            // Cancel
            hideTextReviewModal();
            resolve(null);
          }
        );
      });
      
      if (!selectedText) {
        setIsGeneratingTTS(false);
        return;
      }
      
      // Use selected text for TTS generation
      const finalTextForTTS = selectedText;


      // Step 2: Prepare request payload with final text and validated parameters
      const requestPayload: any = {
        text: finalTextForTTS,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          speed: 0.8,
          stability: 0.5,
          similarity_boost: 0.75,
        },
        language_code: 'fil'
      };

      // Step 3: ElevenLabs API call with multiple API key fallback
      const elevenLabsStart = Date.now();
      
      try {
        const result = await callElevenLabsWithFallback(
          finalTextForTTS,
          'jBpfuIE2acCO8z3wKNLl',
          true, // useV3
          'mp3_44100_128'
        );

        // Check if result is null (IP ban detected)
        if (!result) {
          console.log('🚫 TTS generation cancelled due to IP ban');
          showCustomAlert(
            'Network Access Restricted',
            'Your IP address has been detected doing unusual activity. Please try using a different WiFi network or switch to mobile data, then try again.',
            [{ text: 'OK' }]
          );
          return;
        }

      performanceLog.steps.elevenLabs = Date.now() - elevenLabsStart;
        performanceLog.steps.elevenLabsDetails = result.performanceLog;

      // Convert response to base64 for React Native
        const audioBlob = result.audioBlob;
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        
        // Save audio locally
        if (editingQuestion) {
          try {
            const base64Audio = base64data.split(',')[1];
            const localUri = await saveTTSAudioLocally(base64Audio, editingQuestion.id);
            
            const ttsAudioData = {
              questionId: editingQuestion.id,
              localUri,
              base64Data: base64Audio
            };
            
            console.log('🎵 TTS now pending for upload for question:', editingQuestion.id);
            setLocalTTSAudio(ttsAudioData);
            setPendingTTSUploads(prev => {
              const filtered = prev.filter(p => p.questionId !== editingQuestion.id);
              const updated = [...filtered, ttsAudioData];
              console.log('🎵 Pending uploads updated, count:', updated.length);
              return updated;
            });
            
            // Clear failed TTS tracking for this question since TTS was successful
            setFailedTTSQuestions(prev => {
              const newSet = new Set(prev);
              newSet.delete(editingQuestion.id);
              return newSet;
            });
          } catch (saveError) {
            console.error('❌ Failed to save TTS audio locally:', saveError);
            showCustomAlert('Save Error', 'Audio generated but failed to save locally. Please try again.');
            return;
          }
        } else {
          // If no editingQuestion, we still need to save the audio for the current question being worked on
          // This handles cases where TTS is generated outside of the question editor
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
      
      // Track failure for editing question if applicable
      if (editingQuestion) {
        setFailedTTSQuestions(prev => new Set([...prev, editingQuestion.id]));
      }
      
      showCustomAlert('Error', 'Failed to generate speech. Please try again.');
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

      // Prepare request payload
      const requestPayload: any = {
        text: processedText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          speed: 0.8,
          stability: 0.5,
          similarity_boost: 0.75,
        },
        language_code: 'fil'
      };

      // ElevenLabs API call with multiple API key fallback
      try {
        const result = await callElevenLabsWithFallback(
          processedText,
          'jBpfuIE2acCO8z3wKNLl',
          true, // useV3
          'mp3_44100_128'
        );

        // Check if result is null (IP ban detected)
        if (!result) {
          console.log('🚫 AI TTS generation cancelled due to IP ban');
          showCustomAlert(
            'Network Access Restricted',
            'Your IP address has been detected doing unusual activity. Please try using a different WiFi network or switch to mobile data, then try again.',
            [{ text: 'OK' }]
          );
          return null;
        }
        

      // Process successful response
        const audioBlob = result.audioBlob;
      const reader = new FileReader();
      
      return new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const base64Audio = base64data.split(',')[1];
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

  // TTS function for AI-generated questions with specific API key
  const generateTTSForAIWithKey = async (processedText: string, questionId: string, apiKey: string): Promise<string | null> => {
    if (!processedText.trim()) {
      console.error('No text provided for AI TTS generation');
      return null;
    }

    console.log('🎤 AI TTS Generation Started for question:', questionId, 'with API key:', apiKey);

    const startTime = Date.now();

    try {

      // Prepare request payload
      const requestPayload: any = {
        text: processedText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          speed: 0.8,
          stability: 0.5,
          similarity_boost: 0.75,
        },
        language_code: 'fil'
      };

      // ElevenLabs API call with specific API key
      try {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/jBpfuIE2acCO8z3wKNLl?output_format=mp3_44100_128`;
        
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
          const ttsTimeMs = Date.now() - startTime;
          console.log('✅ TTS Generation Successful for Question:', questionId, `(${ttsTimeMs}ms)`);
          const audioBlob = await response.blob();

          // Mark API key as used for this individual TTS generation
          await markApiKeyAsUsed(apiKey, ttsTimeMs);

          // Process successful response
          const reader = new FileReader();
          
          return new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const base64data = reader.result as string;
              const base64Audio = base64data.split(',')[1];
              resolve(base64Audio);
            };
            reader.onerror = () => reject(new Error('Failed to read audio blob'));
            reader.readAsDataURL(audioBlob);
          });
        } else {
          const errorText = await response.text();
          console.error(`❌ ElevenLabs API failed with key ${apiKey.substring(0, 10)}...:`, response.status, errorText);
          
          // Check for unusual activity error - this should stop all retries
          if (errorText.includes('detected_unusual_activity') || 
              errorText.includes('Unusual activity detected') ||
              errorText.includes('Free Tier usage disabled')) {
            console.log(`🚫 Unusual activity detected - stopping TTS generation for this question`);
            // Mark this API key as failed to prevent further use
            await markApiKeyAsFailed(apiKey);
            // Return a special error that indicates we should skip to next question
            throw new Error('UNUSUAL_ACTIVITY_DETECTED');
          }
          
          // Check for quota exceeded error - this should also stop retries
          if (errorText.includes('quota_exceeded') || 
              errorText.includes('exceeds your quota') ||
              errorText.includes('credits remaining')) {
            console.log(`💰 Quota exceeded detected - stopping TTS generation for this question`);
            
            // Extract credits remaining from error message
            const creditsMatch = errorText.match(/(\d+)\s+credits\s+remaining/);
            if (creditsMatch) {
              const creditsRemaining = parseInt(creditsMatch[1]);
              console.log(`📊 Recording credits remaining: ${creditsRemaining} for key ${apiKey.substring(0, 10)}...`);
              await updateApiKeyCredits(apiKey, creditsRemaining);
            }
            
            // Mark this API key as failed to prevent further use
            await markApiKeyAsFailed(apiKey);
            // Return a special error that indicates we should skip to next question
            throw new Error('QUOTA_EXCEEDED');
          }
          
          throw new Error(`API call failed: ${response.status} - ${errorText}`);
        }
        
      } catch (apiError: any) {
        console.error('❌ ElevenLabs API call failed for AI TTS:', apiError);
        throw new Error(`AI TTS Generation failed: ${apiError.message}`);
      }

    } catch (error) {
      console.error('❌ AI TTS Generation Error:', error);
      // Track this question as having failed TTS
      setFailedTTSQuestions(prev => new Set([...prev, questionId]));
      return null;
    }
  };

  // Function to identify questions with failed TTS
  const getFailedTTSQuestions = (): Question[] => {
    return questions.filter(question => {
      // Check if this question is in the failed TTS set
      const isMainQuestionFailed = failedTTSQuestions.has(question.id);
      
      // Check sub-questions
      const hasFailedSubQuestions = question.subQuestions?.some(sub => {
        return failedTTSQuestions.has(sub.id);
      });
      
      return isMainQuestionFailed || hasFailedSubQuestions;
    });
  };

  // Function to retry all failed TTS generations
  const retryAllFailedTTS = async () => {
    const failedQuestions = getFailedTTSQuestions();
    
    if (failedQuestions.length === 0) {
      showCustomAlert('No Failed TTS', 'All questions have TTS audio generated successfully!');
      return;
    }

    setIsRetryingFailedTTS(true);
    setTtsProgress({ current: 0, total: failedQuestions.length });
    setShowTTSProgressModal(true);
    setTtsUploadStatus('Retrying failed TTS generations...');
    setTtsProcessStartTime(Date.now());

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < failedQuestions.length; i++) {
        const question = failedQuestions[i];
        setTtsProgress({ current: i + 1, total: failedQuestions.length });
        setTtsUploadStatus(`Retrying TTS for question ${i + 1} of ${failedQuestions.length}...`);

        // Allow UI to update by yielding control - increased delay
        await new Promise(resolve => setTimeout(resolve, 200));

        try {
          // Retry main question TTS with timeout
          if (!question.ttsAudioUrl || question.ttsAudioUrl === 'pending') {
            const ttsUrl = await Promise.race([
              generateTTSForAI(question.question, question.id),
              new Promise<null>((_, reject) => 
                setTimeout(() => reject(new Error('TTS retry timeout')), 30000)
              )
            ]).catch(() => null);
            if (ttsUrl) {
              updateQuestion(question.id, { ttsAudioUrl: ttsUrl });
              // Clear failed TTS tracking for this question since TTS was successful
              setFailedTTSQuestions(prev => {
                const newSet = new Set(prev);
                newSet.delete(question.id);
                return newSet;
              });
              successCount++;
            } else {
              failCount++;
              setFailedTTSQuestions(prev => new Set([...prev, question.id]));
            }
          }

          // Retry sub-questions TTS
          if (question.subQuestions) {
            for (const sub of question.subQuestions) {
              if (!sub.ttsAudioUrl || sub.ttsAudioUrl === 'pending') {
                const subTtsUrl = await Promise.race([
                  generateTTSForAI(sub.question, sub.id),
                  new Promise<null>((_, reject) => 
                    setTimeout(() => reject(new Error('Sub-question TTS retry timeout')), 30000)
                  )
                ]).catch(() => null);
                if (subTtsUrl) {
                  const updatedSubQuestions = question.subQuestions.map(s => 
                    s.id === sub.id ? { ...s, ttsAudioUrl: subTtsUrl } : s
                  );
                  updateQuestion(question.id, { subQuestions: updatedSubQuestions });
                  // Clear failed TTS tracking for this sub-question since TTS was successful
                  setFailedTTSQuestions(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(sub.id);
                    return newSet;
                  });
                  successCount++;
                } else {
                  failCount++;
                  setFailedTTSQuestions(prev => new Set([...prev, sub.id]));
                }
              }
            }
          }
        } catch (error) {
          console.error(`Failed to retry TTS for question ${question.id}:`, error);
          failCount++;
          setFailedTTSQuestions(prev => new Set([...prev, question.id]));
        }
      }

      setTtsUploadStatus(`Retry completed! ${successCount} successful, ${failCount} failed.`);
      
      // Close progress modal after a short delay
      setTimeout(() => {
        setShowTTSProgressModal(false);
      }, 2000);

    } catch (error) {
      console.error('Error retrying failed TTS:', error);
      setTtsUploadStatus('Error occurred while retrying TTS generations.');
      setTimeout(() => {
        setShowTTSProgressModal(false);
      }, 2000);
    } finally {
      setIsRetryingFailedTTS(false);
      setTtsProgress({ current: 0, total: 0 });
      setTtsProcessStartTime(null);
    }
  };

  // AI Improve function for exercise title and description
  const improveExerciseDetails = async () => {
    if (!exerciseTitle.trim() && !exerciseDescription.trim()) {
      setImproveError('Please enter a title or description to improve');
      return;
    }

    setIsImprovingDescription(true);
    setImproveError(null);

    try {
      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";
      
      const prompt = `You are an expert educational content writer for Grade 1 students. Rewrite the following exercise title and description to make them engaging and appealing.

Current Title: "${exerciseTitle}"
Current Description: "${exerciseDescription}"

Requirements for TITLE:
- MAXIMUM 3 WORDS ONLY! This is critical!
- Make it fun, catchy, and witty for 6-7 year old children
- Use simple Filipino or English words that Grade 1 students love
- Think playful, exciting, and child-friendly (e.g., "Bilang Fun!", "Shape Hunt", "Number Magic")
- NO complex words, NO long phrases
- Make kids excited to play!

Requirements for DESCRIPTION:
- **MAXIMUM 2-3 SENTENCES ONLY!** Keep it short and concise!
- Write a simple, clear description that explains what students will learn
- Use simple language that both teachers AND parents can easily understand
- Highlight the key learning objectives briefly
- NO complex educational jargon, NO long paragraphs
- Easy to digest and quick to read
- Examples: "Students practice counting from 1-10 with fun animal images." OR "Mag-aaral ng mga hugis at kulay gamit ang larawan."

Please respond with a JSON object in this exact format:
{
  "title": "Short 3-word title here",
  "description": "Short 2-3 sentence description here"
}`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
      
      const response = await fetch(apiUrl, {
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
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response from AI service');
      }

      const responseText = data.candidates[0].content.parts[0].text;
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse AI response');
      }

      const improvedData = JSON.parse(jsonMatch[0]);
      
      if (improvedData.title) {
        setExerciseTitle(improvedData.title);
      }
      if (improvedData.description) {
        setExerciseDescription(improvedData.description);
      }

    } catch (error) {
      console.error('Error improving exercise details:', error);
      setImproveError('Failed to improve description. Please try again.');
    } finally {
      setIsImprovingDescription(false);
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
      showCustomAlert('No Audio', 'Please generate speech first');
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
        
        if (status.isLoaded) {
          if (status.playing) {
            setIsPlayingTTS(true);
          } else if (status.didJustFinish) {
            setIsPlayingTTS(false);
            player.remove();
            setCurrentAudioPlayer(null);
          }
        } else if ('error' in status) {
          console.error('Audio loading error:', (status as any).error);
          showCustomAlert('Audio Error', 'Failed to load audio file');
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
          showCustomAlert('Playback Error', 'Failed to start audio playback');
          setIsPlayingTTS(false);
        }
      }, 100);
      
    } catch (error: any) {
      console.error('Playback Error:', error);
      showCustomAlert('Error', `Failed to play audio: ${error.message}`);
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

  // Voice Recording Functions
  const openRecordingModal = (questionId: string) => {
    setRecordingQuestionId(questionId);
    setRecordedAudioUri(null);
    setRecordingDuration(0);
    
    // Check if this question already has a recorded voice
    const question = questions.find(q => q.id === questionId);
    setHasPreviousRecording(!!question?.recordedTtsUrl);
    
    setShowRecordingModal(true);
  };

  const closeRecordingModal = () => {
    // Stop any ongoing recording or playback
    stopRecording(false);
    stopRecordingPlayback();
    setShowRecordingModal(false);
    setRecordingQuestionId(null);
    setRecordedAudioUri(null);
    setRecordingDuration(0);
    setHasPreviousRecording(false);
  };

  const startRecording = async () => {
    try {
      console.log('Requesting permissions...');
      const permission = await Audio.requestPermissionsAsync();
      
      if (permission.status !== 'granted') {
        showCustomAlert('Permission Required', 'Please enable microphone access to record audio.');
        return;
      }

      console.log('Setting up audio mode with noise cancellation...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('Starting recording with optimized compression...');
      // ULTRA-OPTIMIZED recording options for smallest file size while maintaining voice clarity
      // Optimized for voice recording: ~40-50 KB per minute (vs 960 KB/min at 128kbps)
      const recordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 22050, // Reduced from 44100 - sufficient for voice (saves ~50% size)
          numberOfChannels: 1, // Mono - essential for voice recording
          bitRate: 32000, // Reduced from 128000 - optimal for voice (saves 75% size)
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM, // Changed from HIGH for smaller size
          sampleRate: 22050, // Reduced from 44100
          numberOfChannels: 1, // Mono
          bitRate: 32000, // Reduced from 128000
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 32000, // Reduced from 128000
        },
      };

      const { recording: newRecording } = await Audio.Recording.createAsync(
        recordingOptions
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer with 2-minute limit
      const MAX_RECORDING_DURATION = 120; // 2 minutes in seconds
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          
          // Auto-stop at 2 minutes
          if (newDuration >= MAX_RECORDING_DURATION) {
            console.log('Maximum recording duration reached (2 minutes)');
            stopRecording(true); // Pass true to indicate auto-stop
            return MAX_RECORDING_DURATION;
          }
          
          // Warning at 1:45
          if (newDuration === 105) {
            console.log('15 seconds remaining...');
          }
          
          return newDuration;
        });
      }, 1000) as any;

      console.log('Recording started successfully (max 2 minutes)');
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      showCustomAlert('Recording Error', `Failed to start recording: ${error.message}`);
    }
  };

  const stopRecording = async (autoStopped: boolean = false) => {
    if (!recording) return;

    try {
      console.log('Stopping recording...');
      setIsRecording(false);
      
      // Clear timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedAudioUri(uri);
      setRecording(null);

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      console.log('Recording stopped, URI:', uri);
      
      // Show info message if auto-stopped at limit
      if (autoStopped) {
        setTimeout(() => {
          showCustomAlert('Recording Complete', 'Recording stopped at 2-minute limit. You can now save or re-record.');
        }, 500);
      }
    } catch (error: any) {
      console.error('Failed to stop recording:', error);
      showCustomAlert('Recording Error', `Failed to stop recording: ${error.message}`);
    }
  };

  const playRecording = async () => {
    if (!recordedAudioUri) return;

    try {
      console.log('Playing recording...');
      
      // Stop any existing playback
      if (recordingSound.current) {
        await recordingSound.current.unloadAsync();
        recordingSound.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: recordedAudioUri },
        { shouldPlay: true },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlayingRecording(false);
          }
        }
      );

      recordingSound.current = sound;
      setIsPlayingRecording(true);

      console.log('Playing recording...');
    } catch (error: any) {
      console.error('Failed to play recording:', error);
      showCustomAlert('Playback Error', `Failed to play recording: ${error.message}`);
    }
  };

  const stopRecordingPlayback = async () => {
    if (recordingSound.current) {
      await recordingSound.current.stopAsync();
      await recordingSound.current.unloadAsync();
      recordingSound.current = null;
      setIsPlayingRecording(false);
    }
  };

  const reRecord = () => {
    setRecordedAudioUri(null);
    setRecordingDuration(0);
    startRecording();
  };

  const saveRecordedVoice = async () => {
    if (!recordedAudioUri || !recordingQuestionId) return;

    try {
      setUploading(true);

      // Upload to Firebase Storage
      const fileName = `recorded-tts/${exerciseCode || 'temp'}/question-${recordingQuestionId}.m4a`;
      
      // Use fetch to read the file and create a proper blob (RN compatible)
      const response = await fetch(recordedAudioUri);
      const blob = await response.blob();

      // Upload file
      const uploadResult = await uploadFile(fileName, blob, { contentType: 'audio/m4a' });
      
      if (uploadResult.error || !uploadResult.downloadURL) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // Update question with recorded TTS URL
      updateQuestion(recordingQuestionId, {
        recordedTtsUrl: uploadResult.downloadURL,
        ttsStatus: 'ready'
      });

      console.log('Recorded voice saved successfully:', uploadResult.downloadURL);
      showCustomAlert('Success', 'Voice recording saved successfully!');
      closeRecordingModal();
    } catch (error: any) {
      console.error('Failed to save recorded voice:', error);
      showCustomAlert('Upload Error', `Failed to save recording: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const deletePreviousRecording = () => {
    if (!recordingQuestionId) return;

    showCustomAlert(
      'Delete Recording',
      'Are you sure you want to delete the previous voice recording? This will restore the AI-generated TTS (if available).',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Remove the recorded TTS URL from the question
            updateQuestion(recordingQuestionId, {
              recordedTtsUrl: undefined
            });
            
            setHasPreviousRecording(false);
            console.log('Previous recording deleted for question:', recordingQuestionId);
            showCustomAlert('Success', 'Previous voice recording deleted successfully!');
          }
        }
      ]
    );
  };

  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const deleteQuestion = (questionId: string) => {
    showCustomAlert(
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
      showCustomAlert('Error', 'Please enter an exercise title');
      return;
    }
    if (!exerciseCategory.trim()) {
      showCustomAlert('Error', 'Please select a category');
      return;
    }
    if (questions.length === 0) {
      showCustomAlert('Error', 'Please add at least one question');
      return;
    }
    
    // Note: Pending TTS uploads will be handled during the save process
    
    // Check if currently generating TTS
    if (isGeneratingTTS) {
      showCustomAlert(
        'TTS Generation In Progress', 
        'Please wait for text-to-speech generation to complete before saving the exercise.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Validate that all questions have content
    const incompleteQuestions = questions.filter(q => !q.question.trim());
    if (incompleteQuestions.length > 0) {
      showCustomAlert('Error', 'Please complete all questions before saving');
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
      showCustomAlert('Error', 'Please complete all multiple choice options and select a correct answer');
      return;
    }
    
    // Validate identification questions have answers
    const invalidIdentification = questions.filter(q => 
      q.type === 'identification' && !q.answer
    );
    if (invalidIdentification.length > 0) {
      showCustomAlert('Error', 'Please provide answers for all identification questions');
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
      showCustomAlert('Error', 'Please complete the reading passage and all sub-questions');
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
      
      // Show loading indicator and progress modal
      setUploading(true);
      setShowUploadProgressModal(true);
      setUploadProgress({ current: 0, total: 4 }); // 4 main steps: images, TTS, database, complete
      setUploadStatus('Starting exercise upload...');
      
      // Step 1: Upload local images to Firebase Storage
      console.log('Uploading local images to Firebase Storage...');
      setUploadProgress({ current: 1, total: 4 });
      setUploadStatus('Preparing images for upload...');
      const questionsWithRemoteImages = await uploadLocalImages(questions, finalExerciseCode);
      console.log('Local images uploaded successfully');
      setUploadStatus('Images uploaded successfully');
      
      // Step 2: Upload pending TTS audio files to Firebase Storage
      let finalQuestions = questions;
      console.log('🎵 Checking pending TTS uploads, count:', pendingTTSUploads.length);
      console.log('🎵 Pending uploads:', pendingTTSUploads.map(p => ({ questionId: p.questionId, hasBase64: !!p.base64Data })));
      
      if (pendingTTSUploads.length > 0) {
        console.log(`🎵 Uploading ${pendingTTSUploads.length} TTS audio files...`);
        setUploadProgress({ current: 2, total: 4 });
        setUploadStatus(`Uploading TTS audio files (${pendingTTSUploads.length} files)...`);
        
        // Show TTS progress modal
        setShowTTSProgressModal(true);
        setTtsUploadProgress({ current: 0, total: pendingTTSUploads.length });
        setTtsUploadStatus('Preparing TTS audio upload...');
        
        try {
          finalQuestions = await uploadPendingTTSAudio(finalExerciseCode, questions);
          console.log('✅ TTS audio files uploaded successfully');
          setTtsUploadStatus('TTS audio upload completed successfully!');
          
          // Close TTS progress modal after a short delay
          setTimeout(() => {
            setShowTTSProgressModal(false);
          }, 1500);
        } catch (ttsError) {
          console.error('❌ Failed to upload TTS audio files:', ttsError);
          setShowTTSProgressModal(false);
          setShowUploadProgressModal(false);
          showCustomAlert('Upload Error', 'Audio generated but failed to upload TTS audio to Firebase.');
          return; // Stop the save process if TTS upload fails
        }
      } else {
        console.log('ℹ️ No TTS audio files to upload');
        setUploadProgress({ current: 2, total: 4 });
        setUploadStatus('No TTS audio files to upload');
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
        exerciseCode: finalExerciseCode,
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
          
          if (q.recordedTtsUrl) {
            cleanQuestion.recordedTtsUrl = q.recordedTtsUrl;
          }
          
          if (q.ttsStatus) {
            cleanQuestion.ttsStatus = q.ttsStatus;
          }

          return cleanQuestion;
        }),
        isPublic: Boolean(isPublic),
        category: exerciseCategory,
        timeLimitPerItem: timeLimitPerItem,
        maxAttemptsPerItem: maxAttemptsPerItem,
        createdAt: new Date().toISOString(),
      };
      
      // Step 3: Prepare and save to database
      setUploadProgress({ current: 3, total: 4 });
      setUploadStatus('Preparing exercise data for database...');
      
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
      
      setUploadStatus('Saving exercise to database...');
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
        // Create new exercise with readable ID (EXERCISE-0001, EXERCISE-0002, etc.)
        console.log('[CreateExercise] Creating new exercise with readable ID...');
        
        const result = await createExercise({
          title: finalCleanPayload.title,
          description: finalCleanPayload.description,
          teacherId: finalCleanPayload.teacherId,
          teacherName: finalCleanPayload.teacherName,
          questions: finalCleanPayload.questions,
          resourceUrl: finalCleanPayload.resourceUrl,
          category: finalCleanPayload.category,
          timesUsed: finalCleanPayload.timesUsed,
          isPublic: finalCleanPayload.isPublic,
          timeLimitPerItem: finalCleanPayload.timeLimitPerItem,
          maxAttemptsPerItem: finalCleanPayload.maxAttemptsPerItem,
          exerciseCode: finalExerciseCode
        });
        
        key = result.exerciseId || null;
        error = result.error || null;
        
        if (result.success && key) {
          console.log(`[CreateExercise] Exercise created with ID: ${key}`);
        }
      }
      
      if (error || !key) {
        console.error('Firebase error:', error);
        setShowUploadProgressModal(false);
        
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
        
        showCustomAlert('Error', errorMessage);
        return;
      }
      
      // Step 4: Complete
      setUploadProgress({ current: 4, total: 4 });
      setUploadStatus('Exercise saved successfully!');
      
      console.log(`Exercise ${isEditing ? 'updated' : 'saved'} successfully with key:`, key);
      
      // Close progress modal and show success
      setTimeout(() => {
        setShowUploadProgressModal(false);
        showCustomAlert('Success', `Exercise ${isEditing ? 'updated' : 'created'} successfully!`, [
          { text: 'OK', onPress: () => router.push('/TeacherDashboard') }
        ]);
      }, 1000);
    } catch (error: any) {
      console.error('Error saving exercise:', error);
      setShowUploadProgressModal(false);
      
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
      
      showCustomAlert('Error', errorMessage);
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
      showCustomAlert('Error', 'Failed to pick a file');
    }
  };

  const uploadResourceFile = async (): Promise<string | null> => {
    if (!resourceFile) return null;
    try {
      setUploading(true);
      const fileInfo = await FileSystem.getInfoAsync(resourceFile.uri);
      if (!fileInfo.exists) {
        showCustomAlert('Error', 'Selected file not found');
        return null;
      }
      // If you want to upload to Firebase Storage, reuse uploadFile from lib/firebase-storage
      // For now we just return the local URI as placeholder
      return resourceFile.uri;
    } catch (e) {
      showCustomAlert('Error', 'Failed to upload file');
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

  const pickMultipleOptionImages = async (questionId: string, optionIndex: number) => {
    setImageLibraryContext({ questionId, optionIndex, type: 'multiple-option' });
    setShowImageLibrary(true);
    openModal('imageLibrary');
  };

  const removeMultipleOptionImage = (questionId: string, optionIndex: number, imageIndex: number) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    
    const currentImages = question.optionMultipleImages?.[optionIndex] || [];
    const newImages = currentImages.filter((_, idx) => idx !== imageIndex);
    
    const newOptionMultipleImages = [...(question.optionMultipleImages || [])];
    newOptionMultipleImages[optionIndex] = newImages.length > 0 ? newImages : null;
    
    updateQuestion(questionId, { optionMultipleImages: newOptionMultipleImages });
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
    } else if (type === 'multiple-option' && optionIndex !== undefined) {
      const q = questions.find((q) => q.id === questionId);
      if (!q) return;
      const currentImages = q.optionMultipleImages?.[optionIndex] || [];
      const newImages = [...currentImages, imageUri];
      const newOptionMultipleImages = [...(q.optionMultipleImages || [])];
      newOptionMultipleImages[optionIndex] = newImages;
      updateQuestion(questionId, { optionMultipleImages: newOptionMultipleImages });
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
          showCustomAlert('File Too Large', 'Image must be smaller than 10MB');
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
          showCustomAlert('Upload Failed', 'Failed to upload image to database');
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
      showCustomAlert('Upload Failed', 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      showCustomAlert('Error', 'Please enter a category name');
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
        showCustomAlert('Error', 'Failed to create category');
        return;
      }
      
      setCustomCategories(prev => ({
        ...prev,
        [newCategoryName.trim()]: []
      }));
      
      setNewCategoryName('');
      setShowAddCategory(false);
      showCustomAlert('Success', 'Category created successfully!');
    } catch (error) {
      showCustomAlert('Error', 'Failed to create category');
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

  const pickMultipleImagesFromDevice = async (questionId: string) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showCustomAlert('Permission Required', 'Please grant permission to access your photo library to add images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      // Upload all selected images to Firebase and add them to the question
      setUploadingImage(true);
      const uploadedUris: string[] = [];

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        try {
          const fileName = `exercise_question_${Date.now()}_${i}.jpg`;
          const storagePath = `exercise-images/${fileName}`;
          
          // Read the file and upload using the uploadFile helper
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          
          const { downloadURL, error } = await uploadFile(storagePath, blob, {
            contentType: 'image/jpeg',
          });
          
          if (error) {
            throw new Error(`Upload failed: ${error}`);
          }
          
          if (downloadURL) {
            uploadedUris.push(downloadURL);
          }
        } catch (error) {
          console.error(`Error uploading image ${i + 1}:`, error);
          showCustomAlert('Upload Error', `Failed to upload image ${i + 1} of ${result.assets.length}`);
        }
      }

      // Add all successfully uploaded images to the question
      const question = questions.find(q => q.id === questionId);
      if (question && uploadedUris.length > 0) {
        const currentImages = question.questionImages || [];
        updateQuestion(questionId, { 
          questionImages: [...currentImages, ...uploadedUris] 
        });
        showCustomAlert('Success', `Successfully added ${uploadedUris.length} image(s) to the question`);
      }

      setUploadingImage(false);
    } catch (error) {
      console.error('Error picking images:', error);
      showCustomAlert('Error', 'Failed to pick images. Please try again.');
      setUploadingImage(false);
    }
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

  const reorderQuestionImages = (questionId: string, newOrder: string[]) => {
    updateQuestion(questionId, { questionImages: newOrder });
  };

  // Render function for draggable question image items
  const renderQuestionImageItem = ({ item, drag, isActive, getIndex }: RenderItemParams<string>) => {
    const index = getIndex?.() ?? 0;
    const question = questions.find(q => q.id === editingQuestion?.id);
    if (!question || !question.questionImages) return null;

    return (
      <TouchableOpacity
        style={[
          styles.questionImageItemContainer,
          isActive && styles.questionImageItemActive
        ]}
        onLongPress={drag}
        disabled={isActive}
      >
        <View style={styles.questionImageItemContent}>
          <View style={styles.questionImageItemNumber}>
            <Text style={styles.questionImageItemNumberText}>{index + 1}</Text>
          </View>
          
          <View style={styles.questionImageThumbnailContainer}>
            <Image 
              source={{ uri: item }} 
              style={styles.questionImageThumbnail} 
              resizeMode="cover"
              loadingIndicatorSource={require('../assets/images/icon.png')}
            />
          </View>
          
          <View style={styles.questionImageItemActions}>
            <TouchableOpacity 
              onPress={() => removeQuestionImage(editingQuestion!.id, index)}
              style={styles.questionImageRemoveButton}
            >
              <MaterialCommunityIcons name="trash-can" size={16} color="#ef4444" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              onLongPress={drag}
              style={styles.questionImageDragHandle}
            >
              <MaterialCommunityIcons name="drag" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
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

  // Helper function to sort reorder items based on direction
  const sortReorderItems = (items: ReorderItem[], direction: 'asc' | 'desc' = 'asc'): ReorderItem[] => {
    if (!items || items.length === 0) return items;
    
    const sorted = [...items].sort((a, b) => {
      const aContent = a.content || '';
      const bContent = b.content || '';
      
      // Try to extract numeric values from currency strings (e.g., "20 PISO" -> 20)
      const extractNumericValue = (text: string): number => {
        // Match patterns like "20 PISO", "5 peso", "1 PISO", etc.
        const currencyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:PISO|peso|PESO)/i);
        if (currencyMatch) {
          return parseFloat(currencyMatch[1]);
        }
        
        // Try to parse as regular number
        const num = parseFloat(text);
        if (!isNaN(num)) {
          return num;
        }
        
        // Return a large number for non-numeric values to sort them last
        return Infinity;
      };
      
      const aNum = extractNumericValue(aContent);
      const bNum = extractNumericValue(bContent);
      
      // If both are valid numbers (including currency values)
      if (aNum !== Infinity && bNum !== Infinity) {
        return direction === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      // If one is a number and one isn't, numbers come first
      if (aNum !== Infinity && bNum === Infinity) {
        return -1;
      }
      if (aNum === Infinity && bNum !== Infinity) {
        return 1;
      }
      
      // Both are non-numeric, fall back to string comparison
      const comparison = aContent.localeCompare(bContent, 'en', { numeric: true, sensitivity: 'base' });
      return direction === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
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
      const updatedItems = [...currentItems, newItem];
      
      // Sort items based on current direction
      const sortedItems = sortReorderItems(updatedItems, question.reorderDirection || 'asc');
      
      // Update answer to match sorted order
      const answer = sortedItems.map(item => item.content).filter(Boolean);
      
      updateQuestion(questionId, { 
        reorderItems: sortedItems,
        answer: answer
      });
      
      // If it's an image item, automatically open the image picker
      if (type === 'image') {
        // Find the index of the new item after sorting
        const newItemIndex = sortedItems.findIndex(item => item.id === newItem.id);
        pickReorderItemImage(questionId, newItemIndex);
      }
    }
  };

  const updateReorderItem = (questionId: string, itemIndex: number, updates: Partial<ReorderItem>) => {
    const question = questions.find(q => q.id === questionId);
    if (question && question.reorderItems) {
      const newItems = [...question.reorderItems];
      newItems[itemIndex] = { ...newItems[itemIndex], ...updates };
      
      // Sort items based on current direction
      const sortedItems = sortReorderItems(newItems, question.reorderDirection || 'asc');
      
      // Update answer to match sorted order
      const answer = sortedItems.map(item => item.content).filter(Boolean);
      
      updateQuestion(questionId, { 
        reorderItems: sortedItems,
        answer: answer
      });
    }
  };

  const removeReorderItem = (questionId: string, itemIndex: number) => {
    const question = questions.find(q => q.id === questionId);
    if (question && question.reorderItems && question.reorderItems.length > 1) {
      const newItems = question.reorderItems.filter((_, index) => index !== itemIndex);
      
      // Sort items based on current direction
      const sortedItems = sortReorderItems(newItems, question.reorderDirection || 'asc');
      
      // Update answer to match sorted order
      const answer = sortedItems.map(item => item.content).filter(Boolean);
      
      updateQuestion(questionId, { 
        reorderItems: sortedItems,
        answer: answer
      });
    }
  };

  const pickReorderItemImage = async (questionId: string, itemIndex: number) => {
    setImageLibraryContext({ questionId, reorderItemIndex: itemIndex, type: 'reorder' });
    setShowImageLibrary(true);
    openModal('imageLibrary');
  };

  const reorderItems = (questionId: string, newItems: ReorderItem[]) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    
    // Update answer to match new order
    const answer = newItems.map(item => item.content).filter(Boolean);
    
    updateQuestion(questionId, { 
      reorderItems: newItems,
      answer: answer
    });
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
            
          <ScrollView 
            ref={questionEditorScrollRef}
            style={styles.fullScreenContent} 
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            bounces={true}
            contentContainerStyle={styles.fullScreenScrollContainer}
          >
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
                  
                  {/* Record Voice Button */}
                  <TouchableOpacity
                    style={[styles.ttsButton, styles.recordVoiceButton]}
                    onPress={() => openRecordingModal(editingQuestion.id)}
                    disabled={isGeneratingTTS}
                  >
                    <MaterialCommunityIcons 
                      name={editingQuestion.recordedTtsUrl ? "microphone-settings" : "microphone"} 
                      size={16} 
                      color={editingQuestion.recordedTtsUrl ? "#10b981" : "#7c3aed"} 
                    />
                    <Text style={[styles.ttsButtonText, { color: editingQuestion.recordedTtsUrl ? '#10b981' : '#7c3aed' }]}>
                      {editingQuestion.recordedTtsUrl ? 'Voice Recorded' : 'Record Voice'}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Play Recorded Voice Button */}
                  {editingQuestion.recordedTtsUrl && (
                    <TouchableOpacity
                      style={styles.ttsButton}
                      onPress={isPlayingTTS ? stopTTS : () => playTTS(editingQuestion.recordedTtsUrl)}
                    >
                      <MaterialCommunityIcons 
                        name={isPlayingTTS ? "stop" : "play"} 
                        size={16} 
                        color="#7c3aed" 
                      />
                      <Text style={[styles.ttsButtonText, { color: '#7c3aed' }]}>
                        {isPlayingTTS ? 'Stop Voice' : 'Play Voice'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity 
                  onPress={() => pickMultipleQuestionImages(editingQuestion.id)} 
                  style={styles.imageOptionsButton}
                >
                  <MaterialCommunityIcons name="image-plus" size={18} color="#ffffff" />
                  <Text style={styles.imageOptionsButtonText}>
                    Add Images
                  </Text>
                </TouchableOpacity>
              </View>
              
              {/* Single question image */}
                {editingQuestion.questionImage && (
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <Image 
                      source={{ uri: editingQuestion.questionImage }} 
                      style={{ width: 140, height: 140, borderRadius: 12, marginRight: 8 }} 
                      resizeMode="cover"
                      fadeDuration={0}
                      loadingIndicatorSource={require('../assets/images/icon.png')}
                    />
                    <TouchableOpacity onPress={() => updateQuestion(editingQuestion.id, { questionImage: null })}>
                      <MaterialCommunityIcons name="trash-can" size={22} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              
              {/* Multiple question images - Draggable */}
              {editingQuestion.questionImages && editingQuestion.questionImages.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>
                    Question Images ({editingQuestion.questionImages.length}) - Drag to reorder
                  </Text>
                  <View style={styles.questionImagesContainer}>
                    <DraggableFlatList
                      data={editingQuestion.questionImages}
                      renderItem={renderQuestionImageItem}
                      keyExtractor={(item, index) => `${editingQuestion.id}-img-${index}`}
                      onDragEnd={({ data }) => reorderQuestionImages(editingQuestion.id, data)}
                      horizontal
                      showsHorizontalScrollIndicator={true}
                      scrollEnabled={true}
                      bounces={true}
                    />
                  </View>
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
                              const newMultipleImages = (editingQuestion.optionMultipleImages || []).filter((_, i) => i !== index);
                              updateQuestion(editingQuestion.id, { options: newOptions, optionImages: newImages, optionMultipleImages: newMultipleImages, answer: ans });
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
                          placeholder={(editingQuestion.optionImages?.[index] || editingQuestion.optionMultipleImages?.[index]?.length) ? "Text (optional)" : "Type answer option here"}
                          placeholderTextColor="rgba(255,255,255,0.7)"
                        />
                        <TouchableOpacity onPress={() => pickOptionImage(editingQuestion.id, index)} style={{ marginLeft: 8 }}>
                          <MaterialCommunityIcons name="image-plus" size={22} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                      
                      {/* Single Image Display (Legacy) */}
                      {(editingQuestion.optionImages?.[index]) && (
                        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                          <Image 
                            source={{ uri: editingQuestion.optionImages[index] as string }} 
                            style={{ width: 72, height: 72, borderRadius: 8, marginRight: 8 }} 
                            resizeMode="cover"
                            fadeDuration={0}
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
                      
                      {/* Multiple Images Display */}
                      {(editingQuestion.optionMultipleImages?.[index]?.length) && (
                        <View style={{ marginTop: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={[styles.optionLabel, { color: '#ffffff', fontSize: 12 }]}>Images:</Text>
                            <TouchableOpacity 
                              onPress={() => pickMultipleOptionImages(editingQuestion.id, index)}
                              style={{ marginLeft: 8, padding: 4 }}
                            >
                              <MaterialCommunityIcons name="image-plus" size={18} color="#ffffff" />
                            </TouchableOpacity>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {editingQuestion.optionMultipleImages[index]?.map((imageUrl, imgIndex) => (
                              <View key={imgIndex} style={{ position: 'relative' }}>
                                <Image 
                                  source={{ uri: imageUrl }} 
                                  style={{ width: 72, height: 72, borderRadius: 8 }} 
                                  resizeMode="cover"
                                  fadeDuration={0}
                                  loadingIndicatorSource={require('../assets/images/icon.png')}
                                />
                                <TouchableOpacity 
                                  onPress={() => removeMultipleOptionImage(editingQuestion.id, index, imgIndex)}
                                  style={{ 
                                    position: 'absolute', 
                                    top: -8, 
                                    right: -8, 
                                    backgroundColor: '#ef4444', 
                                    borderRadius: 10, 
                                    width: 20, 
                                    height: 20, 
                                    justifyContent: 'center', 
                                    alignItems: 'center' 
                                  }}
                                >
                                  <MaterialCommunityIcons name="close" size={12} color="#ffffff" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
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
                        bounces={true}
                      >
                        {(editingQuestion.pairs || []).map((pair, idx) => (
                          <View key={`pr-${idx}`} style={[styles.pairPreviewCard, { alignSelf: 'center' }]}>
                            <View style={[styles.pairSide, styles.pairLeft, { backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'][idx % 5] }]}>
                              {pair.leftImage && pair.leftImage.trim() !== '' ? (
                                <Image 
                                  source={{ uri: pair.leftImage }} 
                                  style={styles.pairImage}
                                  resizeMode="cover"
                                  loadingIndicatorSource={require('../assets/images/icon.png')}
                                />
                              ) : (
                                <Text style={styles.pairText}>{pair.left || 'Left item'}</Text>
                              )}
                            </View>
                            <View style={styles.pairConnector}>
                              <MaterialCommunityIcons name="arrow-right" size={20} color="#64748b" />
                            </View>
                            <View style={[styles.pairSide, styles.pairRight, { backgroundColor: ['#1e40af','#059669','#d97706','#dc2626','#7c3aed'][idx % 5] }]}>
                              {pair.rightImage && pair.rightImage.trim() !== '' ? (
                                <Image 
                                  source={{ uri: pair.rightImage }} 
                                  style={styles.pairImage}
                                  resizeMode="cover"
                                  loadingIndicatorSource={require('../assets/images/icon.png')}
                                />
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
                              <Image 
                                source={{ uri: pair.leftImage }} 
                                style={styles.pairImageThumbnail}
                                resizeMode="cover"
                                loadingIndicatorSource={require('../assets/images/icon.png')}
                              />
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
                              <Image 
                                source={{ uri: pair.rightImage }} 
                                style={styles.pairImageThumbnail}
                                resizeMode="cover"
                                loadingIndicatorSource={require('../assets/images/icon.png')}
                              />
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
                  <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, (editingQuestion.reorderDirection || 'asc') === 'asc' && styles.choiceModeActive]}
                      onPress={() => {
                        const newDirection = 'asc';
                        const sortedItems = sortReorderItems(editingQuestion.reorderItems || [], newDirection);
                        const answer = sortedItems.map(item => item.content).filter(Boolean);
                        updateQuestion(editingQuestion.id, { 
                          reorderDirection: newDirection,
                          reorderItems: sortedItems,
                          answer: answer
                        });
                      }}
                    >
                      <Text style={[styles.choiceModeText, (editingQuestion.reorderDirection || 'asc') === 'asc' && styles.choiceModeTextActive]}>Ascending order</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceModeButton, editingQuestion.reorderDirection === 'desc' && styles.choiceModeActive]}
                      onPress={() => {
                        const newDirection = 'desc';
                        const sortedItems = sortReorderItems(editingQuestion.reorderItems || [], newDirection);
                        const answer = sortedItems.map(item => item.content).filter(Boolean);
                        updateQuestion(editingQuestion.id, { 
                          reorderDirection: newDirection,
                          reorderItems: sortedItems,
                          answer: answer
                        });
                      }}
                    >
                      <Text style={[styles.choiceModeText, editingQuestion.reorderDirection === 'desc' && styles.choiceModeTextActive]}>Descending order</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontStyle: 'italic' }}>
                    Items are automatically sorted in {(editingQuestion.reorderDirection || 'asc') === 'asc' ? 'ascending' : 'descending'} order. Students will see them shuffled.
                  </Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#f3f4f6',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 6,
                      marginBottom: 12,
                      alignSelf: 'flex-start',
                      flexDirection: 'row',
                      alignItems: 'center'
                    }}
                    onPress={() => {
                      const sortedItems = sortReorderItems(editingQuestion.reorderItems || [], editingQuestion.reorderDirection || 'asc');
                      const answer = sortedItems.map(item => item.content).filter(Boolean);
                      updateQuestion(editingQuestion.id, { 
                        reorderItems: sortedItems,
                        answer: answer
                      });
                    }}
                  >
                    <MaterialCommunityIcons name="sort" size={16} color="#64748b" />
                    <Text style={{ marginLeft: 6, fontSize: 12, color: '#64748b' }}>
                      Sort Items Now
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Reorder Items with Arrow Controls */}
                  <View style={styles.reorderContainer}>
                    {(editingQuestion.reorderItems || []).map((item, index) => (
                      <View
                        key={item.id}
                        style={[
                          styles.reorderItemContainer,
                        ]}
                      >
                        <View style={styles.reorderItemContent}>
                          <View style={styles.reorderItemNumber}>
                            <Text style={styles.reorderItemNumberText}>{index + 1}</Text>
                          </View>
                          
                          {item.type === 'text' ? (
                            <TextInput
                              style={styles.reorderTextInput}
                              value={item.content}
                              onChangeText={(text) => updateReorderItem(editingQuestion.id, index, { content: text })}
                              placeholder={`Item ${index + 1}`}
                              placeholderTextColor="#9ca3af"
                            />
                          ) : (
                            <View style={styles.reorderImageContainer}>
                              {item.imageUrl && item.imageUrl.trim() !== '' ? (
                                <Image 
                                  source={{ uri: item.imageUrl }} 
                                  style={styles.reorderImageThumbnail}
                                  resizeMode="cover"
                                  loadingIndicatorSource={require('../assets/images/icon.png')}
                                />
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
                                onPress={() => pickReorderItemImage(editingQuestion.id, index)}
                              >
                                <MaterialCommunityIcons name="image-plus" size={20} color="#3b82f6" />
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.reorderItemActionGroup}>
                                <TouchableOpacity
                                  style={styles.reorderActionButton}
                                  onPress={() => pickReorderItemImage(editingQuestion.id, index)}
                                >
                                  <MaterialCommunityIcons name="image-plus" size={20} color="#3b82f6" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.reorderActionButton}
                                  onPress={() => updateReorderItem(editingQuestion.id, index, { type: 'text', content: '', imageUrl: undefined })}
                                >
                                  <MaterialCommunityIcons name="text" size={20} color="#3b82f6" />
                                </TouchableOpacity>
                              </View>
                            )}
                            
                            {(editingQuestion.reorderItems || []).length > 1 && (
                              <TouchableOpacity
                                style={styles.reorderActionButton}
                                onPress={() => removeReorderItem(editingQuestion.id, index)}
                              >
                                <AntDesign name="close" size={16} color="#ef4444" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                        
                        <View style={styles.reorderArrowControls}>
                          <TouchableOpacity 
                            style={[styles.reorderArrowButton, index === 0 && styles.reorderArrowButtonDisabled]}
                            onPress={() => {
                              if (index > 0) {
                                const newItems = [...(editingQuestion.reorderItems || [])];
                                [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
                                
                                // Update answer to match new manual order
                                const answer = newItems.map(item => item.content).filter(Boolean);
                                updateQuestion(editingQuestion.id, { 
                                  reorderItems: newItems,
                                  answer: answer
                                });
                              }
                            }}
                            disabled={index === 0}
                          >
                            <MaterialCommunityIcons 
                              name="arrow-up" 
                              size={20} 
                              color={index === 0 ? "#d1d5db" : "#64748b"} 
                            />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.reorderArrowButton, index === (editingQuestion.reorderItems || []).length - 1 && styles.reorderArrowButtonDisabled]}
                            onPress={() => {
                              if (index < (editingQuestion.reorderItems || []).length - 1) {
                                const newItems = [...(editingQuestion.reorderItems || [])];
                                [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
                                
                                // Update answer to match new manual order
                                const answer = newItems.map(item => item.content).filter(Boolean);
                                updateQuestion(editingQuestion.id, { 
                                  reorderItems: newItems,
                                  answer: answer
                                });
                              }
                            }}
                            disabled={index === (editingQuestion.reorderItems || []).length - 1}
                          >
                            <MaterialCommunityIcons 
                              name="arrow-down" 
                              size={20} 
                              color={index === (editingQuestion.reorderItems || []).length - 1 ? "#d1d5db" : "#64748b"} 
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
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
                              <Image 
                                source={{ uri: item.imageUrl }} 
                                style={styles.reorderPreviewImage}
                                resizeMode="cover"
                                loadingIndicatorSource={require('../assets/images/icon.png')}
                              />
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
                                  bounces={true}
                                >
                                  {(sub.pairs || []).map((pair, idx) => (
                                    <View key={`sub-pr-${idx}`} style={[styles.pairPreviewCard, { alignSelf: 'center' }]}>
                                      <View style={[styles.pairSide, styles.pairLeft, { backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'][idx % 5] }]}>
                                        {(pair as any).leftImage && (pair as any).leftImage.trim() !== '' ? (
                                          <Image 
                                            source={{ uri: (pair as any).leftImage }} 
                                            style={styles.pairImage}
                                            loadingIndicatorSource={require('../assets/images/icon.png')}
                                          />
                                        ) : (
                                          <Text style={styles.pairText}>{pair.left || 'Left item'}</Text>
                                        )}
                                      </View>
                                      <View style={styles.pairConnector}>
                                        <MaterialCommunityIcons name="arrow-right" size={20} color="#64748b" />
                                      </View>
                                      <View style={[styles.pairSide, styles.pairRight, { backgroundColor: ['#1e40af','#059669','#d97706','#dc2626','#7c3aed'][idx % 5] }]}>
                                        {(pair as any).rightImage && (pair as any).rightImage.trim() !== '' ? (
                                          <Image 
                                            source={{ uri: (pair as any).rightImage }} 
                                            style={styles.pairImage}
                                            loadingIndicatorSource={require('../assets/images/icon.png')}
                                          />
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
                                        <Image 
                                          source={{ uri: (pair as any).leftImage }} 
                                          style={styles.pairImageThumbnail}
                                          resizeMode="cover"
                                          loadingIndicatorSource={require('../assets/images/icon.png')}
                                        />
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
                                        <Image 
                                          source={{ uri: (pair as any).rightImage }} 
                                          style={styles.pairImageThumbnail}
                                          resizeMode="cover"
                                          loadingIndicatorSource={require('../assets/images/icon.png')}
                                        />
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
        
        {/* Text Review Modal - Rendered inside question editor to show on top */}
        <Modal
          visible={textReviewModal.visible}
          transparent={false}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={hideTextReviewModal}
          statusBarTranslucent={true}
        >
          <View style={styles.textReviewOverlay}>
            <View style={styles.textReviewContainer}>
              <View style={styles.textReviewHeader}>
                <TouchableOpacity 
                  onPress={hideTextReviewModal}
                  style={styles.textReviewCloseButton}
                >
                  <AntDesign name="close" size={24} color="#64748b" />
                </TouchableOpacity>
                <Text style={styles.textReviewTitle}>Review Processed Text</Text>
                <View style={styles.textReviewHeaderSpacer} />
              </View>
              
              <ScrollView 
                style={styles.textReviewContent} 
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                bounces={true}
              >
                <View style={styles.textReviewSection}>
                  <Text style={styles.textReviewLabel}>Processed Text:</Text>
                  <TextInput
                    style={styles.textReviewTextInput}
                    value={textReviewModal.processedText}
                    onChangeText={(text) => setTextReviewModal(prev => ({ ...prev, processedText: text }))}
                    multiline
                    textAlignVertical="top"
                    placeholder="Processed text..."
                  />
                </View>
                
                <Text style={styles.textReviewQuestion}>
                  Do you want to generate TTS with this enhanced text?
                </Text>
              </ScrollView>
              
              <View style={styles.textReviewButtonContainer}>
                <TouchableOpacity
                  style={[styles.textReviewButton, styles.textReviewButtonCancel]}
                  onPress={() => {
                    if (textReviewModal.onCancel) textReviewModal.onCancel();
                  }}
                >
                  <Text style={styles.textReviewButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.textReviewButton, styles.textReviewButtonAction]}
                  onPress={() => {
                    if (textReviewModal.onUseProcessed) {
                      // Pass the current edited text from the textbox
                      textReviewModal.onUseProcessed(textReviewModal.processedText);
                    }
                  }}
                >
                  <Text style={styles.textReviewButtonTextAction}>Use Enhanced</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        
        {/* Custom Alert Modal - Rendered inside question editor to show on top */}
        <Modal
          visible={customAlert.visible}
          transparent
          animationType="fade"
          onRequestClose={hideCustomAlert}
        >
          <View style={styles.customAlertOverlay}>
            <View style={styles.customAlertContainer}>
              <View style={styles.customAlertContent}>
                <Text style={styles.customAlertTitle}>{customAlert.title}</Text>
                <Text style={styles.customAlertMessage}>{customAlert.message}</Text>
              </View>
              <View style={styles.customAlertButtonContainer}>
                {customAlert.buttons.map((button, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.customAlertButton,
                      button.style === 'cancel' && styles.customAlertButtonCancel,
                      button.style === 'destructive' && styles.customAlertButtonDestructive,
                      customAlert.buttons.length > 1 && index < customAlert.buttons.length - 1 && styles.customAlertButtonBorder
                    ]}
                    onPress={() => {
                      hideCustomAlert();
                      if (button.onPress) button.onPress();
                    }}
                  >
                    <Text
                      style={[
                        styles.customAlertButtonText,
                        button.style === 'cancel' && styles.customAlertButtonTextCancel,
                        button.style === 'destructive' && styles.customAlertButtonTextDestructive
                      ]}
                    >
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
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
        <ScrollView 
          ref={mainScrollRef}
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={true}
        >
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
            <View style={styles.descriptionContainer}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={exerciseDescription}
                onChangeText={setExerciseDescription}
                placeholder="Enter exercise description..."
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[
                  styles.aiImproveButton,
                  isImprovingDescription && styles.aiImproveButtonDisabled
                ]}
                onPress={improveExerciseDetails}
                disabled={isImprovingDescription}
              >
                {isImprovingDescription ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.aiImproveButtonText}>✨ AI Improve</Text>
                )}
              </TouchableOpacity>
            </View>
            {improveError && (
              <Text style={styles.errorText}>{improveError}</Text>
            )}
          </View>
          
          {/* Category Dropdown */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Category *</Text>
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
          </View>
          
          {/* Time Limit Per Item */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Time Limit Per Item</Text>
            <View style={styles.timeLimitContainer}>
              <TouchableOpacity
                style={[styles.timeLimitOption, timeLimitPerItem === null && styles.timeLimitOptionActive]}
                onPress={() => setTimeLimitPerItem(null)}
              >
                <MaterialCommunityIcons name="infinity" size={20} color={timeLimitPerItem === null ? "#ffffff" : "#64748b"} />
                <Text style={[styles.timeLimitText, timeLimitPerItem === null && styles.timeLimitTextActive]}>No Limit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeLimitOption, timeLimitPerItem !== null && styles.timeLimitOptionActive]}
                onPress={() => setTimeLimitPerItem(120)}
              >
                <MaterialCommunityIcons name="clock" size={20} color={timeLimitPerItem !== null ? "#ffffff" : "#64748b"} />
                <Text style={[styles.timeLimitText, timeLimitPerItem !== null && styles.timeLimitTextActive]}>Set Limit</Text>
              </TouchableOpacity>
            </View>
            
            {timeLimitPerItem !== null && (
              <View style={styles.timeLimitInputContainer}>
                <Text style={styles.timeLimitInputLabel}>Time per item (seconds)</Text>
                <View style={styles.timeLimitInputRow}>
                  <TouchableOpacity
                    style={styles.timeLimitButton}
                    onPress={() => setTimeLimitPerItem(Math.max(30, timeLimitPerItem - 30))}
                  >
                    <AntDesign name="minus" size={16} color="#3b82f6" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.timeLimitInput}
                    value={timeLimitPerItem.toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text);
                      if (!isNaN(value) && value >= 30) {
                        setTimeLimitPerItem(value);
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="120"
                  />
                  <TouchableOpacity
                    style={styles.timeLimitButton}
                    onPress={() => setTimeLimitPerItem(Math.min(600, timeLimitPerItem + 30))}
                  >
                    <AntDesign name="plus" size={16} color="#3b82f6" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.timeLimitHelperText}>
                  {timeLimitPerItem ? `${Math.floor(timeLimitPerItem / 60)}m ${timeLimitPerItem % 60}s` : 'No time limit'}
                </Text>
              </View>
            )}
          </View>
          
          {/* Attempt Limit Per Item */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Attempt Limit Per Item</Text>
            <View style={styles.timeLimitContainer}>
              <TouchableOpacity
                style={[styles.timeLimitOption, maxAttemptsPerItem === null && styles.timeLimitOptionActive]}
                onPress={() => setMaxAttemptsPerItem(null)}
              >
                <MaterialCommunityIcons name="infinity" size={20} color={maxAttemptsPerItem === null ? "#ffffff" : "#64748b"} />
                <Text style={[styles.timeLimitText, maxAttemptsPerItem === null && styles.timeLimitTextActive]}>Unlimited</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeLimitOption, maxAttemptsPerItem !== null && styles.timeLimitOptionActive]}
                onPress={() => setMaxAttemptsPerItem(3)}
              >
                <MaterialCommunityIcons name="repeat" size={20} color={maxAttemptsPerItem !== null ? "#ffffff" : "#64748b"} />
                <Text style={[styles.timeLimitText, maxAttemptsPerItem !== null && styles.timeLimitTextActive]}>Set Limit</Text>
              </TouchableOpacity>
            </View>
            
            {maxAttemptsPerItem !== null && (
              <View style={styles.timeLimitInputContainer}>
                <Text style={styles.timeLimitInputLabel}>Maximum attempts per item</Text>
                <View style={styles.timeLimitInputRow}>
                  <TouchableOpacity
                    style={styles.timeLimitButton}
                    onPress={() => setMaxAttemptsPerItem(Math.max(1, maxAttemptsPerItem - 1))}
                  >
                    <AntDesign name="minus" size={16} color="#3b82f6" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.timeLimitInput}
                    value={maxAttemptsPerItem.toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text);
                      if (!isNaN(value) && value >= 1) {
                        setMaxAttemptsPerItem(value);
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="3"
                  />
                  <TouchableOpacity
                    style={styles.timeLimitButton}
                    onPress={() => setMaxAttemptsPerItem(Math.min(10, maxAttemptsPerItem + 1))}
                  >
                    <AntDesign name="plus" size={16} color="#3b82f6" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.timeLimitHelperText}>
                  {maxAttemptsPerItem === 1 
                    ? 'Students get only 1 attempt per question' 
                    : `Students can try up to ${maxAttemptsPerItem} times per question`
                  }
                </Text>
              </View>
            )}
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
                style={styles.aiGeneratorButtonIcon}
                onPress={() => setShowAIGenerator(true)}
                disabled={!exerciseTitle.trim() || !exerciseDescription.trim() || !exerciseCategory.trim()}
              >
                <MaterialCommunityIcons name="robot" size={22} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addQuestionButton}
                onPress={() => {
                  setShowQuestionTypeModal(true);
                  openModal('questionType');
                }}
              >
                <AntDesign name="plus" size={18} color="#ffffff" />
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
                  {failedTTSQuestions.has(question.id) && (
                    <View style={styles.failedTTSIndicator}>
                      <MaterialCommunityIcons name="volume-off" size={12} color="#ef4444" />
                      <Text style={styles.failedTTSText}>TTS Failed</Text>
                    </View>
                  )}
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
          {getFailedTTSQuestions().length > 0 && (
            <TouchableOpacity
              style={[styles.retryFailedTTSButton, isRetryingFailedTTS && styles.retryFailedTTSButtonDisabled]}
              onPress={retryAllFailedTTS}
              disabled={isRetryingFailedTTS}
            >
              <MaterialCommunityIcons 
                name="refresh" 
                size={18} 
                color={isRetryingFailedTTS ? "#9ca3af" : "#ffffff"} 
              />
              <Text style={[styles.retryFailedTTSButtonText, isRetryingFailedTTS && styles.retryFailedTTSButtonTextDisabled]}>
                Retry Failed TTS ({getFailedTTSQuestions().length})
              </Text>
            </TouchableOpacity>
          )}
          
          
          <TouchableOpacity 
            style={[
              styles.saveExerciseButton,
              (uploading || isGeneratingTTS || (ttsUploadProgress.total > 0 && ttsUploadProgress.current < ttsUploadProgress.total)) && styles.saveExerciseButtonDisabled
            ]} 
            onPress={saveExercise}
            disabled={uploading || isGeneratingTTS || (ttsUploadProgress.total > 0 && ttsUploadProgress.current < ttsUploadProgress.total)}
          >
            <Text style={styles.saveExerciseButtonText}>
              {uploading ? 'Uploading...' : (isEditing ? 'Update Exercise' : 'Create Exercise')}
              {(ttsUploadProgress.total > 0 && ttsUploadProgress.current < ttsUploadProgress.total) && ` (${ttsUploadProgress.total - ttsUploadProgress.current} TTS uploading)`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {renderQuestionTypeModal()}
      {renderQuestionEditor()}
      
      {/* Global Custom Alert Modal - visible across the screen, not only in editor */}
      <Modal
        visible={customAlert.visible}
        transparent
        animationType="fade"
        onRequestClose={hideCustomAlert}
      >
        <View style={styles.customAlertOverlay}>
          <View style={styles.customAlertContainer}>
            <View style={styles.customAlertContent}>
              <Text style={styles.customAlertTitle}>{customAlert.title}</Text>
              <Text style={styles.customAlertMessage}>{customAlert.message}</Text>
            </View>
            <View style={styles.customAlertButtonContainer}>
              {customAlert.buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.customAlertButton,
                    button.style === 'cancel' && styles.customAlertButtonCancel,
                    button.style === 'destructive' && styles.customAlertButtonDestructive,
                    customAlert.buttons.length > 1 && index < customAlert.buttons.length - 1 && styles.customAlertButtonBorder
                  ]}
                  onPress={() => {
                    hideCustomAlert();
                    if (button.onPress) button.onPress();
                  }}
                >
                  <Text
                    style={[
                      styles.customAlertButtonText,
                      button.style === 'cancel' && styles.customAlertButtonTextCancel,
                      button.style === 'destructive' && styles.customAlertButtonTextDestructive
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

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
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            bounces={true}
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
                
                <Text style={styles.aiModalLabel}>Additional Requirements (Optional)</Text>
                <TextInput
                  style={styles.aiModalTextArea}
                  value={aiPrompt}
                  onChangeText={setAiPrompt}
                  placeholder="Halimbawa: 'Tungkol sa mga hayop sa bahay', 'Mga kulay at hugis', 'Bilang 1-10', 'Mga letra A-Z'"
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                />
                
                {/* AI TTS Toggle */}
                <View style={styles.aiTTSToggleContainer}>
                  <View style={styles.aiTTSToggleTextContainer}>
                    <MaterialCommunityIcons name="volume-high" size={20} color="#7c3aed" />
                    <View>
                      <Text style={styles.aiTTSToggleTitle}>Generate AI TTS</Text>
                      <Text style={styles.aiTTSToggleSubtitle}>
                        Auto-generate speech for each question
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.aiTTSToggle, generateAITTS && styles.aiTTSToggleActive]}
                    onPress={() => setGenerateAITTS(!generateAITTS)}
                  >
                    <View style={[styles.aiTTSToggleThumb, generateAITTS && styles.aiTTSToggleThumbActive]} />
                  </TouchableOpacity>
                </View>

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
                  disabled={isGeneratingQuestions || isGeneratingTTS}
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
      
      {/* Voice Recording Modal */}
      <Modal
        visible={showRecordingModal}
        transparent
        animationType="fade"
        onRequestClose={closeRecordingModal}
      >
        <View style={styles.recordingModalOverlay}>
          <View style={styles.recordingModalContainer}>
            <View style={styles.recordingModalHeader}>
              <Text style={styles.recordingModalTitle}>Record Voice</Text>
              <TouchableOpacity onPress={closeRecordingModal} style={styles.recordingModalClose}>
                <AntDesign name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.recordingModalContent}>
              {/* Recording Status */}
              <View style={styles.recordingStatusContainer}>
                {isRecording && (
                  <View style={styles.recordingPulse}>
                    <View style={styles.recordingPulseInner} />
                  </View>
                )}
                <MaterialCommunityIcons 
                  name={isRecording ? "microphone" : recordedAudioUri ? "check-circle" : "microphone-outline"} 
                  size={80} 
                  color={isRecording ? "#ef4444" : recordedAudioUri ? "#10b981" : "#94a3b8"} 
                />
              </View>

              {/* Timer with Limit */}
              <View style={styles.recordingTimerContainer}>
                <Text style={[
                  styles.recordingTimer,
                  recordingDuration >= 105 && isRecording && { color: '#ef4444' }, // Red when < 15s left
                  recordingDuration >= 90 && recordingDuration < 105 && isRecording && { color: '#f59e0b' }, // Orange when < 30s left
                ]}>
                  {formatRecordingTime(recordingDuration)}
                </Text>
                <Text style={styles.recordingTimerLimit}> / 2:00</Text>
              </View>

              {/* Status Text */}
              <Text style={styles.recordingStatusText}>
                {isRecording 
                  ? recordingDuration >= 105 
                    ? "Finishing soon..." 
                    : "Recording in progress..." 
                  : recordedAudioUri 
                    ? "Recording ready!" 
                    : "Tap to start (max 2 minutes)"}
              </Text>

              {/* Control Buttons */}
              <View style={styles.recordingControls}>
                {!recordedAudioUri ? (
                  <>
                    {!isRecording ? (
                      <>
                        <TouchableOpacity 
                          style={styles.recordingButtonPrimary}
                          onPress={startRecording}
                        >
                          <MaterialCommunityIcons name="microphone" size={24} color="#fff" />
                          <Text style={styles.recordingButtonText}>Start Recording</Text>
                        </TouchableOpacity>
                        
                        {/* Delete Previous Recording Button */}
                        {hasPreviousRecording && (
                          <TouchableOpacity 
                            style={styles.recordingButtonDelete}
                            onPress={deletePreviousRecording}
                          >
                            <MaterialCommunityIcons name="delete-outline" size={20} color="#ef4444" />
                            <Text style={styles.recordingButtonDeleteText}>Delete Previous Recording</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <TouchableOpacity 
                        style={[styles.recordingButtonPrimary, styles.recordingButtonStop]}
                        onPress={() => stopRecording(false)}
                      >
                        <MaterialCommunityIcons name="stop" size={24} color="#fff" />
                        <Text style={styles.recordingButtonText}>Stop Recording</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.recordingActionsRow}>
                      <TouchableOpacity 
                        style={styles.recordingButtonSecondary}
                        onPress={isPlayingRecording ? stopRecordingPlayback : playRecording}
                      >
                        <MaterialCommunityIcons 
                          name={isPlayingRecording ? "stop" : "play"} 
                          size={20} 
                          color="#7c3aed" 
                        />
                        <Text style={styles.recordingButtonSecondaryText}>
                          {isPlayingRecording ? "Stop" : "Play"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.recordingButtonSecondary}
                        onPress={reRecord}
                      >
                        <MaterialCommunityIcons name="refresh" size={20} color="#7c3aed" />
                        <Text style={styles.recordingButtonSecondaryText}>Re-record</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                      style={[styles.recordingButtonPrimary, styles.recordingButtonSave]}
                      onPress={saveRecordedVoice}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <ActivityIndicator size="small" color="#fff" />
                          <Text style={styles.recordingButtonText}>Saving...</Text>
                        </>
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save" size={24} color="#fff" />
                          <Text style={styles.recordingButtonText}>Save Voice</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Tips */}
              <View style={styles.recordingTips}>
                <MaterialCommunityIcons name="lightbulb-outline" size={16} color="#64748b" />
                <Text style={styles.recordingTipsText}>
                  Tip: Max 2 minutes. Recording is optimized for voice with minimal file size (~100 KB/min). Speak clearly near the microphone
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* TTS Upload Progress Modal */}
      <Modal
        visible={showTTSProgressModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          // Simple close without nested alerts to prevent freezing
          setShowTTSProgressModal(false);
          if (isGeneratingTTS || isRetryingFailedTTS) {
            setIsGeneratingTTS(false);
            setIsRetryingFailedTTS(false);
            setTtsProgress({ current: 0, total: 0 });
          }
        }}
      >
        <View style={styles.ttsProgressOverlay}>
          <View style={styles.ttsProgressModal}>
            <View style={styles.ttsProgressHeader}>
              <MaterialCommunityIcons name="volume-high" size={32} color="#7c3aed" />
              <Text style={styles.ttsProgressTitle}>Generating TTS Audio</Text>
            </View>
            
            <View style={styles.ttsProgressContent}>
              <Text style={styles.ttsProgressStatus}>{ttsUploadStatus}</Text>
              
              <View style={styles.ttsProgressBarContainer}>
                <View style={styles.ttsProgressBar}>
                  <View 
                    style={[
                      styles.ttsProgressBarFill, 
                      { 
                        width: ttsUploadProgress.total > 0 ? `${Math.min(100, (ttsUploadProgress.current / ttsUploadProgress.total) * 100)}%` : '0%'
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.ttsProgressText}>
                  {ttsUploadProgress.current || 0} of {ttsUploadProgress.total || 0} questions
                </Text>
              </View>
              
              {/* Time tracking */}
              <View style={styles.ttsTimeInfo}>
                <Text style={styles.ttsTimeText}>
                  Elapsed: {ttsProcessElapsedSeconds}s   
                </Text>
                {ttsEstimatedTimeRemaining !== null && ttsEstimatedTimeRemaining > 0 && (
                  <Text style={styles.ttsTimeText}>
                  Est. remaining: {ttsEstimatedTimeRemaining}s
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Main Upload Progress Modal */}
      <Modal
        visible={showUploadProgressModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          // Don't allow closing during upload
          if (uploading) return;
          setShowUploadProgressModal(false);
        }}
      >
        <View style={styles.uploadProgressOverlay}>
          <View style={styles.uploadProgressModal}>
            <View style={styles.uploadProgressHeader}>
              <MaterialCommunityIcons name="cloud-upload" size={32} color="#3b82f6" />
              <Text style={styles.uploadProgressTitle}>Uploading Exercise</Text>
            </View>
            
            <View style={styles.uploadProgressContent}>
              <Text style={styles.uploadProgressStatus}>{uploadStatus}</Text>
              
              <View style={styles.uploadProgressBarContainer}>
                <View style={styles.uploadProgressBar}>
                  <View 
                    style={[
                      styles.uploadProgressBarFill, 
                      { 
                        width: uploadProgress.total > 0 ? `${Math.min(100, (uploadProgress.current / uploadProgress.total) * 100)}%` : '0%'
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.uploadProgressText}>
                  Step {uploadProgress.current || 0} of {uploadProgress.total || 0}
                </Text>
              </View>
            </View>
          </View>
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
          <ScrollView 
            style={{ flex: 1, paddingHorizontal: 20 }}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            bounces={true}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
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
                      showCustomAlert('Permission needed', 'Media library access is required to pick images.');
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
                
                <FlatList
                  data={stockImageCategories.find(c => c.id === selectedCategory)?.images || []}
                  numColumns={3}
                  keyExtractor={(item) => item.name}
                  showsVerticalScrollIndicator={true}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  bounces={true}
                  columnWrapperStyle={{ justifyContent: 'space-between' }}
                  initialNumToRender={12}
                  maxToRenderPerBatch={6}
                  windowSize={10}
                  getItemLayout={(data, index) => ({
                    length: 116, // 80 (image) + 16 (margin) + 20 (text)
                    offset: 116 * Math.floor(index / 3),
                    index,
                  })}
                  renderItem={({ item: image }) => (
                    <TouchableOpacity
                      style={{ width: '30%', marginBottom: 16, alignItems: 'center' }}
                      onPress={() => selectStockImage(image.source)}
                    >
                      <Image
                        source={image.source}
                        style={{ width: 80, height: 80, borderRadius: 12, backgroundColor: '#f1f5f9' }}
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8, textAlign: 'center', fontWeight: '500' }} numberOfLines={1}>
                        {image.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
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
              <TouchableOpacity 
                onPress={() => scrollToTop(stockImagesScrollRef)} 
                style={styles.scrollToTopButton}
              >
                <AntDesign name="arrow-up" size={20} color="#64748b" />
              </TouchableOpacity>
          </View>
            
            <ScrollView 
              ref={stockImagesScrollRef}
              style={styles.fullScreenContent} 
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              bounces={true}
              contentContainerStyle={styles.fullScreenScrollContainer}
            >
            {/* Animals Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Animals</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Animals'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `animal-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Animals')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Alphabet Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Alphabet</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Alphabet'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `alphabet-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Alphabet')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Fruits Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Fruits</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Fruits and Vegetables'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `fruit-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Fruits')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* 3D Alphabet Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>3D Alphabet</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['3D Alphabet'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `3d-alphabet-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('3D Alphabet')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Boxed Alphabet Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Boxed Alphabet</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Boxed Alphabet'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `boxed-alphabet-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Boxed Alphabet')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Boxed Numbers Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Boxed Numbers 1-9</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Boxed Numbers 1-9'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `boxed-number-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Boxed Numbers 1-9')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Comparing Quantities Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Comparing Quantities</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Comparing Quantities'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `comparing-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Comparing Quantities')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Dates Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Dates</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Dates'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `date-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Dates')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Extra Objects Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Extra Objects</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Extra Objects'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `extra-object-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Extra Objects')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Fractions Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Fractions</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Fractions'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `fraction-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Fractions')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Length and Distance Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Length and Distance</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Length and Distance'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `length-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Length and Distance')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Money Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Money</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Money'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `money-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Money')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Patterns Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Patterns</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Patterns'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `pattern-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Patterns')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Time and Position Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Time and Position</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Time and Position'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `time-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Time and Position')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Land Animals Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Land Animals</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Animals'] || []).filter((_, index) => index < 32).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `land-animal-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Land Animals')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Sea Animals Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Sea Animals</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Animals'] || []).filter((_, index) => index >= 32).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `sea-animal-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Sea Animals')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Math Symbols Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Math Symbols</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Math Symbols'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `math-symbol-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Math Symbols')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Numbers Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Numbers</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...stockImages['Numbers'].map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `number-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Numbers')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={8}
                maxToRenderPerBatch={5}
                windowSize={5}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* School Supplies Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>School Supplies</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['School Supplies'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `school-supply-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('School Supplies')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Shapes Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Shapes</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Shapes'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `shape-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Shapes')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Toys Section */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Toys</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(stockImages['Toys'] || []).map(img => ({ image: img }))]}
                keyExtractor={(item, index) => `toy-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Toys')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(Image.resolveAssetSource(item.image.uri).uri)}
                    >
                      <Image 
                        source={item.image.uri} 
                        style={styles.horizontalImageThumbnail} 
                        resizeMode="cover"
                        fadeDuration={0}
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
            </View>

            {/* Custom Categories */}
            {Object.keys(customCategories).map((categoryName) => (
              <View key={categoryName} style={styles.imageCategory}>
                <Text style={styles.categoryTitle}>{categoryName}</Text>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={true}
                bounces={true}
                  data={[{ isAddButton: true }, ...customCategories[categoryName].map(url => ({ imageUrl: url }))]}
                  keyExtractor={(item, index) => `custom-${categoryName}-${index}`}
                  renderItem={({ item }: any) => {
                    if (item.isAddButton) {
                      return (
                        <TouchableOpacity
                          style={styles.addImageButton}
                          onPress={() => handleImageUpload(categoryName)}
                        >
                          <AntDesign name="plus" size={24} color="#3b82f6" />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        style={styles.horizontalImageItem}
                        onPress={() => handleImageSelect(item.imageUrl)}
                      >
                        <Image 
                          source={{ uri: item.imageUrl }} 
                          style={styles.horizontalImageThumbnail} 
                          resizeMode="cover"
                          fadeDuration={0}
                          loadingIndicatorSource={require('../assets/images/icon.png')}
                        />
                      </TouchableOpacity>
                    );
                  }}
                  initialNumToRender={5}
                  maxToRenderPerBatch={3}
                  windowSize={3}
                  contentContainerStyle={styles.horizontalImageContainer}
                />
              </View>
            ))}

            {/* Custom Uploads Category - Always show this */}
            <View style={styles.imageCategory}>
              <Text style={styles.categoryTitle}>Custom Uploads</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={true}
                bounces={true}
                data={[{ isAddButton: true }, ...(customCategories['Custom Uploads'] || []).map(url => ({ imageUrl: url }))]}
                keyExtractor={(item, index) => `custom-uploads-${index}`}
                renderItem={({ item }: any) => {
                  if (item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addImageButton}
                        onPress={() => handleImageUpload('Custom Uploads')}
                      >
                        <AntDesign name="plus" size={24} color="#3b82f6" />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      style={styles.horizontalImageItem}
                      onPress={() => handleImageSelect(item.imageUrl)}
                    >
                      <Image 
                        source={{ uri: item.imageUrl }} 
                        style={styles.horizontalImageThumbnail}
                        resizeMode="cover"
                        loadingIndicatorSource={require('../assets/images/icon.png')}
                      />
                    </TouchableOpacity>
                  );
                }}
                initialNumToRender={5}
                maxToRenderPerBatch={3}
                windowSize={3}
                contentContainerStyle={styles.horizontalImageContainer}
              />
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

      {/* Category Dropdown Modal */}
      <Modal
        visible={showCategoryDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryDropdown(false)}
      >
        <View style={styles.categoryDropdownModalOverlay}>
          <TouchableOpacity
            style={styles.categoryDropdownModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCategoryDropdown(false)}
          />
          
          <View style={styles.categoryDropdownModalContent}>
            <View style={styles.categoryDropdownModalHeader}>
              <Text style={styles.categoryDropdownModalTitle}>Select Category</Text>
              <TouchableOpacity 
                onPress={() => setShowCategoryDropdown(false)}
                style={styles.categoryDropdownModalClose}
              >
                <AntDesign name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.categoryDropdownModalScroll}
              showsVerticalScrollIndicator={true}
              bounces={false}
            >
              {categoryOptions.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={styles.categoryDropdownModalItem}
                  activeOpacity={0.7}
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
                  <Text style={styles.categoryDropdownModalItemText}>{category}</Text>
                  {exerciseCategory === category && (
                    <MaterialCommunityIcons name="check" size={20} color="#3b82f6" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  },
  scrollContentContainer: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 12,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 8,
  },
  scrollToTopButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    opacity: 0.8,
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
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  
  // AI Improve Button Styles
  descriptionContainer: {
    position: 'relative',
  },
  aiImproveButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  aiImproveButtonDisabled: {
    backgroundColor: '#a78bfa',
    opacity: 0.7,
  },
  aiImproveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  
  // TTS Progress Modal Styles
  ttsProgressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  ttsProgressModal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  ttsProgressHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  ttsProgressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 8,
  },
  ttsProgressContent: {
    alignItems: 'center',
  },
  ttsProgressStatus: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  ttsProgressBarContainer: {
    width: '100%',
  },
  ttsProgressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  ttsProgressBarFill: {
    height: '100%',
    backgroundColor: '#7c3aed',
    borderRadius: 4,
  },
  ttsProgressText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  
  ttsTimeInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
    paddingHorizontal: 4,
  },
  
  ttsTimeText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  
  // Upload Progress Modal Styles
  uploadProgressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  uploadProgressModal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  uploadProgressHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  uploadProgressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 8,
  },
  uploadProgressContent: {
    alignItems: 'center',
  },
  uploadProgressStatus: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  uploadProgressBarContainer: {
    width: '100%',
  },
  uploadProgressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  uploadProgressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  uploadProgressText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
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
    zIndex: 998,
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
  dropdownScrollContent: {
    flexGrow: 1,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addQuestionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  
  // Icon-only buttons for AI and Add Question
  aiGeneratorButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addQuestionButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
  },
  
  retryFailedTTSButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  retryFailedTTSButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.7,
  },
  retryFailedTTSButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  retryFailedTTSButtonTextDisabled: {
    color: '#9ca3af',
  },
  failedTTSIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  failedTTSText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
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
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    alignSelf: 'center',
    minWidth: 200,
    maxWidth: 400,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveExerciseButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
  },
  saveExerciseButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  ttsUploadProgressContainer: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  ttsUploadProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  ttsUploadProgressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e40af',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#e0e7ff',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  ttsUploadProgressSubtext: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
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
  fullScreenScrollContainer: {
    paddingBottom: 20,
    flexGrow: 1,
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
    maxHeight: '85%',
    minHeight: '60%',
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
    paddingBottom: 30,
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
    borderRadius: 8,
    overflow: 'hidden',
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
  
  // Image Options Button
  imageOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  imageOptionsButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    marginRight: 6,
  },
  
  // Image Options Modal
  imageOptionsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  imageOptionsModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  imageOptionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  imageOptionsModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  imageOptionsModalClose: {
    padding: 4,
  },
  imageOptionsModalBody: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  imageOptionsModalDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
  },
  imageOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  imageOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  imageOptionContent: {
    flex: 1,
  },
  imageOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  imageOptionDescription: {
    fontSize: 13,
    color: '#64748b',
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
    backgroundColor: '#f8fafc',
    borderRadius: 8,
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
  
  // Category Dropdown Modal Styles
  categoryDropdownModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  categoryDropdownModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  categoryDropdownModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  categoryDropdownModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  categoryDropdownModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  categoryDropdownModalClose: {
    padding: 4,
  },
  categoryDropdownModalScroll: {
    maxHeight: 400,
  },
  categoryDropdownModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  categoryDropdownModalItemText: {
    fontSize: 16,
    color: '#1e293b',
    flex: 1,
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
  
  // Time Limit Styles
  timeLimitContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 4,
    marginBottom: 12,
  },
  timeLimitOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  timeLimitOptionActive: {
    backgroundColor: '#3b82f6',
  },
  timeLimitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginLeft: 8,
  },
  timeLimitTextActive: {
    color: '#ffffff',
  },
  timeLimitInputContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timeLimitInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  timeLimitInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  timeLimitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLimitInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  timeLimitHelperText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic',
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
  reorderArrowControls: {
    flexDirection: 'column',
    gap: 4,
    marginLeft: 8,
  },
  reorderArrowButton: {
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reorderArrowButtonDisabled: {
    backgroundColor: '#f8fafc',
    opacity: 0.5,
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
  aiModalHint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  existingQuestionsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  existingQuestionsInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    marginLeft: 8,
    lineHeight: 18,
  },
  aiExerciseInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  aiDescriptionContainer: {
    marginTop: 4,
  },
  aiDescriptionScroll: {
    maxHeight: 40,
    marginTop: 2,
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
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  aiModalRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
  
  // Question Images Draggable Styles
  questionImagesContainer: {
    height: 120,
    marginBottom: 8,
  },
  questionImageItemContainer: {
    width: 100,
    height: 100,
    marginRight: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  questionImageItemActive: {
    backgroundColor: '#f0f9ff',
    borderColor: '#3b82f6',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    transform: [{ scale: 1.05 }],
  },
  questionImageItemContent: {
    flex: 1,
    position: 'relative',
  },
  questionImageItemNumber: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  questionImageItemNumberText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  questionImageThumbnailContainer: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  questionImageThumbnail: {
    width: '100%',
    height: '100%',
  },
  questionImageItemActions: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    gap: 4,
    zIndex: 2,
  },
  questionImageRemoveButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionImageDragHandle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(100, 116, 139, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Custom Alert Styles
  customAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  customAlertContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    minWidth: 280,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  customAlertContent: {
    padding: 24,
  },
  customAlertTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  customAlertMessage: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    textAlign: 'center',
  },
  customAlertButtonContainer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  customAlertButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customAlertButtonBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  customAlertButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  customAlertButtonCancel: {
    backgroundColor: '#f8fafc',
  },
  customAlertButtonTextCancel: {
    color: '#64748b',
    fontWeight: '500',
  },
  customAlertButtonDestructive: {
    backgroundColor: '#fef2f2',
  },
  customAlertButtonTextDestructive: {
    color: '#ef4444',
  },

  // Text Review Modal Styles
  textReviewOverlay: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  textReviewContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
    overflow: 'hidden',
  },
  textReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  textReviewCloseButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  textReviewTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    flex: 1,
  },
  textReviewHeaderSpacer: {
    width: 40,
  },
  textReviewContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  textReviewSection: {
    marginBottom: 24,
  },
  textReviewLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  textReviewTextInput: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#374151',
    backgroundColor: '#ffffff',
    minHeight: 140,
    maxHeight: 200,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  textReviewQuestion: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  textReviewButtonContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  textReviewButton: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 56,
  },
  textReviewButtonCancel: {
    backgroundColor: '#f8fafc',
  },
  textReviewButtonAction: {
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderLeftColor: '#e2e8f0',
  },
  textReviewButtonTextCancel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748b',
  },
  textReviewButtonTextAction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },

  // Recording Modal Styles
  recordingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  recordingModalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  recordingModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  recordingModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  recordingModalClose: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  recordingModalContent: {
    padding: 32,
    alignItems: 'center',
  },
  recordingStatusContainer: {
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    opacity: 0.6,
  },
  recordingPulseInner: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    opacity: 0.4,
  },
  recordingTimerContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 12,
  },
  recordingTimer: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1e293b',
    fontVariant: ['tabular-nums'],
  },
  recordingTimerLimit: {
    fontSize: 24,
    fontWeight: '500',
    color: '#94a3b8',
    fontVariant: ['tabular-nums'],
  },
  recordingStatusText: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 32,
    textAlign: 'center',
  },
  recordingControls: {
    width: '100%',
    gap: 12,
  },
  recordingActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  recordingButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  recordingButtonStop: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  recordingButtonSave: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
  },
  recordingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  recordingButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  recordingButtonSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7c3aed',
  },
  recordingButtonDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginTop: 12,
  },
  recordingButtonDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  recordingTips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  recordingTipsText: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
    lineHeight: 18,
  },
  recordVoiceButton: {
    borderWidth: 1,
    borderColor: '#7c3aed',
    backgroundColor: '#faf5ff',
  },

  // AI TTS Toggle Styles
  aiTTSToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#faf5ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    marginTop: 8,
  },
  aiTTSToggleTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  aiTTSToggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  aiTTSToggleSubtitle: {
    fontSize: 9,
    color: '#64748b',
  },
  aiTTSToggle: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#cbd5e1',
    padding: 2,
    justifyContent: 'center',
  },
  aiTTSToggleActive: {
    backgroundColor: '#7c3aed',
  },
  aiTTSToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    transform: [{ translateX: 0 }],
  },
  aiTTSToggleThumbActive: {
    transform: [{ translateX: 24 }],
  },
});