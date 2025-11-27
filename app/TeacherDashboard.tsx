import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import * as FileSystem from 'expo-file-system/legacy';

import * as ImagePicker from 'expo-image-picker';

import * as Print from 'expo-print';

import { useRouter } from 'expo-router';

import { Accelerometer } from 'expo-sensors';

import * as Sharing from 'expo-sharing';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,

  Animated,
  Dimensions,

  Image,
  InteractionManager,
  Modal,

  PanResponder,
  Platform,
  RefreshControl,

  ScrollView,

  StyleSheet,

  Text,

  TextInput,

  TouchableOpacity,

  TouchableWithoutFeedback,

  View,
  useWindowDimensions
} from 'react-native';

import { ResponsiveCards } from '../components/ResponsiveGrid';
import { useResponsive } from '../hooks/useResponsive';
import { useResponsiveLayout, useResponsiveValue } from '../hooks/useResponsiveLayout';

import * as XLSX from 'xlsx';

import { AssignExerciseForm } from '../components/AssignExerciseForm';

import { AssignedExercise, useExercises } from '../hooks/useExercises';

import { onAuthChange, signOutUser } from '../lib/firebase-auth';

import { deleteData, readData, updateData, writeData } from '../lib/firebase-database';

import { collectAppMetadata } from '../lib/app-metadata';
import { createAnnouncement, createClass, createParent, createStudent } from '../lib/entity-helpers';
import { logError, logErrorWithStack } from '../lib/error-logger';
import { uploadFile } from '../lib/firebase-storage';
import { callGeminiWithFallback, extractGeminiText, parseGeminiJson } from '../lib/gemini-utils';



// Note: Using static dimensions for StyleSheet creation
// Dynamic dimensions are handled via useWindowDimensions hook in component
const { width: staticWidth, height: staticHeight } = Dimensions.get('window');



// Custom Alert Component

interface CustomAlertProps {

  visible: boolean;

  title: string;

  message: string;

  buttons?: Array<{

    text: string;

    onPress?: () => void;

    style?: 'default' | 'cancel' | 'destructive';

  }>;

  onClose: () => void;

  icon?: 'success' | 'error' | 'warning' | 'info';

}



const CustomAlert: React.FC<CustomAlertProps> = ({ visible, title, message, buttons = [], onClose, icon }) => {

  if (!visible) return null;



  const defaultButtons = buttons.length > 0 ? buttons : [{ text: 'OK', onPress: onClose }];

  const isThreeButtons = defaultButtons.length === 3;

  const isFourButtons = defaultButtons.length === 4;



  const renderIcon = () => {

    if (!icon) return null;

    

    const iconSize = 48;

    const iconContainerStyle = {

      marginBottom: 16,

      alignItems: 'center' as const,

    };



    switch (icon) {

      case 'success':

        return (

          <View style={iconContainerStyle}>

            <AntDesign name="check" size={iconSize} color="#10b981" />

          </View>

        );

      case 'error':

        return (

          <View style={iconContainerStyle}>

            <AntDesign name="close" size={iconSize} color="#ef4444" />

          </View>

        );

      case 'warning':

        return (

          <View style={iconContainerStyle}>

            <AntDesign name="warning" size={iconSize} color="#f59e0b" />

          </View>

        );

      case 'info':

        return (

          <View style={iconContainerStyle}>

            <AntDesign name="info" size={iconSize} color="#3b82f6" />

          </View>

        );

      default:

        return null;

    }

  };

  return (

    <Modal

      transparent

      visible={visible}

      animationType="fade"

      onRequestClose={onClose}

    >

      <View style={styles.alertOverlay}>

        <View style={styles.alertContainer}>

          <View style={styles.alertContent}>

            {renderIcon()}

            <Text style={styles.alertTitle}>{title}</Text>

            <Text style={styles.alertMessage}>{message}</Text>

            <View style={[

              styles.alertButtons,

              isThreeButtons && styles.alertButtonsThree,

              isFourButtons && styles.alertButtonsFour

            ]}>

              {defaultButtons.map((button, index) => (

                <TouchableOpacity

                  key={index}

                  style={[

                    styles.alertButton,

                    button.style === 'destructive' && styles.alertButtonDestructive,

                    button.style === 'cancel' && styles.alertButtonCancel,

                    defaultButtons.length === 1 && styles.alertButtonSingle,

                    isThreeButtons && styles.alertButtonThree,

                    isFourButtons && styles.alertButtonFour

                  ]}

                  onPress={() => {

                    if (button.onPress) {

                      button.onPress();

                    }

                    onClose();

                  }}

                >

                  <Text style={[

                    styles.alertButtonText,

                    button.style === 'destructive' && styles.alertButtonTextDestructive,

                    button.style === 'cancel' && styles.alertButtonTextCancel

                  ]}>

                    {button.text}

                  </Text>

                </TouchableOpacity>

              ))}

            </View>

          </View>

        </View>

      </View>

    </Modal>

  );

};

const generateGeminiAnalysis = async (resultData: any, classAverages: any): Promise<any> => {
  let lastAnalysisText = '';

  try {
    const performanceData = {
      score: resultData.scorePercentage,
      totalQuestions: resultData.totalQuestions,
      timeSpent: resultData.totalTimeSpent,
      questionResults: resultData.questionResults || [],
      classAverage: classAverages?.averageScore || 0,
      classAverageTime: classAverages?.averageTime || 0,
    };

    const prompt = `You are an expert educational psychologist analyzing a Grade 1 student's math exercise performance. Provide a comprehensive analysis in JSON format.



STUDENT PERFORMANCE DATA:

- Score: ${performanceData.score}%

- Total Questions: ${performanceData.totalQuestions}

- Time Spent: ${Math.round(performanceData.timeSpent / 1000)} seconds

- Class Average Score: ${Math.round(performanceData.classAverage)}%

- Class Average Time: ${Math.round(performanceData.classAverageTime)} seconds



DETAILED QUESTION RESULTS:

${performanceData.questionResults.map((q: any) => {
  const classAvg = classAverages?.questionAverages?.[q.questionId];
  return `Question ${q.questionNumber}: ${q.isCorrect ? 'CORRECT' : 'INCORRECT'} (${q.attempts} attempts, ${Math.round(q.timeSpent / 1000)}s)
   Question Text: "${q.questionText}"
   Question Type: ${q.questionType}
   ${q.options && q.options.length > 0 ? `Options: ${q.options.join(', ')}` : ''}
   Student Answer: "${q.studentAnswer}"
   Correct Answer: "${q.correctAnswer}"
   ${q.questionImage ? `Image: ${q.questionImage}` : ''}
   
   ENHANCED PERFORMANCE DATA:
   - Difficulty Level: ${q.metadata?.difficulty || 'medium'}
   - Topic Tags: ${q.metadata?.topicTags?.join(', ') || 'none'}
   - Cognitive Load: ${q.metadata?.cognitiveLoad || 'medium'}
   - Question Complexity: ${q.metadata?.questionComplexity || 'medium'}
   - Total Hesitation Time: ${Math.round((q.totalHesitationTime || 0) / 1000)}s
   - Average Confidence: ${q.averageConfidence?.toFixed(1) || '2.0'} (1=low, 2=medium, 3=high)
   - Significant Changes: ${q.significantChanges || 0}
   - Phase Distribution: Reading(${q.phaseDistribution?.reading || 0}), Thinking(${q.phaseDistribution?.thinking || 0}), Answering(${q.phaseDistribution?.answering || 0}), Reviewing(${q.phaseDistribution?.reviewing || 0})
   
   INTERACTION PATTERNS:
   - Total Interactions: ${q.totalInteractions || 0}
   - Option Clicks: ${q.interactionTypes?.optionClicks || 0}
   - Help Used: ${q.interactionTypes?.helpUsed || 0} (Help Button: ${q.helpUsage?.helpButtonClicks || 0})
   - Answer Changes: ${q.interactionTypes?.answerChanges || 0}
   
   TIME BREAKDOWN:
   - Reading Time: ${Math.round((q.timeBreakdown?.readingTime || 0) / 1000)}s
   - Thinking Time: ${Math.round((q.timeBreakdown?.thinkingTime || 0) / 1000)}s
   - Answering Time: ${Math.round((q.timeBreakdown?.answeringTime || 0) / 1000)}s
   - Reviewing Time: ${Math.round((q.timeBreakdown?.reviewingTime || 0) / 1000)}s
   - Time to First Answer: ${Math.round((q.timeToFirstAnswer || 0) / 1000)}s
   ${q.attemptHistory && q.attemptHistory.length > 0 ? `
   ATTEMPT HISTORY:
   ${q.attemptHistory.map((attempt: any, attemptIdx: number) =>
     `   Attempt ${attemptIdx + 1}: "${attempt.answer || 'blank'}" (${Math.round((attempt.timeSpent || 0) / 1000)}s)`
   ).join('\n')}` : ''}
   ${classAvg ? `CLASS AVERAGE: ${Math.round(classAvg.averageTime / 1000)}s, ${Math.round(classAvg.averageAttempts)} attempts` : '- Performance ranking data not available'}`;
}).join('\n\n')}



IMPORTANT: Respond with ONLY valid JSON. Do not include any markdown formatting, code blocks, or additional text. Return only the JSON object.



Required JSON format:

{
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "questionAnalysis": ["analysis1", "analysis2", "analysis3"],
  "timeAnalysis": {
    "description": "Time analysis description",
    "studentTime": ${Math.round(performanceData.timeSpent / 1000)},
    "classAverage": ${Math.round(performanceData.classAverageTime)}
  },
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"],
  "encouragement": "Encouraging message for the student"
}



Focus on:
1. Mathematical concepts mastered
2. Areas needing improvement
3. Time management skills
4. Specific question performance
5. Age-appropriate recommendations
6. Positive reinforcement
LANGUAGE RULES:
- Always spell out all numbers in proper modern Tagalog words (hal. 12 → "labindalawa", 21 → "dalawampu't isa").
- Huwag gumamit ng digits na hinaluan ng Tagalog o Spanish shortcuts tulad ng "dose" o "bente".

Remember: Return ONLY the JSON object, no markdown, no code blocks, no additional text.`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    };

    const { data, modelUsed } = await callGeminiWithFallback(requestBody);
    console.log('Gemini model used for teacher analysis:', modelUsed);

    let analysisText = extractGeminiText(data);
    if (!analysisText) {
      throw new Error('Invalid response from AI service');
    }

    lastAnalysisText = analysisText;
    return parseGeminiJson<any>(analysisText);
  } catch (error) {
    console.error('Error generating Gemini analysis:', error);

    if (lastAnalysisText) {
      try {
        const jsonMatches = lastAnalysisText.match(/\{[^}]*"strengths"[^}]*\}/g);
        if (jsonMatches && jsonMatches.length > 0) {
          console.log('Using partial Gemini analysis data.');
          return JSON.parse(jsonMatches[0]);
        }
      } catch (partialError) {
        console.warn('Failed to extract partial Gemini analysis:', partialError);
      }
    }

    return {
      strengths: ['Completed the exercise successfully', 'Showed persistence in problem-solving'],
      weaknesses: ['Could improve time management', 'May need more practice with certain concepts'],
      questionAnalysis: ['Overall good performance across questions'],
      timeAnalysis: {
        description: 'Student completed the exercise in a reasonable time',
        studentTime: Math.round(resultData.totalTimeSpent / 1000),
        classAverage: Math.round(classAverages?.averageTime || 0),
      },
      recommendations: ['Continue practicing regularly', 'Focus on areas that took longer'],
      encouragement: 'Great job completing the exercise! Keep up the good work!',
    };
  }
};

// Stock image library data

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



interface TeacherData {

  firstName: string;

  lastName: string;

  email: string;

  phone: string;

  school: string;

  profilePictureUrl: string;

  uid: string;

  createdAt: string;

  // Whether the teacher account is verified by admin

  isVerified?: boolean;

}



// Generate two-digit school year options like 22-23, returning { label, value }

// value will be stored as 2223 in the database

function generateYearOptions() {

  const now = new Date();

  const currentFull = now.getFullYear();

  const items: { label: string; value: string }[] = [];

  for (let offset = -5; offset <= 5; offset++) {

    const startFull = currentFull + offset;

    const endFull = startFull + 1;

    const start = ((startFull % 100) + 100) % 100;

    const end = ((endFull % 100) + 100) % 100;

    const s = String(start).padStart(2, '0');

    const e = String(end).padStart(2, '0');

    items.push({ label: `${s}-${e}`, value: `${s}${e}` });

  }

  return items;

}
export default function TeacherDashboard() {

  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const responsive = useResponsive();
  const layout = useResponsiveLayout();
  const shouldAllowHorizontalSwipe = Platform.OS === 'android' || width < 640;
  
  // Responsive values
  const containerPadding = useResponsiveValue({
    mobile: 16,
    tablet: 24,
    desktop: 32,
    default: 16,
  });

  const [teacherData, setTeacherData] = useState<TeacherData | null>(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);

  const [editing, setEditing] = useState(false);

  const [editData, setEditData] = useState<TeacherData | null>(null);

  const [uploading, setUploading] = useState(false);

  const [showAddClassModal, setShowAddClassModal] = useState(false);

  const [className, setClassName] = useState('');

  const [schoolOption, setSchoolOption] = useState<'profile' | 'other'>('profile');

  const [schoolOther, setSchoolOther] = useState('');

  const [schoolYear, setSchoolYear] = useState(''); // stores label like "22-23"

  const [showYearPicker, setShowYearPicker] = useState(false);

  const [savingClass, setSavingClass] = useState(false);



  // Announcement state

  const [showAnnModal, setShowAnnModal] = useState(false);

  const [annTitle, setAnnTitle] = useState('');

  const [annMessage, setAnnMessage] = useState('');



  // Custom Alert state

  const [alertVisible, setAlertVisible] = useState(false);

  const [alertTitle, setAlertTitle] = useState('');

  const [alertMessage, setAlertMessage] = useState('');

  const [alertIcon, setAlertIcon] = useState<'success' | 'error' | 'warning' | 'info' | undefined>(undefined);

  const [alertButtons, setAlertButtons] = useState<Array<{

    text: string;

    onPress?: () => void;

    style?: 'default' | 'cancel' | 'destructive';

  }>>([]);

  const alertQueueRef = useRef<Array<{

    title: string;

    message: string;

    icon?: 'success' | 'error' | 'warning' | 'info';

    buttons?: Array<{

      text: string;

      onPress?: () => void;

      style?: 'default' | 'cancel' | 'destructive';

    }>;

  }>>([]);

  const isShowingAlertRef = useRef(false);



  // Custom Alert helper function

  const showAlert = (

    title: string, 

    message: string, 

    buttons?: Array<{

      text: string;

      onPress?: () => void;

      style?: 'default' | 'cancel' | 'destructive';

    }>,

    icon?: 'success' | 'error' | 'warning' | 'info'

  ) => {

    const alertData = { title, message, buttons, icon };

    

    if (isShowingAlertRef.current) {

      // If an alert is already showing, add to queue

      alertQueueRef.current.push(alertData);

      return;

    }

    

    // Show the alert immediately

    isShowingAlertRef.current = true;

    setAlertTitle(title);

    setAlertMessage(message);

    setAlertButtons(buttons || []);

    setAlertIcon(icon);

    setAlertVisible(true);

  };



  // Function to process the next alert in queue

  const processNextAlert = () => {

    if (alertQueueRef.current.length > 0) {

      const nextAlert = alertQueueRef.current.shift();

      if (nextAlert) {

        setAlertTitle(nextAlert.title);

        setAlertMessage(nextAlert.message);

        setAlertButtons(nextAlert.buttons || []);

        setAlertIcon(nextAlert.icon);

        setAlertVisible(true);

      }

    } else {

      isShowingAlertRef.current = false;

    }

  };

  const [annSelectedClassIds, setAnnSelectedClassIds] = useState<string[]>([]);

  const [teacherClasses, setTeacherClasses] = useState<{

    id: string;

    name: string;

    schoolYear?: string;

    schoolName?: string;

    status?: string;

  }[]>([]);

  const [activeClasses, setActiveClasses] = useState<

    { id: string; name: string; schoolYear?: string; schoolName?: string; status?: string }[]

  >([]);

  const [sendingAnn, setSendingAnn] = useState(false);


  // Floating button position state
  const pan = useRef(new Animated.ValueXY({ x: width - 80, y: height - 170 })).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Shake detection state
  const [isShakeEnabled, setIsShakeEnabled] = useState(true);
  const lastShakeTime = useRef(0);
  const shakeThreshold = 12; // Lowered for better sensitivity (was 15)
  
  // Function to fade out the button after inactivity
  const fadeOut = () => {
    Animated.timing(opacity, {
      toValue: 0.3,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };
  
  // Function to fade in the button on interaction
  const fadeIn = () => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };
  
  // Function to reset the inactivity timer
  const resetInactivityTimer = () => {
    // Clear existing timer
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    
    // Fade in immediately
    fadeIn();
    
    // Set new timer to fade out after 3 seconds
    inactivityTimer.current = setTimeout(() => {
      fadeOut();
    }, 3000);
  };
  
  // Start the initial fade out timer
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      fadeOut();
    }, 3000);
    
    return () => {
      clearTimeout(initialTimer);
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
      }
    };
  }, []);
  
  // PanResponder for dragging with improved tap detection
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only set responder if moved more than 5 pixels (this allows taps to work)
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        resetInactivityTimer();
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gesture) => {
        pan.flattenOffset();
        
        // Check if this was a tap (minimal movement)
        const wasTap = Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5;
        
        if (wasTap) {
          // This was a tap, let the TouchableOpacity handle it
          return;
        }
        
        // Get current position
        const currentX = (pan.x as any)._value;
        const currentY = (pan.y as any)._value;
        
        // Keep button within screen bounds (with padding)
        const buttonSize = 60;
        const padding = 10;
        const maxX = width - buttonSize - padding;
        const maxY = height - buttonSize - padding;
        
        let finalX = currentX;
        let finalY = currentY;
        
        // Constrain X
        if (currentX < padding) finalX = padding;
        if (currentX > maxX) finalX = maxX;
        
        // Constrain Y
        if (currentY < padding) finalY = padding;
        if (currentY > maxY) finalY = maxY;
        
        // Animate to final position if needed
        if (finalX !== currentX || finalY !== currentY) {
          Animated.spring(pan, {
            toValue: { x: finalX, y: finalY },
            useNativeDriver: false,
            friction: 7,
            tension: 40,
          }).start();
        }
      },
    })
  ).current;
  
  // Shake detection with improved compatibility
  useEffect(() => {
    if (!isShakeEnabled) return;
    
    let subscription: any;
    let isSubscribed = true;
    
    const startShakeDetection = async () => {
      try {
        console.log('🚀 Starting shake detection...');
        
        // Platform check - only enable on Android/iOS
        if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
          console.log('⚠️ Shake detection only available on mobile devices');
          return;
        }
        
        console.log('✓ Platform check passed:', Platform.OS);
        
        // Check if accelerometer is available with timeout
        const availabilityPromise = Accelerometer.isAvailableAsync();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout checking accelerometer')), 2000)
        );
        
        const isAvailable = await Promise.race([availabilityPromise, timeoutPromise])
          .catch(() => false) as boolean;
        
        if (!isAvailable) {
          console.log('❌ Accelerometer not available on this device');
          return;
        }
        
        console.log('✓ Accelerometer available, threshold:', shakeThreshold);
        
        // Set update interval (60fps) - works on all Android versions
        Accelerometer.setUpdateInterval(16);
        
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          if (!isSubscribed) return;
          
          // Calculate total acceleration (magnitude of acceleration vector)
          const acceleration = Math.sqrt(x * x + y * y + z * z);
          
          // Check if acceleration exceeds threshold
          if (acceleration > shakeThreshold) {
            const currentTime = Date.now();
            
            // Prevent multiple triggers within 1 second
            if (currentTime - lastShakeTime.current > 1000) {
              console.log('🔔 Shake detected! Acceleration:', acceleration.toFixed(2));
              lastShakeTime.current = currentTime;
              
              // Trigger FAB action
              handleShakeTrigger();
            }
          }
        });
      } catch (error) {
        console.log('Shake detection not available:', error);
        // Silently fail - shake is optional feature
      }
    };
    
    const handleShakeTrigger = () => {
      // Show FAB if hidden
      fadeIn();
      resetInactivityTimer();
      
      // Open tech report modal
      setShowTechReportModal(true);
    };
    
    startShakeDetection();
    
    return () => {
      isSubscribed = false;
      if (subscription) {
        try {
          subscription.remove();
        } catch (error) {
          console.log('Error removing accelerometer subscription:', error);
        }
      }
    };
  }, [isShakeEnabled]);
  
  const [closingClassId, setClosingClassId] = useState<string | null>(null);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);

  // Add Student state

  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  const [selectedClassForStudent, setSelectedClassForStudent] = useState<{ id: string; name: string } | null>(null);

  // When set, modal operates in edit mode instead of create
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<any | null>(null);

  const [studentLastName, setStudentLastName] = useState('');
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentMiddleInitial, setStudentMiddleInitial] = useState('');

  const [studentGender, setStudentGender] = useState<'male' | 'female'>('male');

  const [savingStudent, setSavingStudent] = useState(false);

  

  // Student menu and parent info state

  const [studentMenuVisible, setStudentMenuVisible] = useState<string | null>(null);

  const [showParentInfoModal, setShowParentInfoModal] = useState(false);

  // Export menu state

  const [exportMenuVisible, setExportMenuVisible] = useState<string | null>(null);

  

  // Results sorting state

  const [resultsSortBy, setResultsSortBy] = useState<'name' | 'correct' | 'score' | 'remarks' | 'attempts' | 'time'>('attempts');

  const [resultsSortOrder, setResultsSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Quarter filtering state for Results tab
  const [selectedQuarter, setSelectedQuarter] = useState<string>('All Quarters');

  // List modal state

  const [showListModal, setShowListModal] = useState(false);

  // Parents list modal state

  const [showParentsListModal, setShowParentsListModal] = useState(false);

  const [selectedClassForParentsList, setSelectedClassForParentsList] = useState<string | null>(null);

  // Parent info modal state

  const [selectedParentForInfo, setSelectedParentForInfo] = useState<any>(null);

  // List tab sorting state
  const [listSortBy, setListSortBy] = useState<'name' | 'gender'>('gender');
  const [listSortOrder, setListSortOrder] = useState<'asc' | 'desc'>('desc');

  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});

  const [parentsById, setParentsById] = useState<Record<string, any>>({});

  const [assignmentsByClass, setAssignmentsByClass] = useState<Record<string, { total: number; completed: number; pending: number }>>({});

  const [classAnalytics, setClassAnalytics] = useState<Record<string, { 

    performance?: number; 

    change?: number; 

    averageAttempts?: number; 

    averageTime?: number; 

  }>>({});

  const [exerciseResults, setExerciseResults] = useState<Record<string, any[]>>({});



  // Auth state

  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  // Overflow menu state per-class (three dots)

  const [openMenuClassId, setOpenMenuClassId] = useState<string | null>(null);

  // Local navigation state to keep bottom nav persistent

  const [activeTab, setActiveTab] = useState<'home' | 'list' | 'class' | 'exercises' | 'results'>('home');

  

  // Exercises Library state

  const [exercisesTab, setExercisesTab] = useState<'my' | 'public' | 'assigned'>('my');

  const [showAssignForm, setShowAssignForm] = useState(false);

  const [selectedExerciseForAssign, setSelectedExerciseForAssign] = useState<any>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [searchQuery, setSearchQuery] = useState<string>('');



  // Assignment edit/delete modals

  const [showEditAssignmentModal, setShowEditAssignmentModal] = useState(false);

  const [showDeleteAssignmentModal, setShowDeleteAssignmentModal] = useState(false);

  const [editingAssignment, setEditingAssignment] = useState<AssignedExercise | null>(null);

  const [deletingAssignment, setDeletingAssignment] = useState<AssignedExercise | null>(null);

  const [editAssignmentLoading, setEditAssignmentLoading] = useState(false);

  const [editAcceptLateSubmissions, setEditAcceptLateSubmissions] = useState(true);

  const [deleteAssignmentLoading, setDeleteAssignmentLoading] = useState(false);



  // Student completion status modal

  const [showStudentStatusModal, setShowStudentStatusModal] = useState(false);

  const [selectedAssignmentForStatus, setSelectedAssignmentForStatus] = useState<AssignedExercise | null>(null);

  const [completedStudents, setCompletedStudents] = useState<Record<string, string[]>>({}); // assignmentId -> studentIds[]



  // Student performance modal

  const [showStudentPerformanceModal, setShowStudentPerformanceModal] = useState(false);

  const [selectedStudentPerformance, setSelectedStudentPerformance] = useState<any>(null);

  const [selectedExerciseForPerformance, setSelectedExerciseForPerformance] = useState<any>(null);

  // Exercise Result modal (view/edit/delete)
  const [showExerciseResultModal, setShowExerciseResultModal] = useState(false);
  const [selectedExerciseResultId, setSelectedExerciseResultId] = useState<string | null>(null);
  const [selectedExerciseResultData, setSelectedExerciseResultData] = useState<any>(null);
  const [editableQuestionResults, setEditableQuestionResults] = useState<any[]>([]);
  const [editableSummary, setEditableSummary] = useState<any>(null);
  const [loadingExerciseResult, setLoadingExerciseResult] = useState<boolean>(false);
  const [showDeviceInfo, setShowDeviceInfo] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'all' | 'correct' | 'wrong'>('all');
  const [sortMode, setSortMode] = useState<'default' | 'attempts' | 'time' | 'type'>('default');
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [teacherRemarks, setTeacherRemarks] = useState<string>('');
  const [relatedStats, setRelatedStats] = useState<{ previousCount: number; previousAvgScore: number; lastScores: number[] } | null>(null);

  // Helper: show friendly text for values that might be URLs (e.g., image choices)
  const toFriendlyText = (value: any, maxLen: number = 40): string => {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    let out = str;
    if (str.startsWith('http://') || str.startsWith('https://')) {
      try {
        const parts = str.split('/');
        const lastPart = parts[parts.length - 1];
        out = lastPart.split('?')[0];
      } catch {
        out = str;
      }
    }
    if (out.length > maxLen) return out.slice(0, maxLen) + '...';
    return out;
  };

  const isImageUrl = (value: any): boolean => {
    if (!value) return false;
    const s = String(value).toLowerCase();
    return s.startsWith('http://') || s.startsWith('https://');
  };

  const toggleQuestionExpanded = (qid: string) => {
    setExpandedQuestions(prev => ({ ...prev, [qid]: !prev[qid] }));
  };

  const [studentPerformanceData, setStudentPerformanceData] = useState<any>(null);

  const [loadingStudentPerformance, setLoadingStudentPerformance] = useState(false);

  const [geminiAnalysis, setGeminiAnalysis] = useState<any>(null);

  const [classAverages, setClassAverages] = useState<any>(null);

  // Class statistics expansion state
  const [expandedStats, setExpandedStats] = useState<Record<string, boolean>>({});

  // Detailed Statistics Modal state
  const [showDetailedStatsModal, setShowDetailedStatsModal] = useState(false);
  const [selectedExerciseForStats, setSelectedExerciseForStats] = useState<{
    exerciseTitle: string;
    exerciseId: string;
    classId: string;
    exerciseResults: any[];
  } | null>(null);

  // Student results view state
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [detailedStatsData, setDetailedStatsData] = useState<any>(null);
  const [detailedStatsLoading, setDetailedStatsLoading] = useState(false);
  const statsPreparationHandle = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

  useEffect(() => {
    return () => {
      statsPreparationHandle.current?.cancel?.();
    };
  }, []);

  // Helper function to format answers for display based on exercise type
  const formatAnswerForDisplay = useCallback((answer: string, questionType: string): string => {
    if (!answer || answer === 'No answer') return 'No answer';
    
    // Helper function to clean filename
    const cleanFilename = (filename: string): string => {
      return filename
        .replace(/\.(png|jpg|jpeg)$/i, '')
        .replace(/reorder-/g, '')
        .replace(/question-/g, '')
        .replace(/item-/gi, '')
        .replace(/item/gi, '')
        .replace(/^[0-9]+-/, '') // Remove leading numbers with dash
        .replace(/^[0-9]+/, '') // Remove leading numbers
        .replace(/^[A-Za-z]+-/, '') // Remove leading letters with dash
        .replace(/^[A-Za-z]+/, '') // Remove leading letters
        .trim();
    };
    
    // Helper function to make text more readable
    const makeReadable = (text: string): string => {
      return text
        .replace(/_/g, ' ') // Replace underscores with spaces
        .replace(/-/g, ' ') // Replace dashes with spaces
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter
        .join(' ');
    };
    
    // Handle URL-encoded answers
    if (answer.includes('%2F') || answer.includes('exercises%2F')) {
      try {
        const decodedAnswer = decodeURIComponent(answer);
        
        // For re-order questions, show as numbered sequence
        if (questionType.toLowerCase().includes('re-order')) {
          const items = decodedAnswer.split(',').map((item: string, index: number) => {
            const cleanItem = item.trim();
            const parts = cleanItem.split('/');
            const filename = parts[parts.length - 1];
            const cleanNumber = cleanFilename(filename);
            return cleanNumber;
          });
          return items.map((item, index) => `${index + 1}. ${item}`).join(', ');
        }
        
        // For matching questions, show as pairs
        if (questionType.toLowerCase().includes('matching')) {
          const items = decodedAnswer.split(',');
          const pairs = [];
          for (let i = 0; i < items.length; i += 2) {
            if (i + 1 < items.length) {
              const left = makeReadable(cleanFilename(items[i].trim().split('/').pop() || ''));
              const right = makeReadable(cleanFilename(items[i + 1].trim().split('/').pop() || ''));
              pairs.push(`${left} → ${right}`);
            }
          }
          return pairs.join(', ');
        }
        
        // For identification questions, show as clean list
        if (questionType.toLowerCase().includes('identification')) {
          const items = decodedAnswer.split(',');
          return items.map((item: string) => {
            const filename = makeReadable(cleanFilename(item.trim().split('/').pop() || ''));
            return filename;
          }).filter(item => item.length > 0).join(', ');
        }
        
        // For multiple choice questions, show as selected options
        if (questionType.toLowerCase().includes('multiple-choice')) {
          const items = decodedAnswer.split(',');
          return items.map((item: string, index: number) => {
            const filename = makeReadable(cleanFilename(item.trim().split('/').pop() || ''));
            return `Option ${String.fromCharCode(65 + index)}: ${filename}`;
          }).join(', ');
        }
        
        // Default: extract and clean filenames
        const items = decodedAnswer.split(',');
        return items.map((item: string) => {
          const filename = makeReadable(cleanFilename(item.trim().split('/').pop() || ''));
          return filename;
        }).filter(item => item.length > 0).join(', ');
      } catch (error) {
        console.error('Error decoding answer:', error);
        return answer;
      }
    }
    
    // Handle JSON arrays (for re-order questions)
    if (answer.startsWith('[') && answer.endsWith(']')) {
      try {
        const parsedAnswer = JSON.parse(answer);
        if (Array.isArray(parsedAnswer)) {
          if (questionType.toLowerCase().includes('re-order')) {
            return parsedAnswer.map((item: any, index: number) => `${index + 1}. ${item}`).join(', ');
          }
          return parsedAnswer.join(', ');
        }
      } catch (error) {
        console.error('Error parsing JSON answer:', error);
      }
    }
    
    // Handle comma-separated values
    if (answer.includes(',')) {
      const items = answer.split(',').map((item: string, index: number) => {
        const cleanItem = makeReadable(item.trim());
        return `${index + 1}. ${cleanItem}`;
      });
      return items.join(', ');
    }
    
    return makeReadable(answer);
  }, []);

  const buildDetailedStatsData = useCallback((exerciseResults: any[]) => {
    if (!exerciseResults || exerciseResults.length === 0) {
      return null;
    }

    const sanitizedScores = exerciseResults.map((result: any) =>
      typeof result.scorePercentage === 'number' ? result.scorePercentage : 0
    );
    const totalStudents = sanitizedScores.length;
    const safeTotalStudents = Math.max(totalStudents, 1);
    const mps =
      sanitizedScores.reduce((sum: number, score: number) => sum + score, 0) / safeTotalStudents;

    const sortedScores = [...sanitizedScores].sort((a, b) => a - b);
    const median =
      sortedScores.length === 0
        ? 0
        : sortedScores.length % 2 === 0
        ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
        : sortedScores[Math.floor(sortedScores.length / 2)];

    const scoreCounts: Record<number, number> = {};
    sortedScores.forEach((score: number) => {
      const rounded = Math.round(score);
      scoreCounts[rounded] = (scoreCounts[rounded] || 0) + 1;
    });
    const scoreCountKeys = Object.keys(scoreCounts);
    const mode =
      scoreCountKeys.length > 0
        ? parseInt(
            scoreCountKeys.reduce((prev, curr) =>
              scoreCounts[parseInt(prev, 10)] >= scoreCounts[parseInt(curr, 10)] ? prev : curr
            ),
            10
          )
        : 0;

    const variance =
      sanitizedScores.reduce((sum: number, score: number) => sum + Math.pow(score - mps, 2), 0) /
      safeTotalStudents;
    const stdDev = Math.sqrt(variance);

    const highestScore = sanitizedScores.length ? Math.max(...sanitizedScores) : 0;
    const lowestScore = sanitizedScores.length ? Math.min(...sanitizedScores) : 0;
    const range = highestScore - lowestScore;

    const topStudentResult = exerciseResults.find(
      (result: any) => (result.scorePercentage || 0) === highestScore
    );
    const bottomStudentResult = exerciseResults.find(
      (result: any) => (result.scorePercentage || 0) === lowestScore
    );

    const topStudentName =
      topStudentResult?.studentInfo?.name || topStudentResult?.studentName || '—';
    const bottomStudentName =
      bottomStudentResult?.studentInfo?.name || bottomStudentResult?.studentName || '—';

    const passCount = sanitizedScores.filter((score: number) => score >= 75).length;
    const passRate = totalStudents > 0 ? (passCount / totalStudents) * 100 : 0;

    const distribution = {
      highlyProficientCount: sanitizedScores.filter((s) => s >= 85).length,
      proficientCount: sanitizedScores.filter((s) => s >= 75 && s < 85).length,
      nearlyProficientCount: sanitizedScores.filter((s) => s >= 50 && s < 75).length,
      lowProficientCount: sanitizedScores.filter((s) => s >= 25 && s < 50).length,
      notProficientCount: sanitizedScores.filter((s) => s < 25).length,
    };

    const totalAttempts = exerciseResults.reduce((sum: number, result: any) => {
      const attemptsForResult =
        result.questionResults?.reduce(
          (questionSum: number, question: any) => questionSum + (question.attempts || 1),
          0
        ) || 0;
      return sum + attemptsForResult;
    }, 0);

    const questionCount = Math.max(exerciseResults[0]?.questionResults?.length || 0, 1);
    const avgAttemptsPerItem =
      totalStudents > 0 ? (totalAttempts / questionCount) / totalStudents : 0;

    const totalTime = exerciseResults.reduce(
      (sum: number, result: any) => sum + (result.totalTimeSpent || 0),
      0
    );
    const avgTimePerItem =
      totalStudents > 0 ? (totalTime / questionCount) / totalStudents : 0;

    const firstResult = exerciseResults[0];
    let chartData: Array<{ itemNumber: number; avgTime: number; avgScore: number }> = [];
    if (firstResult?.questionResults?.length) {
      chartData = firstResult.questionResults.map((question: any, questionIndex: number) => {
        const questionNumber = question.questionNumber || questionIndex + 1;
        const questionResults = exerciseResults
          .map((result: any) =>
            result.questionResults?.find((q: any) => q.questionId === question.questionId)
          )
          .filter(Boolean);

        const timeSpentArray = questionResults
          .map((q: any) => q.timeSpentSeconds || 0)
          .filter((time: number) => time > 0);

        const avgTime =
          timeSpentArray.length > 0
            ? timeSpentArray.reduce((sum: number, time: number) => sum + time, 0) /
              timeSpentArray.length
            : 0;

        const correctCount = questionResults.filter((q: any) => q.isCorrect).length;
        const avgScore =
          questionResults.length > 0 ? (correctCount / questionResults.length) * 100 : 0;

        return { itemNumber: questionNumber, avgTime, avgScore };
      });
    }

    let itemAnalysis: any[] = [];
    if (firstResult?.questionResults?.length) {
      const answeredQuestions = firstResult.questionResults.filter((question: any) => {
        return exerciseResults.some((result: any) => {
          const qResult = result.questionResults?.find(
            (q: any) => q.questionId === question.questionId
          );
          return qResult && (qResult.studentAnswer || qResult.answer);
        });
      });

      const sortedByScoreDesc = [...exerciseResults].sort(
        (a: any, b: any) => (b.scorePercentage || 0) - (a.scorePercentage || 0)
      );
      const topSegmentCount = Math.max(1, Math.ceil(sortedByScoreDesc.length * 0.27));
      const topPerformers = sortedByScoreDesc.slice(0, topSegmentCount);
      const bottomPerformers = [...sortedByScoreDesc].reverse().slice(0, topSegmentCount);

      itemAnalysis = answeredQuestions
        .map((question: any, questionIndex: number) => {
          let questionType = (question.questionType || 'Unknown').toLowerCase();
          if (questionType.includes('multiple-choice')) questionType = 'Multiple Choice';
          else if (questionType.includes('identification')) questionType = 'Identification';
          else if (questionType.includes('re-order')) questionType = 'Re-order';
          else if (questionType.includes('matching')) questionType = 'Matching';
          else questionType = 'General';

          const questionResults = exerciseResults
            .map((result: any) =>
              result.questionResults?.find((q: any) => q.questionId === question.questionId)
            )
            .filter(Boolean);

          if (questionResults.length === 0) return null;

          const timeSpentArray = questionResults
            .map((q: any) => q.timeSpentSeconds || 0)
            .filter((time: number) => time > 0);

          const avgTimeInSeconds =
            timeSpentArray.length > 0
              ? Math.round(
                  timeSpentArray.reduce((sum: number, time: number) => sum + time, 0) /
                    timeSpentArray.length
                )
              : 0;

          const attemptsArray = questionResults.map((q: any) => q.attempts || 1);
          const avgAttempts =
            attemptsArray.length > 0
              ? attemptsArray.reduce((sum: number, attempts: number) => sum + attempts, 0) /
                attemptsArray.length
              : 1;

          const correctAnswer = question.correctAnswer || question.answer;

          const answerDistribution: Record<string, { count: number; isCorrect: boolean }> = {};
          let totalStudentsAnswered = 0;
          let correctResponses = 0;
          let noAnswerCount = 0;

          exerciseResults.forEach((result: any) => {
            const qResult = result.questionResults?.find(
              (q: any) => q.questionId === question.questionId
            );
            if (qResult && (qResult.studentAnswer || qResult.answer)) {
              totalStudentsAnswered++;
              const rawAnswer = qResult.studentAnswer || qResult.answer;
              const formattedAnswer = formatAnswerForDisplay(
                rawAnswer,
                question.questionType || ''
              );
              let isCorrect = false;
              if (correctAnswer) {
                const formattedCorrectAnswer = formatAnswerForDisplay(
                  correctAnswer,
                  question.questionType || ''
                );
                isCorrect = formattedAnswer === formattedCorrectAnswer;
              } else {
                isCorrect = qResult.isCorrect || false;
              }
              if (isCorrect) {
                correctResponses++;
              }
              if (!answerDistribution[formattedAnswer]) {
                answerDistribution[formattedAnswer] = { count: 0, isCorrect };
              }
              answerDistribution[formattedAnswer].count++;
            } else {
              noAnswerCount++;
            }
          });

          if (noAnswerCount > 0) {
            answerDistribution['No Answer'] = { count: noAnswerCount, isCorrect: false };
          }

          const sortedAnswers = Object.entries(answerDistribution)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([answerText, data]) => ({
              text: answerText,
              count: data.count,
              isCorrect: data.isCorrect,
              percentage:
                totalStudents > 0 ? Math.round((data.count / totalStudents) * 100) : 0,
            }));

          const difficultyIndex =
            totalStudentsAnswered > 0 ? (correctResponses / totalStudentsAnswered) * 100 : 0;

          const topCorrect = topPerformers.filter((result: any) => {
            const qResult = result.questionResults?.find(
              (q: any) => q.questionId === question.questionId
            );
            return qResult?.isCorrect || false;
          }).length;

          const bottomCorrect = bottomPerformers.filter((result: any) => {
            const qResult = result.questionResults?.find(
              (q: any) => q.questionId === question.questionId
            );
            return qResult?.isCorrect || false;
          }).length;

          const discriminationIndex =
            topPerformers.length > 0 && bottomPerformers.length > 0
              ? ((topCorrect / topPerformers.length) -
                  (bottomCorrect / bottomPerformers.length)) *
                100
              : 0;

          return {
            questionId: question.questionId || questionIndex,
            questionNumber: question.questionNumber || questionIndex + 1,
            questionText: question.questionText || `Question ${questionIndex + 1}`,
            questionType,
            avgAttempts,
            avgTimeInSeconds,
            answers: sortedAnswers,
            totalStudents,
            difficultyIndex,
            discriminationIndex,
          };
        })
        .filter(Boolean);
    }

    return {
      totalStudents,
      mps,
      median,
      mode,
      stdDev,
      range,
      highestScore,
      lowestScore,
      topStudentName,
      bottomStudentName,
      passCount,
      passRate,
      distribution,
      avgAttemptsPerItem,
      avgTimePerItem,
      chartData,
      itemAnalysis,
    };
  }, [formatAnswerForDisplay]);

  const prepareDetailedStats = useCallback(
    (exerciseResults: any[]) => {
      statsPreparationHandle.current?.cancel?.();
      setDetailedStatsLoading(true);
      setDetailedStatsData(null);

      // Set a timeout to ensure loading state doesn't hang forever
      const timeoutId = setTimeout(() => {
        console.warn('Statistics preparation taking too long, forcing completion');
        setDetailedStatsLoading(false);
      }, 10000); // 10 second timeout

      statsPreparationHandle.current = InteractionManager.runAfterInteractions(() => {
        try {
          if (!exerciseResults || !Array.isArray(exerciseResults) || exerciseResults.length === 0) {
            throw new Error('Invalid exercise results data');
          }
          const prepared = buildDetailedStatsData(exerciseResults);
          setDetailedStatsData(prepared);
        } catch (error) {
          console.error('Failed to prepare detailed statistics', error);
          // Don't show alert here, let the UI handle it with error state
          setDetailedStatsData(null);
        } finally {
          clearTimeout(timeoutId);
          setDetailedStatsLoading(false);
        }
      });
    },
    [buildDetailedStatsData]
  );

  const handleOpenDetailedStats = (
    exerciseTitle: string,
    classId: string,
    exerciseResults: any[]
  ) => {
    if (!exerciseResults || exerciseResults.length === 0) {
      showAlert('No Data', 'There are no submissions for this exercise yet.', undefined, 'info');
      return;
    }

    const payload = {
      exerciseTitle,
      exerciseId: exerciseResults[0]?.exerciseId || '',
      classId,
      exerciseResults,
    };

    setSelectedExerciseForStats(payload);
    setShowDetailedStatsModal(true);
    prepareDetailedStats(exerciseResults);
  };

  const handleRetryDetailedStats = useCallback(() => {
    if (selectedExerciseForStats?.exerciseResults?.length) {
      prepareDetailedStats(selectedExerciseForStats.exerciseResults);
    }
  }, [prepareDetailedStats, selectedExerciseForStats]);

  const handleCloseDetailedStats = () => {
    statsPreparationHandle.current?.cancel?.();
    setDetailedStatsLoading(false);
    setDetailedStatsData(null);
    setShowDetailedStatsModal(false);
  };

  const formatMillisecondsToLabel = (milliseconds: number) => {
    if (!milliseconds || milliseconds <= 0) return '0s';
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const getAttemptsDescriptor = (value: number) => {
    if (value < 1.5) return 'Excellent';
    if (value < 2.5) return 'Good';
    return 'Fair';
  };

  // Technical Report Modal state

  const [showTechReportModal, setShowTechReportModal] = useState(false);

  const [reportDescription, setReportDescription] = useState('');

  const [reportScreenshots, setReportScreenshots] = useState<string[]>([]);

  const [submittingReport, setSubmittingReport] = useState(false);



  // Date/Time picker state

  const [selectedDate, setSelectedDate] = useState(new Date());

  const [selectedTime, setSelectedTime] = useState(new Date());

  const [newDeadline, setNewDeadline] = useState<string>('');

  

  // Category options
  const categoryOptions = [

    'All',

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



  // Helper function to calculate time remaining until deadline

  const getTimeRemaining = (deadline: string) => {

    const now = new Date();

    const dueDate = new Date(deadline);

    const diffMs = dueDate.getTime() - now.getTime();

    

    if (diffMs <= 0) {

      return { text: 'Overdue', color: '#ef4444', urgent: true };

    }

    

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const diffWeeks = Math.floor(diffDays / 7);

    

    if (diffWeeks > 0) {

      return { 

        text: `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} left`, 

        color: diffWeeks <= 1 ? '#f59e0b' : '#10b981',

        urgent: diffWeeks <= 1

      };

    } else if (diffDays > 0) {

      return { 

        text: `${diffDays} day${diffDays > 1 ? 's' : ''} left`, 

        color: diffDays <= 1 ? '#ef4444' : diffDays <= 3 ? '#f59e0b' : '#10b981',

        urgent: diffDays <= 1

      };

    } else {

      return { 

        text: `${diffHours} hour${diffHours > 1 ? 's' : ''} left`, 

        color: '#ef4444',

        urgent: true

      };

    }

  };



  // Helper function to get student completion stats

  const getStudentCompletionStats = (assignment: AssignedExercise) => {

    const allClassStudents = studentsByClass[assignment.classId] || [];
    const targetStudentIds = assignment.targetStudentIds;
    
    // If targetStudentIds is provided and not empty, filter to only those students
    // Otherwise, use all students in the class
    const classStudents = targetStudentIds && targetStudentIds.length > 0 
      ? allClassStudents.filter((student: any) => targetStudentIds.includes(student.studentId))
      : allClassStudents;

    const totalStudents = classStudents.length;

    

    // Get exercise results for this assignment's exercise

    const classResults = exerciseResults[assignment.classId] || [];

    const assignmentResults = classResults.filter((result: any) => 

      result.exerciseId === assignment.exerciseId

    );

    

    

    // Count students who have completed this exercise using flexible matching

    const completedStudentIds = new Set<string>();

    

    assignmentResults.forEach((result: any) => {

      // Try to find which student this result belongs to

      const matchingStudent = classStudents.find((student: any) => {

        // Strategy 1: Direct studentId match (most reliable)

        if (result.studentId && student.studentId && result.studentId === student.studentId) {
          console.log('[COMPLETION MATCH] Matched by studentId:', result.studentId, 'for student:', student.fullName);
          return true;

        }

        

        // Strategy 2: Firebase parent ID match (new format)

        if (result.parentId && student.parentId && result.parentId === student.parentId) {
          console.log('[COMPLETION MATCH] Matched by parentId:', result.parentId, 'for student:', student.fullName);
          return true;

        }

        

        // Strategy 3: Student name match (fallback for data structure compatibility)

        if (result.studentInfo && result.studentInfo.name && student.fullName) {

          // Normalize names for comparison

          const resultName = result.studentInfo.name.toLowerCase().trim();

          const studentName = student.fullName.toLowerCase().trim();

          if (resultName === studentName) {
            console.log('[COMPLETION MATCH] Matched by name:', studentName);
            return true;

          }

        }

        

        // Strategy 4: Login code match (old format - backward compatibility)

        if (result.parentId && student.parentId) {

          const parentData = parentsById[student.parentId];

          if (parentData && parentData.loginCode && result.parentId === parentData.loginCode) {

            return true;

          }

        }

        

        // Strategy 5: Check if result.parentId matches student's parent login code directly

        if (result.parentId && student.parentId) {

          const parentData = parentsById[student.parentId];

          if (parentData && parentData.loginCode === result.parentId) {

            return true;

          }

        }

        

        return false;

      });

      

      if (matchingStudent) {

        completedStudentIds.add(matchingStudent.studentId);

      } else {
        console.log('[COMPLETION NO MATCH] Could not match result:', {
          resultStudentId: result.studentId,
          resultParentId: result.parentId,
          resultStudentInfo: result.studentInfo,
          availableStudents: classStudents.map((s: any) => ({ 
            id: s.studentId, 
            name: s.fullName,
            parentId: s.parentId 
          }))
        });
      }

    });

    

    const completedCount = completedStudentIds.size;

    

    // Debug logging to help understand completion tracking

    console.log(`[COMPLETION DEBUG] Assignment: ${assignment.exercise?.title}`);

    console.log(`[COMPLETION DEBUG] Class: ${assignment.classId}`);

    console.log(`[COMPLETION DEBUG] Total students: ${totalStudents}`);

    console.log(`[COMPLETION DEBUG] Exercise results found: ${assignmentResults.length}`);

    console.log(`[COMPLETION DEBUG] Completed students: ${completedCount}`);

    console.log(`[COMPLETION DEBUG] Completion percentage: ${totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0}%`);

    

    return {

      completed: completedCount,

      total: totalStudents,

      percentage: totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0

    };

  };



  // Helper function to get individual student status

  const getStudentStatus = (studentId: string, assignment: AssignedExercise) => {

    // Check if student has completed the assignment by looking at ExerciseResults

    const classResults = exerciseResults[assignment.classId] || [];

    

    // Find the student to get their parentId

    const student = studentsByClass[assignment.classId]?.find((s: any) => s.studentId === studentId);

    if (!student) {
      console.log('[STATUS CHECK] Student not found:', studentId);
      return 'pending';
    }

    

    // Check for exercise results using multiple matching strategies

    const studentResult = classResults.find((result: any) => {

      // Must match the exercise
      if (result.exerciseId !== assignment.exerciseId) return false;
      
      // Must match the assignment ID if both are available
      if (result.assignedExerciseId && assignment.id && result.assignedExerciseId !== assignment.id) {
        return false;
      }

      

      // Strategy 1: Try to match by studentId directly (most reliable)

      if (result.studentId && result.studentId === studentId) {
        console.log('[STATUS MATCH] Matched by studentId:', studentId);
        return true;
      }

      

      // Strategy 2: Try to match by studentInfo.name

      if (result.studentInfo?.name && student.fullName) {
        const resultName = result.studentInfo.name.toLowerCase().trim();
        const studentName = student.fullName.toLowerCase().trim();
        if (resultName === studentName) {
          console.log('[STATUS MATCH] Matched by name:', studentName);
          return true;
        }
      }

      

      // Strategy 3: Try to match by Firebase parent ID

      if (result.parentId && student.parentId && result.parentId === student.parentId) {
        console.log('[STATUS MATCH] Matched by parentId:', student.parentId);
        return true;
      }

      

      // Strategy 4: Try to match by login code (old format - backward compatibility)

      const parentData = parentsById[student.parentId];

      if (parentData && parentData.loginCode && result.parentId === parentData.loginCode) {
        console.log('[STATUS MATCH] Matched by login code');
        return true;

      }

      

      return false;

    });

    
    if (!studentResult) {
      console.log('[STATUS CHECK] No result found for student:', {
        studentId,
        studentName: student.fullName,
        exerciseId: assignment.exerciseId,
        availableResults: classResults.length
      });
    }

    

    return studentResult ? 'completed' : 'pending';

  };



  // Function to open student status modal

  const handleShowStudentStatus = (assignment: AssignedExercise) => {

    setSelectedAssignmentForStatus(assignment);

    setShowStudentStatusModal(true);

  };



  // Function to mark a student as completed (for testing purposes)

  const markStudentCompleted = (studentId: string, assignmentId: string) => {

    setCompletedStudents(prev => ({

      ...prev,

      [assignmentId]: [...(prev[assignmentId] || []), studentId]

    }));

  };



  // Function to mark a student as pending (for testing purposes)

  const markStudentPending = (studentId: string, assignmentId: string) => {

    setCompletedStudents(prev => ({

      ...prev,

      [assignmentId]: (prev[assignmentId] || []).filter(id => id !== studentId)

    }));

  };

  

  // Filter and group exercises by category

  const getFilteredAndGroupedExercises = (exercises: any[]) => {

    let filtered = exercises;

    

    // Filter by category

    if (selectedCategory !== 'All') {

      filtered = filtered.filter(exercise => exercise.category === selectedCategory);

    }

    

    // Filter by search query

    if (searchQuery.trim()) {

      filtered = filtered.filter(exercise => 

        exercise.title.toLowerCase().includes(searchQuery.toLowerCase()) ||

        exercise.description.toLowerCase().includes(searchQuery.toLowerCase()) ||

        (exercise.category && exercise.category.toLowerCase().includes(searchQuery.toLowerCase()))

      );

    }

    

    // Group by category

    const grouped = filtered.reduce((acc, exercise) => {

      const category = exercise.category || 'Uncategorized';

      if (!acc[category]) {

        acc[category] = [];

      }

      acc[category].push(exercise);

      return acc;

    }, {} as Record<string, any[]>);

    

    return grouped;

  };

  

  // Use the exercises hook

  const {

    myExercises,

    publicExercises,

    allExercises,

    assignedExercises,

    loading: exercisesLoading,

    error: exercisesError,

    loadMyExercises,

    loadPublicExercises,

    loadAllExercises,

    loadAssignedExercises,

    copyExercise,

    deleteExercise,

    assignExercise,

    deleteAssignment,

    updateAssignmentStatus,

  } = useExercises(currentUserId || null);

  



  useEffect(() => {

    const unsubscribe = onAuthChange((user) => {

      setCurrentUserId(user?.uid);

      if (user?.uid) {

        fetchTeacherData(user.uid);

        loadTeacherClasses(user.uid);

      } else {

        router.replace('/TeacherLogin');

      }

    });

    return unsubscribe;

  }, []);



  // Load exercises when exercises tab becomes active

  useEffect(() => {

    if (activeTab === 'exercises' && currentUserId) {

      // Load all exercises once, then filter as needed

      loadAllExercises();

      

      if (exercisesTab === 'assigned') {

        loadAssignedExercises();

        // Also load assignments to get exercise results

        if (activeClasses.length > 0) {

          loadAssignments(activeClasses.map(c => c.id));

        }

      }

    }

  }, [activeTab, exercisesTab, currentUserId]);



  // Load assignments when activeClasses change to ensure exercise results are available

  useEffect(() => {

    if (activeClasses.length > 0) {

      loadAssignments(activeClasses.map(c => c.id));

    }

  }, [activeClasses]);



  // Also load assignments when the assigned exercises tab becomes active

  useEffect(() => {

    if (activeTab === 'exercises' && exercisesTab === 'assigned' && activeClasses.length > 0) {

      loadAssignments(activeClasses.map(c => c.id));

    }

  }, [activeTab, exercisesTab, activeClasses]);



  const loadTeacherClasses = async (teacherId: string) => {

    try {

      // Primary source of truth: /classes (this is where createClass writes)
      const [{ data: classesData, error: classesErr }, { data: sectionsData }] = await Promise.all([
        readData('/classes'),
        readData('/sections'), // optional: for legacy fields like schoolName/status
      ]);

      if (classesErr) {
        console.error('[LoadTeacherClasses] Error reading classes:', classesErr);
        logError('LoadTeacherClasses', classesErr);
        return;
      }

      // Build a quick lookup for any matching section extras by classId
      const sectionExtrasById: Record<string, any> = Object.fromEntries(
        Object.entries(sectionsData || {}).map(([sid, sv]: any) => [sid, sv || {}])
      );

      const list = Object.entries(classesData || {})
        .map(([id, v]: any) => ({ id, ...(v || {}) }))
        .filter((c: any) => c.teacherId === teacherId)
        .map((c: any) => {
          const extras = sectionExtrasById[c.id] || {};
          return {
            id: c.id,
            name: c.name ?? 'Untitled',
            schoolYear: c.schoolYear ?? extras.schoolYear,
            schoolName: c.schoolName ?? extras.schoolName,
            status: c.status ?? extras.status ?? 'active',
          };
        });

      console.log(`[LoadTeacherClasses] Found ${list.length} classes for teacher ${teacherId}`);

      setTeacherClasses(list);
      setActiveClasses(list.filter((c) => c.status !== 'inactive'));

      // After classes load, refresh related data
      await Promise.all([
        loadStudentsAndParents(list.map((c) => c.id)),
        loadAssignments(list.map((c) => c.id)),
        loadClassAnalytics(list.map((c) => c.id)),
      ]);

    } catch (e: any) {

      console.error('[LoadTeacherClasses] Exception:', e);
      logError('LoadTeacherClasses', e?.message || String(e));

    }

  };



  const formatSchoolYear = (value?: string) => {

    if (!value) return '—';

    const v = String(value);

    if (v.length === 4) return `${v.slice(0, 2)}-${v.slice(2)}`;

    return value;

  };



  const loadStudentsAndParents = async (classIds: string[]) => {

    try {

      const [{ data: students }, { data: parents }, { data: parentLoginCodes }] = [

        await readData('/students'),

        await readData('/parents'),

        await readData('/parentLoginCodes'),

      ];

      

      // Create a reverse lookup map from parentId to loginCode

      const parentIdToLoginCode: Record<string, string> = {};

      if (parentLoginCodes) {

        Object.entries(parentLoginCodes).forEach(([loginCode, parentId]) => {

          if (typeof parentId === 'string') {

            parentIdToLoginCode[parentId] = loginCode;

          }

        });

      }

      

      const parentsMap: Record<string, any> = Object.entries(parents || {}).reduce((acc: any, [id, v]: any) => {

        const parentData = { id, ...(v || {}) };

        // Ensure loginCode is available - try from parent data first, then from reverse lookup

        if (!parentData.loginCode && parentIdToLoginCode[id]) {

          parentData.loginCode = parentIdToLoginCode[id];

        }

        acc[id] = parentData;

        return acc;

      }, {});

      

      

      const grouped: Record<string, any[]> = {};

      Object.entries(students || {}).forEach(([id, v]: any) => {

        const s = { studentId: id, ...(v || {}) };

        if (!classIds.includes(s.classId)) return;

        if (!grouped[s.classId]) grouped[s.classId] = [];

        grouped[s.classId].push(s);

      });

      

      setParentsById(parentsMap);

      setStudentsByClass(grouped);

    } catch (error) {

      console.error('Error loading students and parents:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to load students and parents');
      } else {
        logError('Error loading students and parents: ' + String(error), 'error', 'TeacherDashboard');
      }

    }

  };
  const loadAssignments = async (classIds: string[]) => {

    try {

      // Load assignments, exercise results, students data, parents data, and login codes

      const [{ data: assignmentsData }, { data: exerciseResultsData }, { data: studentsData }, { data: parentsData }, { data: loginCodesData }] = await Promise.all([

        readData('/assignedExercises'),

        readData('/ExerciseResults'),

        readData('/students'),

        readData('/parents'),

        readData('/parentLoginCodes')

      ]);

      

      const stats: Record<string, { total: number; completed: number; pending: number }> = {};

      

      

      // Process assignments

      Object.entries(assignmentsData || {}).forEach(([id, v]: any) => {

        const a = { id, ...(v || {}) };

        if (!classIds.includes(a.classId)) return;

        if (!stats[a.classId]) stats[a.classId] = { total: 0, completed: 0, pending: 0 };

        stats[a.classId].total += 1;

        if (a.status === 'completed') stats[a.classId].completed += 1;

        else stats[a.classId].pending += 1;

      });

      

      // Create a map of parentId to classId from students data

      // This map will include both Firebase parent IDs and login codes for backward compatibility

      const parentToClassMap: Record<string, string> = {};

      Object.entries(studentsData || {}).forEach(([studentId, student]: any) => {

        if (student.parentId && student.classId && classIds.includes(student.classId)) {

          // Map Firebase parent ID to class ID

          parentToClassMap[student.parentId] = student.classId;

          

          // Also map login code to class ID (for backward compatibility)

          const parentData = parentsData?.[student.parentId];

          if (parentData && parentData.loginCode) {

            parentToClassMap[parentData.loginCode] = student.classId;

          }

          

          // Also check if there's a parent record under the login code format (old data structure)

          if (parentData && parentData.parentKey) {

            parentToClassMap[parentData.parentKey] = student.classId;

          }

        }

      });

      

      // Also add reverse mappings from login codes to class IDs

      Object.entries(loginCodesData || {}).forEach(([loginCode, parentId]: any) => {

        // Find which class this parent belongs to

        const student = Object.values(studentsData || {}).find((s: any) => s.parentId === parentId);

        if (student && classIds.includes((student as any).classId)) {

          parentToClassMap[loginCode] = (student as any).classId;

        }

      });

      

      

      // Process exercise results to get more accurate completion counts

      const resultsByClass: Record<string, Set<string>> = {}; // classId -> Set of completed exerciseIds

      const resultsByClassArray: Record<string, any[]> = {}; // classId -> Array of results

      

      Object.entries(exerciseResultsData || {}).forEach(([resultId, result]: any) => {

        // Parse the new result structure
        // Result key format: exerciseId_studentId_timestamp_random
        const keyParts = resultId.split('_');
        let studentId = null;
        
        // Extract studentId from the key (second part)
        if (keyParts.length >= 2) {
          studentId = keyParts[1];
        }
        
        // Also check if studentInfo has the studentId
        if (!studentId && result?.studentInfo?.studentId) {
          studentId = result.studentInfo.studentId;
        }

        // Get data from nested structure
        const exerciseId = result?.exerciseInfo?.exerciseId || result?.exerciseId;
        const classId = result?.assignmentMetadata?.classId || result?.classId;
        const assignedExerciseId = result?.assignedExerciseId || result?.assignmentId || result?.assignmentMetadata?.assignmentId;
        
        // Debug logging
        console.log('[RESULT PARSING]', {
          resultId,
          extractedStudentId: studentId,
          exerciseId,
          classId,
          hasStudentInfo: !!result?.studentInfo,
          studentInfoId: result?.studentInfo?.studentId
        });

        // Create a flattened result object that maintains backward compatibility
        const r = { 
          resultId,
          exerciseId,
          classId,
          studentId,
          assignedExerciseId,
          // Preserve root-level properties (with fallbacks to nested structure)
          exerciseTitle: result?.exerciseTitle || result?.exerciseInfo?.title || result?.exerciseInfo?.exerciseTitle,
          scorePercentage: result?.scorePercentage ?? result?.resultsSummary?.meanPercentageScore,
          totalTimeSpent: result?.totalTimeSpent ?? (result?.resultsSummary?.totalTimeSpentSeconds ? result.resultsSummary.totalTimeSpentSeconds * 1000 : undefined),
          questionResults: result?.questionResults,
          completedAt: result?.completedAt || result?.exerciseSession?.completedAt,
          submittedAt: result?.submittedAt || result?.exerciseSession?.submittedAt,
          studentInfo: result?.studentInfo,
          // Add nested structures for reference
          resultsSummary: result?.resultsSummary,
          exerciseSession: result?.exerciseSession,
          assignmentMetadata: result?.assignmentMetadata,
          exerciseInfo: result?.exerciseInfo,
          deviceInfo: result?.deviceInfo,
          // Keep original parentId for backward compatibility
          parentId: result?.parentId,
        };

        

        if (classId && classIds.includes(classId)) {

          if (!resultsByClass[classId]) resultsByClass[classId] = new Set();

          if (!resultsByClassArray[classId]) resultsByClassArray[classId] = [];

          if (exerciseId) {
            resultsByClass[classId].add(exerciseId);
          }

          resultsByClassArray[classId].push(r);

        }

      });

      

      // Update stats with actual completion data from ExerciseResults
      // An assignment is considered "completed" if:
      // 1. ALL students in the class have completed it, OR
      // 2. The assignment is closed (acceptingStatus !== 'open')

      const assignmentCompletionStatus: Record<string, Set<string>> = {}; // classId -> Set of truly completed assignmentIds
      
      Object.entries(assignmentsData || {}).forEach(([assignmentId, assignment]: any) => {
        const a = { id: assignmentId, ...(assignment || {}) };
        
        if (!classIds.includes(a.classId)) return;
        
        // Count students in this class
        const classStudentCount = Object.values(studentsData || {}).filter((s: any) => 
          s.classId === a.classId
        ).length;
        
        // Count completed students for this assignment
        const assignmentResults = resultsByClassArray[a.classId]?.filter((result: any) => 
          result.exerciseId === a.exerciseId && 
          result.assignedExerciseId === assignmentId
        ) || [];
        
        // Match results to actual students
        const completedStudentIds = new Set<string>();
        assignmentResults.forEach((result: any) => {
          const matchingStudent = Object.values(studentsData || {}).find((student: any) => {
            if (student.classId !== a.classId) return false;
            
            // Try multiple matching strategies
            if (result.studentId && student.studentId === result.studentId) return true;
            if (result.studentInfo?.name && student.fullName && 
                result.studentInfo.name.toLowerCase().trim() === student.fullName.toLowerCase().trim()) return true;
            if (result.parentId && student.parentId === result.parentId) return true;
            
            return false;
          });
          
          if (matchingStudent) {
            completedStudentIds.add((matchingStudent as any).studentId);
          }
        });
        
        const allStudentsCompleted = classStudentCount > 0 && completedStudentIds.size >= classStudentCount;
        const assignmentClosed = a.acceptingStatus !== 'open';
        
        // Debug logging
        console.log('[ASSIGNMENT COMPLETION CHECK]', {
          assignmentId,
          exerciseTitle: a.exercise?.title,
          classId: a.classId,
          totalStudents: classStudentCount,
          completedStudents: completedStudentIds.size,
          allStudentsCompleted,
          acceptingStatus: a.acceptingStatus,
          assignmentClosed,
          isCompleted: allStudentsCompleted || assignmentClosed
        });
        
        // Assignment is completed if all students finished OR teacher closed it
        if (allStudentsCompleted || assignmentClosed) {
          if (!assignmentCompletionStatus[a.classId]) {
            assignmentCompletionStatus[a.classId] = new Set();
          }
          assignmentCompletionStatus[a.classId].add(assignmentId);
        }
      });

      // Update stats based on true completion status
      Object.entries(assignmentCompletionStatus).forEach(([classId, completedAssignmentIds]) => {
        if (stats[classId]) {
          stats[classId].completed = completedAssignmentIds.size;
          stats[classId].pending = Math.max(0, stats[classId].total - completedAssignmentIds.size);
        }
      });
      
      // Ensure all classes have proper counts even if no assignments are completed
      Object.keys(stats).forEach(classId => {
        if (!assignmentCompletionStatus[classId]) {
          stats[classId].completed = 0;
          stats[classId].pending = stats[classId].total;
        }
      });

      

      

      setAssignmentsByClass(stats);

      setExerciseResults(resultsByClassArray);

      

    } catch (error) {

      console.error('Error loading assignments:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to load assignments');
      } else {
        logError('Error loading assignments: ' + String(error), 'error', 'TeacherDashboard');
      }

      setAssignmentsByClass({});

      setExerciseResults({});

    }

  };



  const loadClassAnalytics = async (classIds: string[]) => {

    try {

      // Get class analytics data

      const { data: analyticsData } = await readData('/classAnalytics');

      const { data: exerciseResults } = await readData('/ExerciseResults');

      

      const map: Record<string, any> = {};

      

      // Process each class

      for (const classId of classIds) {

        const classAnalytics = analyticsData?.[classId] || {};

        

        // Calculate average attempts and time from exercise results

        if (exerciseResults) {

          // Parse results with new structure
          const parsedResults = Object.entries(exerciseResults).map(([resultId, result]: any) => {
            const keyParts = resultId.split('_');
            const extractedStudentId = keyParts.length >= 2 ? keyParts[1] : null;
            
            return {
              resultId,
              exerciseId: result?.exerciseInfo?.exerciseId || result?.exerciseId,
              classId: result?.assignmentMetadata?.classId || result?.classId,
              studentId: extractedStudentId || result?.studentId,
              exerciseTitle: result?.exerciseTitle || result?.exerciseInfo?.title || result?.exerciseInfo?.exerciseTitle,
              scorePercentage: result?.scorePercentage ?? result?.resultsSummary?.meanPercentageScore,
              totalTimeSpent: result?.totalTimeSpent ?? (result?.resultsSummary?.totalTimeSpentSeconds ? result.resultsSummary.totalTimeSpentSeconds * 1000 : undefined),
              questionResults: result?.questionResults,
              studentInfo: result?.studentInfo,
              resultsSummary: result?.resultsSummary,
            };
          });

          const classResults = parsedResults.filter((result: any) => 

            result.classId === classId

          );

          

          if (classResults.length > 0) {

            let totalAttempts = 0;

            let totalTime = 0;

            let totalQuestions = 0;

            

            // More accurate class analytics calculation
            classResults.forEach((result: any) => {
              if (result.questionResults) {
                result.questionResults.forEach((q: any) => {
                  // Use actual attempts if available, otherwise default to 1
                  const attempts = q.attempts || 1;
                  totalAttempts += attempts;
                  
                  // Use actual time spent if available
                  const timeSpent = q.timeSpent || 0;
                  totalTime += timeSpent;
                  
                  totalQuestions++;
                });
              }
            });

            if (totalQuestions > 0) {
              // More accurate average calculations
              classAnalytics.averageAttempts = Math.round((totalAttempts / totalQuestions) * 10) / 10;
              classAnalytics.averageTime = Math.round(totalTime / classResults.length); // Average time per exercise
            }

          }

        }

        

        map[classId] = classAnalytics;

      }

      

      setClassAnalytics(map);

    } catch (error) {

      console.error('Error loading class analytics:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to load class analytics');
      } else {
        logError('Error loading class analytics: ' + String(error), 'error', 'TeacherDashboard');
      }

      setClassAnalytics({});

    }

  };



  const handleDeleteExercise = async (exerciseId: string) => {

    showAlert(

      'Delete Exercise',

      'Are you sure you want to delete this exercise? This action cannot be undone.',

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Delete',

          style: 'destructive',

          onPress: async () => {

            try {

              await deleteExercise(exerciseId);

              showAlert('Success', 'Exercise deleted successfully', undefined, 'success');

            } catch (error) {

              showAlert('Error', 'Failed to delete exercise', undefined, 'error');
              if (error instanceof Error) {
                logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to delete exercise');
              } else {
                logError('Failed to delete exercise: ' + String(error), 'error', 'TeacherDashboard');
              }

            }

          },

        },

      ],

      'warning'

    );

  };



  const handleCopyExercise = async (exercise: any) => {

    try {

      const teacherName = teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Unknown Teacher';

      await copyExercise(exercise, currentUserId!, teacherName);

      showAlert('Success', 'Exercise copied to My Exercises', undefined, 'success');

    } catch (error) {

      showAlert('Error', 'Failed to copy exercise', undefined, 'error');
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to copy exercise');
      } else {
        logError('Failed to copy exercise: ' + String(error), 'error', 'TeacherDashboard');
      }

    }

  };



  const handleEditPublicExercise = async (exercise: any) => {

    try {

      // Navigate to CreateExercise with the exercise ID for editing

      router.push({

        pathname: '../CreateExercise',

        params: {

          edit: exercise.id

        }

      });

    } catch (error) {

      showAlert('Error', 'Failed to open exercise for editing', undefined, 'error');
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to open exercise for editing');
      } else {
        logError('Failed to open exercise for editing: ' + String(error), 'error', 'TeacherDashboard');
      }

    }

  };



  const handleDeletePublicExercise = async (exercise: any) => {

    try {

      // Delete the exercise from the main exercises collection

      const { error } = await deleteData(`/exercises/${exercise.id}`);

      if (error) {

        showAlert('Error', 'Failed to delete exercise', undefined, 'error');

        return;

      }

      

      // Find and delete all private copies that reference this exercise

      const { data: allExercisesData } = await readData('/exercises');

      if (allExercisesData) {

        const exercisesToDelete = Object.entries(allExercisesData)

          .filter(([_, ex]: [string, any]) => ex.originalExerciseId === exercise.id)

          .map(([id, _]) => id);

        

        // Delete all private copies

        for (const exerciseId of exercisesToDelete) {

          await deleteData(`/exercises/${exerciseId}`);

        }

      }

      

      showAlert('Success', 'Exercise and all copies deleted successfully', undefined, 'success');

      

      // Refresh all exercises

      loadAllExercises();

    } catch (error) {

      showAlert('Error', 'Failed to delete exercise', undefined, 'error');

    }

  };



  const handleAssignExercise = async (
    classIds: string[],
    deadline: string,
    acceptLateSubmissions: boolean,
    quarter: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4',
    targetStudentIds?: string[]
  ) => {

    try {

      // Check for existing assignments and add students to them instead of creating duplicates
      if (selectedExerciseForAssign?.id) {
        const assignmentsToUpdate: Array<{ assignmentId: string; classId: string; className: string; newStudents: string[] }> = [];
        const newAssignments: string[] = [];
        const currentTargets = Array.isArray(targetStudentIds) && targetStudentIds.length > 0 ? new Set(targetStudentIds) : null;
        
        classIds.forEach((cid) => {
          const existing = assignedExercises.filter((a: any) => a.classId === cid && a.exerciseId === selectedExerciseForAssign.id);
          const classInfo = teacherClasses.find((c) => c.id === cid);
          const className = classInfo?.name || 'Class';
          
          if (existing.length > 0) {
            // Found existing assignment(s) - check if we can add students to them
            const existingAssignment = existing[0]; // Use the first existing assignment
            const existingTargets: string[] | null = Array.isArray(existingAssignment.targetStudentIds) && existingAssignment.targetStudentIds.length > 0 ? existingAssignment.targetStudentIds : null;
            
            if (currentTargets) {
              // Adding specific students to existing assignment
              const newStudents = Array.from(currentTargets).filter(studentId => 
                !existingTargets || !existingTargets.includes(studentId)
              );
              
              if (newStudents.length > 0) {
                assignmentsToUpdate.push({
                  assignmentId: existingAssignment.id,
                  classId: cid,
                  className,
                  newStudents
                });
              } else {
                // All students already assigned
                showAlert(
                  'Students Already Assigned',
                  `All selected students are already assigned to "${selectedExerciseForAssign.title}" in ${className}.`,
                  undefined,
                  'info'
                );
                return;
              }
            } else {
              // Trying to assign whole class to existing assignment
              if (!existingTargets) {
                // Both are whole class - exact duplicate
                showAlert(
                  'Assignment Already Exists',
                  `"${selectedExerciseForAssign.title}" is already assigned to the entire ${className}.`,
                  undefined,
                  'info'
                );
                return;
              } else {
                // Convert existing targeted assignment to whole class
                assignmentsToUpdate.push({
                  assignmentId: existingAssignment.id,
                  classId: cid,
                  className,
                  newStudents: [] // Empty array means convert to whole class
                });
              }
            }
          } else {
            // No existing assignment - create new one
            newAssignments.push(cid);
          }
        });

        // Update existing assignments with new students
        for (const update of assignmentsToUpdate) {
          try {
            const { data: currentAssignment } = await readData(`/assignedExercises/${update.assignmentId}`);
            if (!currentAssignment) continue;

            let updatedTargets: string[] | null = null;
            
            if (update.newStudents.length === 0) {
              // Convert to whole class assignment
              updatedTargets = null;
            } else {
              // Add new students to existing targets
              const existingTargets = Array.isArray(currentAssignment.targetStudentIds) ? currentAssignment.targetStudentIds : [];
              updatedTargets = [...existingTargets, ...update.newStudents];
            }

            const updatedAssignment = {
              ...currentAssignment,
              targetStudentIds: updatedTargets
            };

            await updateData(`/assignedExercises/${update.assignmentId}`, updatedAssignment);
            
            console.log(`[UpdateAssignment] Added ${update.newStudents.length} students to assignment ${update.assignmentId} in ${update.className}`);
          } catch (error) {
            console.error(`[UpdateAssignment] Failed to update assignment ${update.assignmentId}:`, error);
          }
        }

        // Create new assignments for classes without existing assignments
        if (newAssignments.length > 0) {
          await assignExercise(
            selectedExerciseForAssign.id,
            newAssignments,
            deadline,
            currentUserId!,
            acceptLateSubmissions,
            'open',
            quarter,
            targetStudentIds
          );
        }

        // Refresh assigned exercises to show updated student lists
        await loadAssignedExercises();
        
        // Also refresh assignments data to update completion statistics
        if (activeClasses.length > 0) {
          await loadAssignments(activeClasses.map(c => c.id));
        }

        // Show success message
        const totalUpdated = assignmentsToUpdate.length;
        const totalNew = newAssignments.length;
        
        if (totalUpdated > 0 && totalNew > 0) {
          showAlert('Success', `Added students to ${totalUpdated} existing assignment(s) and created ${totalNew} new assignment(s)`, undefined, 'success');
        } else if (totalUpdated > 0) {
          showAlert('Success', `Added students to ${totalUpdated} existing assignment(s)`, undefined, 'success');
        } else if (totalNew > 0) {
          showAlert('Success', `Created ${totalNew} new assignment(s)`, undefined, 'success');
        }

        return; // Exit early since we handled the assignment
      }

      // This code is now handled above in the existing assignment logic
      // Only create new assignments if no existing assignments were found
      await assignExercise(
        selectedExerciseForAssign.id,
        classIds,
        deadline,
        currentUserId!,
        acceptLateSubmissions,
        'open',
        quarter,
        targetStudentIds
      );

      showAlert('Success', 'Exercise assigned successfully', undefined, 'success');

    } catch (error) {

      showAlert('Error', 'Failed to assign exercise', undefined, 'error');

    }

  };
  const handleEditAssignment = (assignment: AssignedExercise) => {

    setEditingAssignment(assignment);

    setNewDeadline(assignment.deadline || '');

    setEditAcceptLateSubmissions(assignment.acceptLateSubmissions ?? true);

    

    // Initialize date/time pickers with current deadline or current date/time

    if (assignment.deadline) {

      const deadlineDate = new Date(assignment.deadline);

      setSelectedDate(deadlineDate);

      setSelectedTime(deadlineDate);

    } else {

      const now = new Date();

      setSelectedDate(now);

      setSelectedTime(now);

    }

    

    setShowEditAssignmentModal(true);

  };



  const handleDeleteAssignment = (assignment: AssignedExercise) => {

    setDeletingAssignment(assignment);

    setShowDeleteAssignmentModal(true);

  };



  const handleToggleAcceptingStatus = async (assignment: AssignedExercise) => {

    try {

      const newStatus = assignment.acceptingStatus === 'closed' ? 'open' : 'closed';

      const statusText = newStatus === 'closed' ? 'close' : 'reopen';

      

      showAlert(

        `${statusText.charAt(0).toUpperCase() + statusText.slice(1)} Assignment`,

        `Are you sure you want to ${statusText} "${assignment.exercise?.title}" for ${assignment.className}?`,

        [

          { text: 'Cancel', style: 'cancel' },

          { 

            text: statusText.charAt(0).toUpperCase() + statusText.slice(1), 

            onPress: async () => {

              await updateAssignmentStatus(assignment.id, newStatus);

              showAlert(

                'Success', 

                `Assignment ${newStatus === 'closed' ? 'closed' : 'reopened'} successfully`,

                undefined,

                'success'

              );

            }

          }

        ]

      );

    } catch (error) {

      showAlert('Error', 'Failed to update assignment status', undefined, 'error');

    }

  };



  const confirmDeleteAssignment = async () => {

    if (!deletingAssignment) return;

    

    setDeleteAssignmentLoading(true);

    try {

      await deleteAssignment(deletingAssignment.id);

      setShowDeleteAssignmentModal(false);

      setDeletingAssignment(null);

      // The useExercises hook will automatically refresh the list

    } catch (error) {

      showAlert('Error', 'Failed to delete assignment', undefined, 'error');

    } finally {

      setDeleteAssignmentLoading(false);

    }

  };



  const updateDeadline = (date: Date, time: Date) => {

    const combinedDateTime = new Date(date);

    combinedDateTime.setHours(time.getHours());

    combinedDateTime.setMinutes(time.getMinutes());

    setNewDeadline(combinedDateTime.toISOString());

  };



  const saveEditAssignment = async () => {

    if (!editingAssignment) return;

    

    setEditAssignmentLoading(true);

    try {

      // Get current assignment data

      const { data: currentAssignment } = await readData(`/assignedExercises/${editingAssignment.id}`);

      if (!currentAssignment) {

        throw new Error('Assignment not found');

      }



      // Update the assignment with new deadline and late submissions setting

      const updatedAssignment = {

        ...currentAssignment,

        deadline: newDeadline,

        acceptLateSubmissions: editAcceptLateSubmissions,

        updatedAt: new Date().toISOString(),

      };



      const { success, error } = await writeData(`/assignedExercises/${editingAssignment.id}`, updatedAssignment);

      

      if (success) {

        setShowEditAssignmentModal(false);

        setEditingAssignment(null);

        setNewDeadline('');

        setEditAcceptLateSubmissions(true);

        // Refresh the assigned exercises list

        await loadAssignedExercises();

        showAlert('Success', 'Assignment updated successfully', undefined, 'success');

      } else {

        showAlert('Error', error || 'Failed to update assignment', undefined, 'error');

      }

    } catch (error) {

      showAlert('Error', 'Failed to update assignment', undefined, 'error');

    } finally {

      setEditAssignmentLoading(false);

    }

  };



  const escapeHtml = (value: string) =>

    value

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;')

      .replace(/'/g, '&#39;');



  // Helper function to calculate individual student metrics

  const calculateStudentMetrics = (resultData: any) => {

    const questionResults = resultData.questionResults || [];

    const totalQuestions = questionResults.length;

    

    if (totalQuestions === 0) {

      return {

        efficiencyScore: 0,

        consistencyScore: 0,

        masteryScore: 0,

        overallScore: 0,

        totalAttempts: 0,

        totalTime: 0,

        avgAttemptsPerQuestion: 0,

        avgTimePerQuestion: 0

      };

    }

    

    // Calculate efficiency score (lower attempts and time = higher score)

    const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

    const totalTime = resultData.totalTimeSpent || 0;

    const avgAttemptsPerQuestion = totalAttempts / totalQuestions;

    const avgTimePerQuestion = totalTime / totalQuestions;

    

    // Calculate consistency score (how consistent performance is across questions)

    const attemptVariance = questionResults.reduce((sum: number, q: any) => {

      const deviation = Math.abs((q.attempts || 1) - avgAttemptsPerQuestion);

      return sum + (deviation * deviation);

    }, 0) / totalQuestions;

    

    const timeVariance = questionResults.reduce((sum: number, q: any) => {

      const deviation = Math.abs((q.timeSpent || 0) - avgTimePerQuestion);

      return sum + (deviation * deviation);

    }, 0) / totalQuestions;

    

    // Calculate mastery score based on actual performance (same as parent dashboard)

    const correctAnswers = questionResults.length; // All questions are correct since student completed

    const masteryScore = Math.round((correctAnswers / totalQuestions) * 100);

    

    // Improved efficiency scoring with more granular scale (same as parent dashboard)

    let efficiencyScore;

    if (avgAttemptsPerQuestion <= 1) {

      efficiencyScore = 100; // Perfect efficiency

    } else if (avgAttemptsPerQuestion <= 1.5) {

      efficiencyScore = 90; // Excellent efficiency

    } else if (avgAttemptsPerQuestion <= 2) {

      efficiencyScore = 80; // Good efficiency

    } else if (avgAttemptsPerQuestion <= 2.5) {

      efficiencyScore = 70; // Fair efficiency

    } else if (avgAttemptsPerQuestion <= 3) {

      efficiencyScore = 60; // Poor efficiency

    } else {

      efficiencyScore = Math.max(40, 100 - (avgAttemptsPerQuestion - 1) * 15); // Decreasing score

    }

    

    // Improved consistency scoring (same as parent dashboard)

    let consistencyScore;

    if (attemptVariance <= 0.1) {

      consistencyScore = 100; // Perfect consistency

    } else if (attemptVariance <= 0.25) {

      consistencyScore = 90; // Excellent consistency

    } else if (attemptVariance <= 0.5) {

      consistencyScore = 80; // Good consistency

    } else if (attemptVariance <= 1.0) {

      consistencyScore = 70; // Fair consistency

    } else if (attemptVariance <= 1.5) {

      consistencyScore = 60; // Poor consistency

    } else {

      consistencyScore = Math.max(40, 100 - attemptVariance * 20); // Decreasing score

    }

    

    // Calculate overall score with better weighting (same as parent dashboard)

    const overallScore = Math.round(

      (efficiencyScore * 0.5) +  // Increased weight for efficiency

      (consistencyScore * 0.3) + 

      (masteryScore * 0.2)       // Reduced weight for mastery since it's often 100%

    );

    

    return {

      efficiencyScore: Math.round(efficiencyScore),

      consistencyScore: Math.round(consistencyScore),

      masteryScore: Math.round(masteryScore),

      overallScore,

      totalAttempts,

      totalTime,

      avgAttemptsPerQuestion: Math.round(avgAttemptsPerQuestion * 10) / 10,

      avgTimePerQuestion: Math.round(avgTimePerQuestion)

    };

  };



  // Function to load student performance data

  const loadStudentPerformance = async (studentId: string, exerciseId: string, classId: string) => {

    try {

      setLoadingStudentPerformance(true);

      

      // Get the student's result for this exercise

      const { data: allResults } = await readData('/ExerciseResults');

      if (!allResults) return;



      // Parse results with new structure
      const results = Object.entries(allResults).map(([resultId, result]: any) => {
        // Extract studentId from key format: exerciseId_studentId_timestamp_random
        const keyParts = resultId.split('_');
        const extractedStudentId = keyParts.length >= 2 ? keyParts[1] : null;
        
        return {
          resultId,
          exerciseId: result?.exerciseInfo?.exerciseId || result?.exerciseId,
          classId: result?.assignmentMetadata?.classId || result?.classId,
          studentId: extractedStudentId || result?.studentId,
          exerciseTitle: result?.exerciseTitle || result?.exerciseInfo?.title || result?.exerciseInfo?.exerciseTitle,
          scorePercentage: result?.scorePercentage ?? result?.resultsSummary?.meanPercentageScore,
          totalTimeSpent: result?.totalTimeSpent ?? (result?.resultsSummary?.totalTimeSpentSeconds ? result.resultsSummary.totalTimeSpentSeconds * 1000 : undefined),
          questionResults: result?.questionResults,
          completedAt: result?.completedAt || result?.exerciseSession?.completedAt,
          submittedAt: result?.submittedAt || result?.exerciseSession?.submittedAt,
          studentInfo: result?.studentInfo,
          resultsSummary: result?.resultsSummary,
          exerciseSession: result?.exerciseSession,
          assignmentMetadata: result?.assignmentMetadata,
          exerciseInfo: result?.exerciseInfo,
          deviceInfo: result?.deviceInfo,
        };
      });

      const studentResult = results.find((result: any) => 

        result.exerciseId === exerciseId && 

        result.classId === classId && 

        result.studentId === studentId

      );



      if (!studentResult) {

        showAlert('No Data', 'No performance data found for this student.', undefined, 'warning');

        return;

      }



      // Get exercise data

      const { data: exerciseData } = await readData(`/exercises/${exerciseId}`);

      if (!exerciseData) {

        showAlert('Error', 'Exercise data not found.', undefined, 'error');

        return;

      }



      // Calculate performance metrics

      const performanceMetrics = calculateStudentMetrics(studentResult);

      

      // Get class comparison data

      const sameExerciseResults = results.filter((result: any) =>

        result.exerciseId === exerciseId &&

        result.classId === classId &&

        result.studentId !== studentId // Exclude current student's result

      );



      let classStats = null;

      if (sameExerciseResults.length > 0) {

        const classMetrics = sameExerciseResults.map((result: any) => calculateStudentMetrics(result));

        classStats = {

          averageEfficiency: classMetrics.reduce((sum, m) => sum + m.efficiencyScore, 0) / classMetrics.length,

          averageConsistency: classMetrics.reduce((sum, m) => sum + m.consistencyScore, 0) / classMetrics.length,

          averageMastery: classMetrics.reduce((sum, m) => sum + m.masteryScore, 0) / classMetrics.length,

          averageOverall: classMetrics.reduce((sum, m) => sum + m.overallScore, 0) / classMetrics.length,

        };

      }



      // Determine performance level

      let performanceLevel = 'needs_improvement';

      if (performanceMetrics.overallScore >= 85) performanceLevel = 'excellent';

      else if (performanceMetrics.overallScore >= 70) performanceLevel = 'good';

      else if (performanceMetrics.overallScore >= 50) performanceLevel = 'fair';



      // Calculate class averages for comparison

      let classAveragesData = null;

      if (sameExerciseResults.length > 0) {

        const totalClassScore = sameExerciseResults.reduce((sum: number, result: any) => sum + (result.scorePercentage || 0), 0);

        const totalClassTime = sameExerciseResults.reduce((sum: number, result: any) => sum + (result.totalTimeSpent || 0), 0);

        

        // Calculate question-level averages

        const questionAverages: any = {};

        const questionIds = new Set<string>();

        

        // Collect all question IDs from all results

        sameExerciseResults.forEach((result: any) => {

          if (result.questionResults) {

            result.questionResults.forEach((q: any) => {

              questionIds.add(q.questionId);

            });

          }

        });

        

        // Calculate averages for each question

        questionIds.forEach(questionId => {

          const questionResults = sameExerciseResults

            .map((result: any) => result.questionResults?.find((q: any) => q.questionId === questionId))

            .filter(Boolean);

          

          if (questionResults.length > 0) {

            const totalTime = questionResults.reduce((sum: number, q: any) => sum + (q.timeSpent || 0), 0);

            const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

            

            questionAverages[questionId] = {

              averageTime: totalTime / questionResults.length,

              averageAttempts: totalAttempts / questionResults.length,

              totalStudents: questionResults.length

            };

          }

        });

        

        classAveragesData = {

          averageScore: totalClassScore / sameExerciseResults.length,

          averageTime: totalClassTime / sameExerciseResults.length,

          totalStudents: sameExerciseResults.length,

          questionAverages

        };

      }



      setClassAverages(classAveragesData);



      setStudentPerformanceData({

        studentResult,

        exerciseData,

        performanceMetrics,

        classStats,

        performanceLevel,

        totalStudents: sameExerciseResults.length + 1

      });



      // Generate Gemini analysis

      const analysis = await generateGeminiAnalysis(studentResult, classAveragesData);

      setGeminiAnalysis(analysis);



    } catch (error) {

      console.error('Error loading student performance:', error);

      showAlert('Error', 'Failed to load student performance data.', undefined, 'error');

    } finally {

      setLoadingStudentPerformance(false);

    }

  };



  // Legacy Gemini analysis implementation (kept for reference)

  const legacyGenerateGeminiAnalysis = async (resultData: any, classAverages: any, retryCount: number = 0): Promise<any> => {

    const maxRetries = 3;

    const retryDelay = 1000 * (retryCount + 1); // Exponential backoff: 1s, 2s, 3s

    

    try {

      const geminiApiKey = "AIzaSyDsUXZXUDTMRQI0axt_A9ulaSe_m-HQvZk";

      

      // Prepare performance data for analysis

      const performanceData = {

        score: resultData.scorePercentage,

        totalQuestions: resultData.totalQuestions,

        timeSpent: resultData.totalTimeSpent,

        questionResults: resultData.questionResults || [],

        classAverage: classAverages?.averageScore || 0,

        classAverageTime: classAverages?.averageTime || 0

      };

      

      const prompt = `You are an expert educational psychologist analyzing a Grade 1 student's math exercise performance. Provide a comprehensive analysis in JSON format.



STUDENT PERFORMANCE DATA:

- Score: ${performanceData.score}%

- Total Questions: ${performanceData.totalQuestions}

- Time Spent: ${Math.round(performanceData.timeSpent / 1000)} seconds

- Class Average Score: ${Math.round(performanceData.classAverage)}%

- Class Average Time: ${Math.round(performanceData.classAverageTime)} seconds
DETAILED QUESTION RESULTS:

${performanceData.questionResults.map((q: any, idx: number) => {

  const classAvg = classAverages?.questionAverages?.[q.questionId];

  return `Question ${q.questionNumber}: ${q.isCorrect ? 'CORRECT' : 'INCORRECT'} (${q.attempts} attempts, ${Math.round(q.timeSpent / 1000)}s)

   Question Text: "${q.questionText}"

   Question Type: ${q.questionType}

   ${q.options && q.options.length > 0 ? `Options: ${q.options.join(', ')}` : ''}

   Student Answer: "${q.studentAnswer}"

   Correct Answer: "${q.correctAnswer}"

   ${q.questionImage ? `Image: ${q.questionImage}` : ''}

   

   ENHANCED PERFORMANCE DATA:

   - Difficulty Level: ${q.metadata?.difficulty || 'medium'}

   - Topic Tags: ${q.metadata?.topicTags?.join(', ') || 'none'}

   - Cognitive Load: ${q.metadata?.cognitiveLoad || 'medium'}

   - Question Complexity: ${q.metadata?.questionComplexity || 'medium'}

   - Total Hesitation Time: ${Math.round((q.totalHesitationTime || 0) / 1000)}s

   - Average Confidence: ${q.averageConfidence?.toFixed(1) || '2.0'} (1=low, 2=medium, 3=high)

   - Significant Changes: ${q.significantChanges || 0}

   - Phase Distribution: Reading(${q.phaseDistribution?.reading || 0}), Thinking(${q.phaseDistribution?.thinking || 0}), Answering(${q.phaseDistribution?.answering || 0}), Reviewing(${q.phaseDistribution?.reviewing || 0})

   

   INTERACTION PATTERNS:

   - Total Interactions: ${q.totalInteractions || 0}

   - Option Clicks: ${q.interactionTypes?.optionClicks || 0}

   - Help Used: ${q.interactionTypes?.helpUsed || 0} (Help Button: ${q.helpUsage?.helpButtonClicks || 0})

   - Answer Changes: ${q.interactionTypes?.answerChanges || 0}

   

   TIME BREAKDOWN:

   - Reading Time: ${Math.round((q.timeBreakdown?.readingTime || 0) / 1000)}s

   - Thinking Time: ${Math.round((q.timeBreakdown?.thinkingTime || 0) / 1000)}s

   - Answering Time: ${Math.round((q.timeBreakdown?.answeringTime || 0) / 1000)}s

   - Reviewing Time: ${Math.round((q.timeBreakdown?.reviewingTime || 0) / 1000)}s

   - Time to First Answer: ${Math.round((q.timeToFirstAnswer || 0) / 1000)}s

   ${q.attemptHistory && q.attemptHistory.length > 0 ? `

   ATTEMPT HISTORY:

   ${q.attemptHistory.map((attempt: any, attemptIdx: number) => 

     `   Attempt ${attemptIdx + 1}: "${attempt.answer || 'blank'}" (${Math.round((attempt.timeSpent || 0) / 1000)}s)`

   ).join('\n')}` : ''}

   

   ${classAvg ? `CLASS AVERAGE: ${Math.round(classAvg.averageTime / 1000)}s, ${Math.round(classAvg.averageAttempts)} attempts` : '- Performance ranking data not available'}`;

}).join('\n\n')}



IMPORTANT: Respond with ONLY valid JSON. Do not include any markdown formatting, code blocks, or additional text. Return only the JSON object.



Required JSON format:

{

  "strengths": ["strength1", "strength2", "strength3"],

  "weaknesses": ["weakness1", "weakness2", "weakness3"],

  "questionAnalysis": ["analysis1", "analysis2", "analysis3"],

  "timeAnalysis": {

    "description": "Time analysis description",

    "studentTime": ${Math.round(performanceData.timeSpent / 1000)},

    "classAverage": ${Math.round(performanceData.classAverageTime)}

  },

  "recommendations": ["recommendation1", "recommendation2", "recommendation3"],

  "encouragement": "Encouraging message for the student"

}



Focus on:

1. Mathematical concepts mastered

2. Areas needing improvement

3. Time management skills

4. Specific question performance

5. Age-appropriate recommendations

6. Positive reinforcement
LANGUAGE RULES:
- Always spell out all numbers in proper modern Tagalog words (hal. 12 → "labindalawa", 21 → "dalawampu't isa").
- Iwasan ang digits na hinaluan ng Tagalog o Spanish shortcuts gaya ng "dose" o "bente".

Remember: Return ONLY the JSON object, no markdown, no code blocks, no additional text.`;



      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          contents: [{

            parts: [{

              text: prompt

            }]

          }],

          generationConfig: {

            temperature: 0.7,

            topK: 40,

            topP: 0.95,

            maxOutputTokens: 2048,

          }

        })

      });



      if (!response.ok) {

        const errorText = await response.text();

        console.warn(`Gemini API error (attempt ${retryCount + 1}): ${response.status} - ${errorText}`);

        

        // Retry on certain error codes

        if ((response.status === 404 || response.status === 500 || response.status === 503) && retryCount < maxRetries) {

          console.log(`Retrying Gemini analysis in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);

          await new Promise(resolve => setTimeout(resolve, retryDelay));

          return legacyGenerateGeminiAnalysis(resultData, classAverages, retryCount + 1);

        }

        

        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);

      }



      const data = await response.json();

      const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      

      if (!analysisText) {

        if (retryCount < maxRetries) {

          console.log(`No analysis text received, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);

          await new Promise(resolve => setTimeout(resolve, retryDelay));

          return legacyGenerateGeminiAnalysis(resultData, classAverages, retryCount + 1);

        }

        throw new Error('No analysis generated');

      }



      // Parse the JSON response

      try {

        // Clean the response text to extract JSON

        let cleanedText = analysisText.trim();

        

        // Remove markdown code blocks if present

        if (cleanedText.startsWith('```json')) {

          cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');

        } else if (cleanedText.startsWith('```')) {

          cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');

        }

        

        // Remove any leading/trailing text that's not JSON

        const jsonStart = cleanedText.indexOf('{');

        const jsonEnd = cleanedText.lastIndexOf('}');

        

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {

          cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);

        }

        

        console.log('Cleaned Gemini response:', cleanedText.substring(0, 200) + '...');

        

        const analysis = JSON.parse(cleanedText);

        console.log(`Gemini analysis generated successfully (attempt ${retryCount + 1})`);

        return analysis;

      } catch (parseError) {

        console.warn(`Failed to parse Gemini response (attempt ${retryCount + 1}):`, parseError);

        console.warn('Raw response:', analysisText.substring(0, 500));

        

        if (retryCount < maxRetries) {

          console.log(`Retrying due to parse error in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);

          await new Promise(resolve => setTimeout(resolve, retryDelay));

          return legacyGenerateGeminiAnalysis(resultData, classAverages, retryCount + 1);

        }

        

        // If all retries failed, try to extract partial data or return fallback

        console.log('All retries failed, attempting to extract partial data...');

        try {

          // Try to extract any valid JSON fragments

          const jsonMatches = analysisText.match(/\{[^}]*"strengths"[^}]*\}/g);

          if (jsonMatches && jsonMatches.length > 0) {

            const partialAnalysis = JSON.parse(jsonMatches[0]);

            console.log('Using partial analysis data');

            return partialAnalysis;

          }

        } catch (partialError) {

          console.warn('Could not extract partial data:', partialError);

        }

        

        throw new Error('Failed to parse analysis response');

      }

    } catch (error: unknown) {

      console.error(`Error generating Gemini analysis (attempt ${retryCount + 1}):`, error);

      

      // Retry on network errors or other retryable errors

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (retryCount < maxRetries && (

        errorMessage.includes('fetch') || 

        errorMessage.includes('network') || 

        errorMessage.includes('timeout') ||

        errorMessage.includes('ECONNRESET') ||

        errorMessage.includes('ENOTFOUND')

      )) {

        console.log(`Retrying due to network error in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);

        await new Promise(resolve => setTimeout(resolve, retryDelay));

        return legacyGenerateGeminiAnalysis(resultData, classAverages, retryCount + 1);

      }

      

      // Return fallback analysis after all retries failed

      console.log('All retries failed, returning fallback analysis');

      return {

        strengths: ["Completed the exercise successfully", "Showed persistence in problem-solving"],

        weaknesses: ["Could improve time management", "May need more practice with certain concepts"],

        questionAnalysis: ["Overall good performance across questions"],

        timeAnalysis: {

          description: "Student completed the exercise in a reasonable time",

          studentTime: Math.round(resultData.totalTimeSpent / 1000),

          classAverage: Math.round(classAverages?.averageTime || 0)

        },

        recommendations: ["Continue practicing regularly", "Focus on areas that took longer"],

        encouragement: "Great job completing the exercise! Keep up the good work!"

      };

    }

  };



  // Function to handle student name click

  const handleStudentNameClick = async (studentId: string, exerciseId: string, classId: string, studentNickname: string, resultId?: string) => {

    // Find the student data

    const student = Object.values(studentsByClass).flat().find((s: any) => s.studentId === studentId);

    if (!student) return;



    // If a specific exercise result ID is provided, open Exercise Result modal instead
    if (resultId) {
      try {
        setLoadingExerciseResult(true);
        setSelectedExerciseResultId(resultId);
        const { data } = await readData(`/ExerciseResults/${resultId}`);
        setSelectedExerciseResultData(data);
        setEditableQuestionResults((data?.questionResults || []).map((qr: any) => ({ ...qr })));
        setEditableSummary(data?.resultsSummary || null);
        setTeacherRemarks(data?.teacherRemarks || '');

        // Load related results to show trend (same student + exercise)
        try {
          const { data: allResults } = await readData('/ExerciseResults');
          if (allResults && data?.studentId && (data?.exerciseInfo?.exerciseId || data?.exerciseId)) {
            const studentId = data.studentId;
            const exerciseId = data?.exerciseInfo?.exerciseId || data?.exerciseId;
            const list = Object.entries(allResults).filter(([rid, r]: any) => {
              if (rid === resultId) return false;
              const eId = r?.exerciseInfo?.exerciseId || r?.exerciseId;
              return r?.studentId === studentId && eId === exerciseId;
            }).map(([rid, r]: any) => r);
            const scores = list.map((r: any) => r?.resultsSummary?.meanPercentageScore).filter((x: any) => typeof x === 'number');
            const avg = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
            setRelatedStats({ previousCount: list.length, previousAvgScore: avg, lastScores: scores.slice(-3) });
          } else {
            setRelatedStats(null);
          }
        } catch {
          setRelatedStats(null);
        }
        setShowExerciseResultModal(true);
      } finally {
        setLoadingExerciseResult(false);
      }
      return;
    }

    setSelectedStudentPerformance(student);

    setSelectedExerciseForPerformance({ exerciseId, classId, studentNickname });

    setShowStudentPerformanceModal(true);

    

    // Load performance data

    await loadStudentPerformance(studentId, exerciseId, classId);

  };
  const handleExportToExcel = async (exerciseTitle: string, results: any[], students: any[]) => {

    try {

      // Create a workbook

      const wb = XLSX.utils.book_new();

      

      // SHEET 1: CLASS STATISTICS

      const classStatsData = [];

      if (results.length > 0) {

        // Calculate class statistics

        const totalStudents = results.length;

        const totalQuestions = results[0]?.questionResults?.length || 0;

        // More accurate total correct calculation
        const totalCorrect = results.reduce((sum, result) => {
          if (result.resultsSummary?.totalCorrect !== undefined) {
            return sum + result.resultsSummary.totalCorrect;
          } else {
            // Count actual correct answers from question results
            const questionResults = result.questionResults || [];
            const correctCount = questionResults.filter((q: any) => q.isCorrect === true).length;
            return sum + correctCount;
          }
        }, 0);

        const totalPossible = totalStudents * totalQuestions;

        const mps = totalPossible > 0 ? ((totalCorrect / totalPossible) * 100).toFixed(1) : '0.0';

        const passingStudents = results.filter(result => (result.scorePercentage || 0) >= 75).length;

        const passRate = ((passingStudents / totalStudents) * 100).toFixed(1);

        const avgTimePerItem = results.reduce((sum, result) => {

          const questionResults = result.questionResults || [];

          const totalTime = questionResults.reduce((timeSum: number, q: any) => timeSum + (q.timeSpentSeconds || 0), 0);

          return sum + (totalTime / Math.max(questionResults.length, 1));

        }, 0) / totalStudents;

        const avgAttemptsPerItem = results.reduce((sum, result) => {
          const questionResults = result.questionResults || [];
          const totalAttempts = questionResults.reduce((attemptSum: number, q: any) => {
            // Use actual attempts if available, otherwise default to 1
            const attempts = q.attempts || 1;
            return attemptSum + attempts;
          }, 0);
          return sum + (totalAttempts / Math.max(questionResults.length, 1));
        }, 0) / totalStudents;

        // CENTRAL TENDENCY CALCULATIONS
        const scores = results.map(result => result.scorePercentage || 0);
        const times = results.map(result => Math.round((result.totalTimeSpent || 0) / 1000));
        const attempts = results.map(result => {
          const questionResults = result.questionResults || [];
          return questionResults.reduce((sum: number, q: any) => {
            // Use actual attempts if available, otherwise default to 1
            const attempts = q.attempts || 1;
            return sum + attempts;
          }, 0);
        });

        // Sort arrays for median calculation
        const sortedScores = [...scores].sort((a, b) => a - b);
        const sortedTimes = [...times].sort((a, b) => a - b);
        const sortedAttempts = [...attempts].sort((a, b) => a - b);

        // Calculate mean, median, mode
        const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const medianScore = sortedScores.length % 2 === 0 
          ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
          : sortedScores[Math.floor(sortedScores.length / 2)];

        const meanTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        const medianTime = sortedTimes.length % 2 === 0 
          ? (sortedTimes[sortedTimes.length / 2 - 1] + sortedTimes[sortedTimes.length / 2]) / 2
          : sortedTimes[Math.floor(sortedTimes.length / 2)];

        const meanAttempts = attempts.reduce((sum, attempt) => sum + attempt, 0) / attempts.length;
        const medianAttempts = sortedAttempts.length % 2 === 0 
          ? (sortedAttempts[sortedAttempts.length / 2 - 1] + sortedAttempts[sortedAttempts.length / 2]) / 2
          : sortedAttempts[Math.floor(sortedAttempts.length / 2)];

        // DISPERSION CALCULATIONS
        const scoreVariance = scores.reduce((sum, score) => sum + Math.pow(score - meanScore, 2), 0) / scores.length;
        const scoreStdDev = Math.sqrt(scoreVariance);
        const scoreRange = Math.max(...scores) - Math.min(...scores);

        const timeVariance = times.reduce((sum, time) => sum + Math.pow(time - meanTime, 2), 0) / times.length;
        const timeStdDev = Math.sqrt(timeVariance);
        const timeRange = Math.max(...times) - Math.min(...times);

        const attemptVariance = attempts.reduce((sum, attempt) => sum + Math.pow(attempt - meanAttempts, 2), 0) / attempts.length;
        const attemptStdDev = Math.sqrt(attemptVariance);
        const attemptRange = Math.max(...attempts) - Math.min(...attempts);

        // Quartiles calculation
        const getQuartiles = (arr: number[]) => {
          const sorted = [...arr].sort((a, b) => a - b);
          const q1Index = Math.floor(sorted.length * 0.25);
          const q3Index = Math.floor(sorted.length * 0.75);
          return {
            q1: sorted[q1Index],
            q3: sorted[q3Index],
            iqr: sorted[q3Index] - sorted[q1Index]
          };
        };

        const scoreQuartiles = getQuartiles(scores);
        const timeQuartiles = getQuartiles(times);
        const attemptQuartiles = getQuartiles(attempts);

        // EFFICIENCY CALCULATIONS
        const completedStudents = results.filter(result => result.completedAt).length;
        const completionRate = ((completedStudents / totalStudents) * 100).toFixed(1);

        // Time efficiency: students who completed in reasonable time (below median + 1 std dev)
        const timeThreshold = meanTime + timeStdDev;
        const timeEfficientStudents = results.filter(result => 
          Math.round((result.totalTimeSpent || 0) / 1000) <= timeThreshold
        ).length;
        const timeEfficiencyRate = ((timeEfficientStudents / totalStudents) * 100).toFixed(1);

        // Attempt efficiency: students who used minimal attempts (below median + 1 std dev)
        const attemptThreshold = meanAttempts + attemptStdDev;
        const attemptEfficientStudents = results.filter(result => {
          const questionResults = result.questionResults || [];
          const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
          return totalAttempts <= attemptThreshold;
        }).length;
        const attemptEfficiencyRate = ((attemptEfficientStudents / totalStudents) * 100).toFixed(1);

        // Overall efficiency: students who are both time and attempt efficient
        const overallEfficientStudents = results.filter(result => {
          const totalTime = Math.round((result.totalTimeSpent || 0) / 1000);
          const questionResults = result.questionResults || [];
          const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
          return totalTime <= timeThreshold && totalAttempts <= attemptThreshold;
        }).length;
        const overallEfficiencyRate = ((overallEfficientStudents / totalStudents) * 100).toFixed(1);

        classStatsData.push(
          // BASIC STATISTICS
          { 'Metric': 'Exercise Title', 'Value': exerciseTitle },
          { 'Metric': 'Total Students', 'Value': totalStudents },
          { 'Metric': 'Total Questions', 'Value': totalQuestions },
          { 'Metric': 'Total Correct Answers', 'Value': totalCorrect },
          { 'Metric': 'Total Possible Points', 'Value': totalPossible },
          { 'Metric': 'Mean Percentage Score (MPS)', 'Value': `${mps}%` },
          { 'Metric': 'Passing Students (≥75%)', 'Value': passingStudents },
          { 'Metric': 'Pass Rate', 'Value': `${passRate}%` },
          
          // CENTRAL TENDENCY - SCORES
          { 'Metric': '--- CENTRAL TENDENCY (SCORES) ---', 'Value': '---' },
          { 'Metric': 'Mean Score', 'Value': `${meanScore.toFixed(1)}%` },
          { 'Metric': 'Median Score', 'Value': `${medianScore.toFixed(1)}%` },
          { 'Metric': 'Mode Score (Most Common)', 'Value': `${Math.round(meanScore)}%` },
          
          // CENTRAL TENDENCY - TIME
          { 'Metric': '--- CENTRAL TENDENCY (TIME) ---', 'Value': '---' },
          { 'Metric': 'Mean Time (seconds)', 'Value': `${meanTime.toFixed(1)}` },
          { 'Metric': 'Median Time (seconds)', 'Value': `${medianTime.toFixed(1)}` },
          { 'Metric': 'Average Time per Item', 'Value': `${avgTimePerItem.toFixed(1)}s` },
          
          // CENTRAL TENDENCY - ATTEMPTS
          { 'Metric': '--- CENTRAL TENDENCY (ATTEMPTS) ---', 'Value': '---' },
          { 'Metric': 'Mean Total Attempts', 'Value': `${meanAttempts.toFixed(1)}` },
          { 'Metric': 'Median Total Attempts', 'Value': `${medianAttempts.toFixed(1)}` },
          { 'Metric': 'Average Attempts per Item', 'Value': `${avgAttemptsPerItem.toFixed(1)}` },
          
          // DISPERSION - SCORES
          { 'Metric': '--- DISPERSION (SCORES) ---', 'Value': '---' },
          { 'Metric': 'Score Standard Deviation', 'Value': `${scoreStdDev.toFixed(1)}` },
          { 'Metric': 'Score Variance', 'Value': `${scoreVariance.toFixed(1)}` },
          { 'Metric': 'Score Range', 'Value': `${scoreRange.toFixed(1)}` },
          { 'Metric': 'Score Q1 (25th percentile)', 'Value': `${scoreQuartiles.q1.toFixed(1)}%` },
          { 'Metric': 'Score Q3 (75th percentile)', 'Value': `${scoreQuartiles.q3.toFixed(1)}%` },
          { 'Metric': 'Score IQR (Interquartile Range)', 'Value': `${scoreQuartiles.iqr.toFixed(1)}` },
          
          // DISPERSION - TIME
          { 'Metric': '--- DISPERSION (TIME) ---', 'Value': '---' },
          { 'Metric': 'Time Standard Deviation (seconds)', 'Value': `${timeStdDev.toFixed(1)}` },
          { 'Metric': 'Time Variance', 'Value': `${timeVariance.toFixed(1)}` },
          { 'Metric': 'Time Range (seconds)', 'Value': `${timeRange.toFixed(1)}` },
          { 'Metric': 'Time Q1 (25th percentile)', 'Value': `${timeQuartiles.q1.toFixed(1)}s` },
          { 'Metric': 'Time Q3 (75th percentile)', 'Value': `${timeQuartiles.q3.toFixed(1)}s` },
          { 'Metric': 'Time IQR (Interquartile Range)', 'Value': `${timeQuartiles.iqr.toFixed(1)}s` },
          
          // DISPERSION - ATTEMPTS
          { 'Metric': '--- DISPERSION (ATTEMPTS) ---', 'Value': '---' },
          { 'Metric': 'Attempt Standard Deviation', 'Value': `${attemptStdDev.toFixed(1)}` },
          { 'Metric': 'Attempt Variance', 'Value': `${attemptVariance.toFixed(1)}` },
          { 'Metric': 'Attempt Range', 'Value': `${attemptRange.toFixed(1)}` },
          { 'Metric': 'Attempt Q1 (25th percentile)', 'Value': `${attemptQuartiles.q1.toFixed(1)}` },
          { 'Metric': 'Attempt Q3 (75th percentile)', 'Value': `${attemptQuartiles.q3.toFixed(1)}` },
          { 'Metric': 'Attempt IQR (Interquartile Range)', 'Value': `${attemptQuartiles.iqr.toFixed(1)}` },
          
          // EFFICIENCY METRICS
          { 'Metric': '--- EFFICIENCY METRICS ---', 'Value': '---' },
          { 'Metric': 'Completion Rate', 'Value': `${completionRate}%` },
          { 'Metric': 'Time Efficiency Rate', 'Value': `${timeEfficiencyRate}%` },
          { 'Metric': 'Attempt Efficiency Rate', 'Value': `${attemptEfficiencyRate}%` },
          { 'Metric': 'Overall Efficiency Rate', 'Value': `${overallEfficiencyRate}%` },
          { 'Metric': 'Time Efficient Students', 'Value': `${timeEfficientStudents}/${totalStudents}` },
          { 'Metric': 'Attempt Efficient Students', 'Value': `${attemptEfficientStudents}/${totalStudents}` },
          { 'Metric': 'Overall Efficient Students', 'Value': `${overallEfficientStudents}/${totalStudents}` }
        );

      }

      const classStatsWs = XLSX.utils.json_to_sheet(classStatsData);

      classStatsWs['!cols'] = [{ wch: 30 }, { wch: 20 }];

      XLSX.utils.book_append_sheet(wb, classStatsWs, 'Class Statistics');

      

      // SHEET 2: STUDENT RESULTS

      const studentResultsData = results.map((result: any, idx: number) => {

        // Try to find student by studentId, then by studentInfo.name, then by parentId
        let student = students.find((s: any) => s.studentId === result.studentId);
        
        if (!student && result.studentInfo?.name) {
          student = students.find((s: any) => 
            s.fullName && s.fullName.toLowerCase().trim() === result.studentInfo.name.toLowerCase().trim()
          );
        }
        
        if (!student && result.parentId) {
          student = students.find((s: any) => s.parentId === result.parentId);
        }

        const studentNickname = student ? formatStudentName(student) : 
          (result.studentInfo?.name || 'Unknown Student');

        const questionResults = result.questionResults || [];

        const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

        const avgAttempts = questionResults.length > 0 ? (totalAttempts / questionResults.length).toFixed(1) : '1.0';

        const totalTimeSeconds = Math.round((result.totalTimeSpent || 0) / 1000);

        const totalTimeMinutes = Math.round((result.totalTimeSpent || 0) / 60000);

        const remainingSeconds = Math.round(((result.totalTimeSpent || 0) % 60000) / 1000);

        const timeDisplay = totalTimeMinutes > 0 ? `${totalTimeMinutes}m ${remainingSeconds}s` : `${totalTimeSeconds}s`;

        const totalCorrect = result.resultsSummary?.totalCorrect || questionResults.filter((q: any) => q.isCorrect).length;

        const totalQuestions = questionResults.length;

        return {

          '#': idx + 1,

          'Student': studentNickname,

          'Correct Answers': `${totalCorrect}/${totalQuestions}`,

          'Score %': `${Math.round(result.scorePercentage || 0)}%`,

          'Avg Attempts': avgAttempts,

          'Time (seconds)': totalTimeSeconds,

          'Time (formatted)': timeDisplay,

          'Completed At': result.completedAt ? new Date(result.completedAt).toLocaleString() : 'N/A'

        };

      });

      const studentResultsWs = XLSX.utils.json_to_sheet(studentResultsData);

      studentResultsWs['!cols'] = [

        { wch: 5 },   // #

        { wch: 25 },  // Student

        { wch: 18 },  // Correct Answers

        { wch: 12 },  // Score %

        { wch: 15 },  // Avg Attempts

        { wch: 15 },  // Time (seconds)

        { wch: 18 },  // Time (formatted)

        { wch: 25 }   // Completed At

      ];

      XLSX.utils.book_append_sheet(wb, studentResultsWs, 'Student Results');

      

      // SHEET 3: ITEM ANALYSIS

      const itemAnalysisData: Array<{Question: string, Metric: string, Value: string | number}> = [];

      if (results.length > 0 && results[0]?.questionResults?.length > 0) {

        const firstResult = results[0];

        const questionResults = firstResult.questionResults || [];

        

        questionResults.forEach((question: any, questionIndex: number) => {

          // More accurate question number calculation
          const questionNumber = question.questionNumber || questionIndex + 1;

          const correctAnswer = question.correctAnswer || 'N/A';

          const questionText = question.questionText || `Question ${questionNumber}`;

          // More accurate question type calculation
          let questionType = question.questionType || 'Unknown';
          if (questionType.includes('multiple-choice')) {
            questionType = 'Multiple Choice';
          } else if (questionType.includes('identification')) {
            questionType = 'Identification';
          } else if (questionType.includes('re-order')) {
            questionType = 'Re-order';
          } else if (questionType.includes('matching')) {
            questionType = 'Matching';
          }

          // Calculate metrics based on actual student results
          const questionResults = results.map((result: any) => {
            return result.questionResults?.find((q: any) => q.questionNumber === questionNumber);
          }).filter(Boolean);
          
          // Calculate difficulty based on student performance
          const correctCountForDifficulty = questionResults.filter((q: any) => q.isCorrect === true).length;
          const accuracy = questionResults.length > 0 ? correctCountForDifficulty / questionResults.length : 0;
          
          let difficulty = '2.0'; // Default medium difficulty
          if (accuracy >= 0.9) difficulty = '1.0';      // Very Easy (90%+ correct)
          else if (accuracy >= 0.8) difficulty = '1.2'; // Easy (80-89% correct)
          else if (accuracy >= 0.7) difficulty = '1.5'; // Easy-Medium (70-79% correct)
          else if (accuracy >= 0.6) difficulty = '2.0';  // Medium (60-69% correct)
          else if (accuracy >= 0.5) difficulty = '2.5';  // Medium-Hard (50-59% correct)
          else if (accuracy >= 0.4) difficulty = '3.0';  // Hard (40-49% correct)
          else if (accuracy >= 0.3) difficulty = '3.5';  // Very Hard (30-39% correct)
          else difficulty = '4.0';                      // Extremely Hard (<30% correct)
          
          // Calculate average time spent by students
          const timeSpentArray = questionResults.map((q: any) => q.timeSpent || 0).filter(time => time > 0);
          const avgTimeSpent = timeSpentArray.length > 0 
            ? timeSpentArray.reduce((sum, time) => sum + time, 0) / timeSpentArray.length 
            : 0;
          
          // Calculate time allowed based on student performance
          let timeAllowed = 25; // Default
          if (avgTimeSpent > 0) {
            // Set time allowed to 1.5x the average time spent (giving students reasonable buffer)
            timeAllowed = Math.max(15, Math.min(60, Math.round(avgTimeSpent * 1.5 / 1000)));
          } else {
            // Fallback based on question type if no time data
            if (questionType.toLowerCase().includes('re-order')) {
              timeAllowed = 20;
            } else if (questionType.toLowerCase().includes('matching')) {
              timeAllowed = 30;
            } else if (questionType.toLowerCase().includes('identification')) {
              timeAllowed = 15;
            }
          }

          

          // Analyze all students' responses to this question

          const studentResponses = results.map(result => {

            const studentQuestion = result.questionResults?.find((q: any) => q.questionNumber === questionNumber);

            return {

              student: result.studentInfo?.name || 'Unknown',

              answer: studentQuestion?.studentAnswer || 'No answer',

              isCorrect: studentQuestion?.isCorrect || false,

              attempts: studentQuestion?.attempts || 1,

              timeSpent: studentQuestion?.timeSpentSeconds || 0

            };

          });

          

          // Count correct vs incorrect responses

          const correctCount = studentResponses.filter(response => response.isCorrect).length;

          const incorrectCount = studentResponses.filter(response => !response.isCorrect).length;

          

          // Group incorrect answers

          const incorrectAnswers = studentResponses.filter(response => !response.isCorrect);

          const answerCounts: Record<string, number> = {};

          incorrectAnswers.forEach(response => {

            const answer = response.answer || 'No answer';

            answerCounts[answer] = (answerCounts[answer] || 0) + 1;

          });

          

          // Calculate averages

          const avgTimePerQuestion = studentResponses.reduce((sum, response) => sum + response.timeSpent, 0) / studentResponses.length;

          const avgAttemptsPerQuestion = studentResponses.reduce((sum, response) => sum + response.attempts, 0) / studentResponses.length;

          

          // Add question summary

          itemAnalysisData.push(

            { 'Question': `Q${questionNumber}`, 'Metric': 'Question Text', 'Value': questionText },

            { 'Question': `Q${questionNumber}`, 'Metric': 'Correct Answer', 'Value': correctAnswer },

            { 'Question': `Q${questionNumber}`, 'Metric': 'Students Answered Correctly', 'Value': correctCount },

            { 'Question': `Q${questionNumber}`, 'Metric': 'Students Answered Incorrectly', 'Value': incorrectCount },

            { 'Question': `Q${questionNumber}`, 'Metric': 'Average Time (seconds)', 'Value': avgTimePerQuestion.toFixed(1) },

            { 'Question': `Q${questionNumber}`, 'Metric': 'Average Attempts', 'Value': avgAttemptsPerQuestion.toFixed(1) },

            { 'Question': `Q${questionNumber}`, 'Metric': '---', 'Value': '---' }

          );

          

          // Add incorrect answer details

          Object.entries(answerCounts).forEach(([answer, count]) => {

            itemAnalysisData.push({

              'Question': `Q${questionNumber}`,

              'Metric': 'Incorrect Answer',

              'Value': `${answer} (${count} students)`

            });

          });

          

          // Add separator between questions

          if (questionIndex < questionResults.length - 1) {

            itemAnalysisData.push(

              { 'Question': '', 'Metric': '', 'Value': '' },

              { 'Question': '', 'Metric': '', 'Value': '' }

            );

          }

        });

      }

      const itemAnalysisWs = XLSX.utils.json_to_sheet(itemAnalysisData as any[]);

      itemAnalysisWs['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 40 }];

      XLSX.utils.book_append_sheet(wb, itemAnalysisWs, 'Item Analysis');

      

      // Generate Excel file as base64

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      

      // Create filename

      const filename = `${exerciseTitle.replace(/[^a-zA-Z0-9]/g, '_')}_detailed_analysis.xlsx`;

      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      

      // Write file to device

      await FileSystem.writeAsStringAsync(fileUri, wbout, {

        encoding: 'base64',

      });

      

      // Share the file

      if (await Sharing.isAvailableAsync()) {

        await Sharing.shareAsync(fileUri, {

          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

          dialogTitle: `Export ${exerciseTitle} Detailed Analysis`,

          UTI: 'com.microsoft.excel.xlsx'

        });

        showAlert('Success', 'Detailed Excel analysis exported successfully!', undefined, 'success');

      } else {

        showAlert('Success', `Detailed analysis exported to ${filename}`, undefined, 'success');

      }

      

      // Clean up the file after a delay to allow sharing to complete

      setTimeout(async () => {

        try {

          const fileInfo = await FileSystem.getInfoAsync(fileUri);

          if (fileInfo.exists) {

            await FileSystem.deleteAsync(fileUri);

            console.log('Temporary Excel file cleaned up');

          }

        } catch (cleanupError) {

          console.warn('Failed to cleanup temporary Excel file:', cleanupError);

        }

      }, 5000);

      

    } catch (error) {

      console.error('Export error:', error);

      showAlert('Error', 'Failed to export detailed analysis to Excel. Please try again.', undefined, 'error');

    }

  };
  // Export Class Statistics to Excel
  const handleExportClassStatsToExcel = async () => {
    if (!selectedExerciseForStats) return;
    
    try {
      const { exerciseTitle, exerciseId, exerciseResults, classId } = selectedExerciseForStats;
      
      // Create a workbook
      const wb = XLSX.utils.book_new();
      
      // Calculate all statistics
      const scores = exerciseResults.map((r: any) => r.scorePercentage || 0);
      const sortedScores = [...scores].sort((a: number, b: number) => a - b);
      
      if (scores.length === 0) {
        showAlert('Error', 'No data available to export.', undefined, 'error');
        return;
      }
      
      // CENTRAL TENDENCY
      const mps = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
      const median = sortedScores.length % 2 === 0 
        ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
        : sortedScores[Math.floor(sortedScores.length / 2)];
      
      const scoreCounts: { [key: number]: number } = {};
      scores.forEach((score: number) => {
        const roundedScore = Math.round(score);
        scoreCounts[roundedScore] = (scoreCounts[roundedScore] || 0) + 1;
      });
      const mode = Object.keys(scoreCounts).reduce((a, b) => 
        scoreCounts[parseInt(a)] > scoreCounts[parseInt(b)] ? a : b
      );
      
      // DISPERSION
      const variance = scores.reduce((sum: number, score: number) => sum + Math.pow(score - mps, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      const highestScore = Math.max(...scores);
      const lowestScore = Math.min(...scores);
      const range = highestScore - lowestScore;
      
      // TOP & BOTTOM PERFORMERS
      const topStudent = exerciseResults.find((r: any) => r.scorePercentage === highestScore);
      const bottomStudent = exerciseResults.find((r: any) => r.scorePercentage === lowestScore);
      
      // EFFICIENCY METRICS
      const totalAttempts = exerciseResults.reduce((sum: number, result: any) => {
        return sum + (result.questionResults?.reduce((qSum: number, q: any) => qSum + (q.attempts || 1), 0) || 0);
      }, 0);
      const avgAttemptsPerItem = totalAttempts / (exerciseResults[0]?.questionResults?.length || 1) / exerciseResults.length;
      
      const totalTime = exerciseResults.reduce((sum: number, result: any) => sum + (result.totalTimeSpent || 0), 0);
      const avgTimePerItem = totalTime / (exerciseResults[0]?.questionResults?.length || 1) / exerciseResults.length;
      
      // PERFORMANCE DISTRIBUTION
      const highlyProficientCount = scores.filter((s: number) => s >= 85).length;
      const proficientCount = scores.filter((s: number) => s >= 75 && s < 85).length;
      const nearlyProficientCount = scores.filter((s: number) => s >= 50 && s < 75).length;
      const lowProficientCount = scores.filter((s: number) => s >= 25 && s < 50).length;
      const notProficientCount = scores.filter((s: number) => s < 25).length;
      
      // PASS RATE
      const passCount = scores.filter((s: number) => s >= 75).length;
      const passRate = scores.length > 0 ? (passCount / scores.length) * 100 : 0;
      
      // SHEET 1: OVERVIEW
      const overviewData = [
        { 'Metric': 'Exercise Title', 'Value': exerciseTitle },
        { 'Metric': 'Exercise ID', 'Value': exerciseId },
        { 'Metric': 'Total Students', 'Value': scores.length },
        { 'Metric': 'Mean Percentage Score (MPS)', 'Value': `${mps.toFixed(1)}%` },
        { 'Metric': 'Pass Rate (≥60%)', 'Value': `${passRate.toFixed(1)}%` },
        { 'Metric': 'Students Passed', 'Value': `${passCount}/${scores.length}` }
      ];
      
      const overviewWs = XLSX.utils.json_to_sheet(overviewData);
      overviewWs['!cols'] = [{ wch: 35 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, overviewWs, 'Overview');
      
      // SHEET 2: CENTRAL TENDENCY
      const centralTendencyData = [
        { 'Statistic': 'Mean', 'Value': `${mps.toFixed(1)}%`, 'Description': 'Average score across all students' },
        { 'Statistic': 'Median', 'Value': `${median.toFixed(1)}%`, 'Description': 'Middle value when scores are sorted' },
        { 'Statistic': 'Mode', 'Value': `${mode}%`, 'Description': 'Most frequently occurring score' }
      ];
      
      const centralTendencyWs = XLSX.utils.json_to_sheet(centralTendencyData);
      centralTendencyWs['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, centralTendencyWs, 'Central Tendency');
      
      // SHEET 3: DISPERSION
      const dispersionData = [
        { 'Statistic': 'Standard Deviation', 'Value': stdDev.toFixed(1), 'Interpretation': stdDev < 10 ? 'Low variability' : stdDev < 20 ? 'Moderate variability' : 'High variability' },
        { 'Statistic': 'Range', 'Value': `${range.toFixed(1)}%`, 'Interpretation': `${lowestScore.toFixed(0)}% to ${highestScore.toFixed(0)}%` },
        { 'Statistic': 'Highest Score', 'Value': `${highestScore.toFixed(1)}%`, 'Interpretation': topStudent ? (topStudent.studentInfo?.name || 'Unknown') : '—' },
        { 'Statistic': 'Lowest Score', 'Value': `${lowestScore.toFixed(1)}%`, 'Interpretation': bottomStudent ? (bottomStudent.studentInfo?.name || 'Unknown') : '—' }
      ];
      
      const dispersionWs = XLSX.utils.json_to_sheet(dispersionData);
      dispersionWs['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, dispersionWs, 'Dispersion');
      
      // SHEET 4: EFFICIENCY
      const avgTimeDisplay = avgTimePerItem > 60000 
        ? `${Math.floor(avgTimePerItem / 60000)}m ${Math.floor((avgTimePerItem % 60000) / 1000)}s`
        : `${Math.floor(avgTimePerItem / 1000)}s`;
      
      const efficiencyData = [
        { 'Metric': 'Avg Attempts per Item', 'Value': avgAttemptsPerItem.toFixed(1), 'Assessment': avgAttemptsPerItem < 1.5 ? 'Excellent' : avgAttemptsPerItem < 2.5 ? 'Good' : 'Fair' },
        { 'Metric': 'Avg Time per Item', 'Value': avgTimeDisplay, 'Assessment': '—' }
      ];
      
      const efficiencyWs = XLSX.utils.json_to_sheet(efficiencyData);
      efficiencyWs['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, efficiencyWs, 'Efficiency');
      
      // SHEET 5: PERFORMANCE DISTRIBUTION
      const performanceDistData = [
        { 'Category': 'Highly Proficient (85-100%)', 'Count': highlyProficientCount, 'Percentage': `${scores.length > 0 ? ((highlyProficientCount / scores.length) * 100).toFixed(0) : 0}%` },
        { 'Category': 'Proficient (75-84%)', 'Count': proficientCount, 'Percentage': `${scores.length > 0 ? ((proficientCount / scores.length) * 100).toFixed(0) : 0}%` },
        { 'Category': 'Nearly Proficient (50-74%)', 'Count': nearlyProficientCount, 'Percentage': `${scores.length > 0 ? ((nearlyProficientCount / scores.length) * 100).toFixed(0) : 0}%` },
        { 'Category': 'Low Proficient (25-49%)', 'Count': lowProficientCount, 'Percentage': `${scores.length > 0 ? ((lowProficientCount / scores.length) * 100).toFixed(0) : 0}%` },
        { 'Category': 'Not Proficient (<25%)', 'Count': notProficientCount, 'Percentage': `${scores.length > 0 ? ((notProficientCount / scores.length) * 100).toFixed(0) : 0}%` }
      ];
      
      const performanceDistWs = XLSX.utils.json_to_sheet(performanceDistData);
      performanceDistWs['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, performanceDistWs, 'Performance Distribution');
      
      // SHEET 6: ITEM ANALYSIS
      const firstResult = exerciseResults[0];
      if (firstResult?.questionResults?.length) {
        const itemAnalysisData: any[] = [];
        
        firstResult.questionResults.forEach((question: any, questionIndex: number) => {
          const questionNumber = question.questionNumber || questionIndex + 1;
          const questionText = question.questionText || `Question ${questionNumber}`;
          
          let questionType = question.questionType || 'Unknown';
          if (questionType.includes('multiple-choice')) {
            questionType = 'Multiple Choice';
          } else if (questionType.includes('identification')) {
            questionType = 'Identification';
          } else if (questionType.includes('re-order')) {
            questionType = 'Re-order';
          } else if (questionType.includes('matching')) {
            questionType = 'Matching';
          }
          
          const questionResults = exerciseResults.map((result: any) => {
            return result.questionResults?.find((q: any) => q.questionId === question.questionId);
          }).filter(Boolean);
          
          const correctCount = questionResults.filter((q: any) => q.isCorrect).length;
          const difficultyIndex = questionResults.length > 0 ? (correctCount / questionResults.length) * 100 : 0;
          
          const avgTime = questionResults.reduce((sum: any, q: any) => sum + (q.timeSpent || 0), 0) / questionResults.length;
          const avgTimeSeconds = Math.round(avgTime / 1000);
          
          const avgAttempts = questionResults.reduce((sum: any, q: any) => sum + (q.attempts || 1), 0) / questionResults.length;
          
          itemAnalysisData.push({
            'Question #': questionNumber,
            'Question Text': questionText,
            'Type': questionType,
            'Difficulty Index (%)': difficultyIndex.toFixed(1),
            'Correct Count': correctCount,
            'Total Responses': questionResults.length,
            'Avg Time (s)': avgTimeSeconds,
            'Avg Attempts': avgAttempts.toFixed(1)
          });
        });
        
        const itemAnalysisWs = XLSX.utils.json_to_sheet(itemAnalysisData);
        itemAnalysisWs['!cols'] = [
          { wch: 12 }, // Question #
          { wch: 40 }, // Question Text
          { wch: 18 }, // Type
          { wch: 18 }, // Difficulty Index
          { wch: 15 }, // Correct Count
          { wch: 15 }, // Total Responses
          { wch: 12 }, // Avg Time
          { wch: 15 }  // Avg Attempts
        ];
        XLSX.utils.book_append_sheet(wb, itemAnalysisWs, 'Item Analysis');
      }
      
      // Generate Excel file
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const filename = `${exerciseTitle.replace(/[^a-zA-Z0-9]/g, '_')}_class_statistics.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: 'base64' });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Export Class Statistics - ${exerciseTitle}`,
          UTI: 'com.microsoft.excel.xlsx'
        });
        showAlert('Success', 'Class statistics exported to Excel successfully!', undefined, 'success');
      } else {
        showAlert('Success', `Exported to ${filename}`, undefined, 'success');
      }
      
      // Cleanup
      setTimeout(async () => {
        try {
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(fileUri);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp file:', cleanupError);
        }
      }, 5000);
      
    } catch (error) {
      console.error('Export to Excel error:', error);
      showAlert('Error', 'Failed to export class statistics to Excel.', undefined, 'error');
    }
  };
  
  
  
  
  const handleExportQuarterToExcel = async (quarter: string, classId: string, resultsByExercise: any, students: any[]) => {
    try {
      // Get class info for filename
      const classInfo = activeClasses.find(c => c.id === classId);
      const className = classInfo?.name || 'Class';
      
      // Create a map of all students with their results for each exercise
      const studentResultsMap: Record<string, any> = {};
      
      // Initialize all students
      students.forEach((student: any) => {
        const studentName = formatStudentName(student);
        studentResultsMap[studentName] = {
          studentName,
          student,
          exercises: {}
        };
      });
      
      // Process each exercise's results
      Object.entries(resultsByExercise).forEach(([exerciseTitle, exerciseResults]: [string, any]) => {
        (exerciseResults as any[]).forEach((result: any) => {
          // Try to find student by multiple strategies
          let student = students.find((s: any) => s.studentId === result.studentId);
          
          if (!student && result.studentInfo?.name) {
            student = students.find((s: any) => 
              s.fullName && s.fullName.toLowerCase().trim() === result.studentInfo.name.toLowerCase().trim()
            );
          }
          
          if (!student && result.parentId) {
            student = students.find((s: any) => s.parentId === result.parentId);
          }

          const studentName = student ? formatStudentName(student) : 
            (result.studentInfo?.name || 'Unknown Student');

          // Initialize student if not exists
          if (!studentResultsMap[studentName]) {
            studentResultsMap[studentName] = {
              studentName,
              student,
              exercises: {}
            };
          }

          // Calculate metrics for this exercise
          const questionResults = result.questionResults || [];
          const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
          const avgAttempts = questionResults.length > 0 ? (totalAttempts / questionResults.length).toFixed(1) : '1.0';
          
          const totalTimeMinutes = Math.round((result.totalTimeSpent || 0) / 60000);
          const totalTimeSeconds = Math.round(((result.totalTimeSpent || 0) % 60000) / 1000);
          const timeDisplay = totalTimeMinutes > 0 ? `${totalTimeMinutes}m ${totalTimeSeconds}s` : `${Math.round((result.totalTimeSpent || 0) / 1000)}s`;
          
          // Store exercise results for this student
          studentResultsMap[studentName].exercises[exerciseTitle] = {
            scorePercentage: `${Math.round(result.scorePercentage || 0)}%`,
            avgAttempts,
            timeFormatted: timeDisplay,
            completedAt: result.completedAt ? new Date(result.completedAt).toLocaleString() : 'N/A'
          };
        });
      });
      
      // Create headers for the wide format
      const exerciseTitles = Object.keys(resultsByExercise);
      const headers = ['#', 'Student'];
      
      // Add columns for each exercise
      exerciseTitles.forEach(exerciseTitle => {
        headers.push(`${exerciseTitle} - Score %`);
        headers.push(`${exerciseTitle} - Avg Attempts`);
        headers.push(`${exerciseTitle} - Time (formatted)`);
        headers.push(`${exerciseTitle} - Completed At`);
      });
      
      // Create Excel data in wide format
      const excelData: any[] = [];
      let rowNumber = 1;
      
      // Sort students alphabetically
      const sortedStudents = Object.values(studentResultsMap).sort((a: any, b: any) => 
        a.studentName.localeCompare(b.studentName)
      );
      
      sortedStudents.forEach((studentData: any) => {
        const row: any = {
          '#': rowNumber++,
          'Student': studentData.studentName
        };
        
        // Add data for each exercise
        exerciseTitles.forEach(exerciseTitle => {
          const exerciseData = studentData.exercises[exerciseTitle];
          if (exerciseData) {
            row[`${exerciseTitle} - Score %`] = exerciseData.scorePercentage;
            row[`${exerciseTitle} - Avg Attempts`] = exerciseData.avgAttempts;
            row[`${exerciseTitle} - Time (formatted)`] = exerciseData.timeFormatted;
            row[`${exerciseTitle} - Completed At`] = exerciseData.completedAt;
          } else {
            // No data for this exercise
            row[`${exerciseTitle} - Score %`] = 'N/A';
            row[`${exerciseTitle} - Avg Attempts`] = 'N/A';
            row[`${exerciseTitle} - Time (formatted)`] = 'N/A';
            row[`${exerciseTitle} - Completed At`] = 'N/A';
          }
        });
        
        excelData.push(row);
      });

      // Create a workbook
      const wb = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Set column widths for wide format
      const colWidths = [
        { wch: 5 },   // #
        { wch: 20 },  // Student
      ];
      
      // Add widths for each exercise's columns
      exerciseTitles.forEach(() => {
        colWidths.push({ wch: 12 }); // Score %
        colWidths.push({ wch: 15 }); // Avg Attempts
        colWidths.push({ wch: 18 }); // Time (formatted)
        colWidths.push({ wch: 25 }); // Completed At
      });
      
      ws['!cols'] = colWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, quarter.replace(' ', '_'));
      
      // Generate Excel file as base64
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      
      // Create filename
      const filename = `${className}_${quarter.replace(' ', '_')}_ClassRecord.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      
      // Write file to device
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: 'base64',
      });
      
      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Export ${quarter} Class Record`,
          UTI: 'com.microsoft.excel.xlsx'
        });
        showAlert('Success', `${quarter} class record exported successfully!`, undefined, 'success');
      } else {
        showAlert('Success', `Results exported to ${filename}`, undefined, 'success');
      }
      
      // Clean up the file after a delay
      setTimeout(async () => {
        try {
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(fileUri);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup temporary Excel file:', cleanupError);
        }
      }, 5000);
      
    } catch (error) {
      console.error('Quarter export error:', error);
      showAlert('Error', 'Failed to export quarter results. Please try again.', undefined, 'error');
    }
  };



  const exportClassListToExcel = async (cls: { id: string; name: string }) => {
    try {
      const students = [...(studentsByClass[cls.id] || [])].sort((a, b) =>
        formatStudentName(a).localeCompare(formatStudentName(b))
      );

      // Create CSV content
      const csvHeaders = ['No.', 'Student Name', 'Parent Access Code'];
      const csvRows = students.map((s: any, idx: number) => {
        const loginCode = s.parentId ? (parentsById[s.parentId]?.loginCode || '—') : '—';
        return [idx + 1, formatStudentName(s), loginCode];
      });

      // Convert to CSV format
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // Create filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${cls.name.replace(/[^a-zA-Z0-9]/g, '_')}_StudentList_${timestamp}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Write file
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      // Share the file
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(fileUri, { 
          dialogTitle: `Export ${cls.name} Student List`,
          mimeType: 'text/csv'
        });
      } else {
        showAlert('Export Complete', `Excel file saved to: ${fileUri}`, undefined, 'success');
      }

      // Cleanup after 5 seconds
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch (cleanupError) {
          console.warn('Failed to cleanup temporary Excel file:', cleanupError);
        }
      }, 5000);

    } catch (error) {
      console.error('Excel export error:', error);
      showAlert('Export Failed', 'Unable to export Excel file.', undefined, 'error');
    }
  };

  const exportClassListToPdf = async (cls: { id: string; name: string }) => {
    try {
      const students = [...(studentsByClass[cls.id] || [])].sort((a, b) =>
        formatStudentName(a).localeCompare(formatStudentName(b))
      );

      const rows = students
        .map((s: any, idx: number) => {
          const loginCode = s.parentId ? (parentsById[s.parentId]?.loginCode || '—') : '—';
          return `<tr>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${idx + 1}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(formatStudentName(s))}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${escapeHtml(String(loginCode))}</td>
          </tr>`;
        })
        .join('');

      const html = `<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${escapeHtml(cls.name)} — Student List</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol','Noto Color Emoji'; color:#111827;">
            <h1 style="font-size:20px;">${escapeHtml(cls.name)} — Student List</h1>
            <p style="color:#6b7280;">Generated on ${new Date().toLocaleString()}</p>
            <table style="border-collapse:collapse;width:100%;font-size:12px;">
              <thead>
                <tr>
                  <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;width:60px;">#</th>
                  <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;text-align:left;">Student</th>
                  <th style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;width:140px;">Parent Code</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="3" style="padding:12px;text-align:center;border:1px solid #e5e7eb;">No students yet.</td></tr>`}
              </tbody>
            </table>
          </body>
        </html>`;

      const file = await Print.printToFileAsync({ html });
      const sharingAvailable = await Sharing.isAvailableAsync();

      if (sharingAvailable) {
        await Sharing.shareAsync(file.uri, { dialogTitle: `Export ${cls.name} Student List` });
      } else {
        showAlert('Export Complete', `PDF saved to: ${file.uri}`, undefined, 'success');
      }

    } catch (e) {
      showAlert('Export Failed', 'Unable to export PDF.', undefined, 'error');
    }
  };



  const parseSchoolYear = (sy?: string) => {

    const raw = String(sy || '').replace(/[^0-9]/g, '');

    const n = Number(raw);

    return Number.isFinite(n) ? n : -1; // -1 ranks last

  };



  const compareBySchoolYearDescThenName = (a: { schoolYear?: string; name: string }, b: { schoolYear?: string; name: string }) => {

    const ay = parseSchoolYear(a.schoolYear);

    const by = parseSchoolYear(b.schoolYear);

    if (ay !== by) return by - ay; // desc by year

    return String(a.name || '').localeCompare(String(b.name || ''));

  };



  const handleCloseClass = (cls: { id: string; name: string }) => {

    showAlert(

      'Close Class',

      `Are you sure you want to close "${cls.name}"? This will mark the class as inactive and lock all class files from being edited. You can still view it from the Class panel.`,

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Close Class',

          style: 'destructive',

          onPress: async () => {

            try {

              setClosingClassId(cls.id);

              const { error } = await updateData(`/sections/${cls.id}`, {

                status: 'inactive',

                closedAt: new Date().toISOString(),

              });

              if (error) {

                showAlert('Error', error || 'Failed to close class.', undefined, 'error');

                return;

              }

              showAlert('Class Closed', 'The class has been marked as inactive.', undefined, 'success');

              if (currentUserId) {

                await loadTeacherClasses(currentUserId);

              }

            } catch (e) {

              showAlert('Error', 'Failed to close class.', undefined, 'error');

            } finally {

              setClosingClassId(null);

            }

          },

        },

      ],

      'warning'

    );

  };


  const handleDeleteClass = (cls: { id: string; name: string }) => {

    showAlert(

      'Delete Class',

      `This will permanently delete "${cls.name}", all students in it, and their parent records. This cannot be undone. Continue?`,

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Delete Class',

          style: 'destructive',

          onPress: async () => {

            try {

              setDeletingClassId(cls.id);

              // Load all students to ensure we have the latest list
              const { data: studentsData } = await readData('/students');
              const studentsInClass = Object.values(studentsData || {}).filter((s: any) => String(s.classId) === String(cls.id));

              // Delete students and their parents (including login code mapping)
              for (const s of studentsInClass as any[]) {
                try {
                  if (s.parentId) {
                    const { data: parentData } = await readData(`/parents/${s.parentId}`);
                    if (parentData && parentData.loginCode) {
                      await deleteData(`/parentLoginCodes/${parentData.loginCode}`);
                    }
                    await deleteData(`/parents/${s.parentId}`);
                  }
                  if (s.studentId) {
                    await deleteData(`/students/${s.studentId}`);
                  }
                } catch {}
              }

              // Delete the class itself
              await deleteData(`/classes/${cls.id}`);

              showAlert('Deleted', 'Class and related records were removed.', undefined, 'success');

              // Refresh classes
              if (currentUserId) {
                await loadTeacherClasses(currentUserId);
              }

            } catch (e) {

              showAlert('Error', 'Failed to delete class.', undefined, 'error');

            } finally {

              setDeletingClassId(null);

            }

          },

        },

      ],

      'warning'

    );

  };

  const handleShowParentsList = (classId: string) => {

    setSelectedClassForParentsList(classId);

    setShowParentsListModal(true);

  };

  const handleShowParentInfo = (student: any, parent: any) => {

    setSelectedParentForInfo({ student, parent });

    setShowParentsListModal(false);

    setShowParentInfoModal(true);

  };

  const generateLoginCode = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');



  const generateUniqueLoginCode = async (): Promise<string> => {

    for (let i = 0; i < 10; i++) {

      const code = generateLoginCode();

      const { data } = await readData(`/parentLoginCodes/${code}`);

      if (!data) return code;

    }

    // Fallback if collisions keep happening

    return `${Date.now()}`.slice(-6);

  };



  // Parse full name into First Name, MI, and Surname
  const parseFullName = (fullName: string): { firstName: string; middleInitial: string; surname: string } => {
    const trimmed = fullName.trim();
    if (!trimmed) return { firstName: '', middleInitial: '', surname: '' };
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], middleInitial: '', surname: '' };
    } else if (parts.length === 2) {
      return { firstName: parts[0], middleInitial: '', surname: parts[1] };
    } else {
      const firstName = parts[0];
      const surname = parts[parts.length - 1];
      const middleInitial = parts[1] ? (parts[1].charAt(0).toUpperCase() + '.') : '';
      return { firstName, middleInitial, surname };
    }
  };

  // Format student name for display
  const formatStudentName = (student: any): string => {
    if (!student) return 'Unknown Student';
    const last = (student.surname || '').trim();
    const first = (student.firstName || '').trim();
    const mi = (student.middleInitial || '').trim();
    if (last && first) {
      const miPart = mi ? ` ${mi}` : '';
      return `${last}, ${first}${miPart}`;
    }
    if (student.fullName && student.fullName.trim()) {
      // Try to reformat legacy fullName into Last, First MI
      const { firstName, middleInitial, surname } = parseFullName(student.fullName);
      const miPart = middleInitial ? ` ${middleInitial}` : '';
      if (surname && firstName) return `${surname}, ${firstName}${miPart}`;
      return student.fullName.trim();
    }
    if (student.nickname && student.nickname.trim()) {
      return student.nickname.trim();
    }
    return 'Unknown Student';
  };

  const getParentStatus = (parent: any) => {

    if (!parent) {

      return { text: 'No Parent', color: '#ef4444' };

    }

    if (parent.infoStatus === 'completed') {

      return { text: 'Registered', color: '#10b981' };

    }

    if (parent.infoStatus === 'pending') {

      return { text: 'Pending', color: '#f59e0b' };

    }

    return { text: 'Pending', color: '#f59e0b' };

  };
  // Get student initials for avatar
  const getStudentInitials = (student: any): string => {
    if (student.firstName && student.surname) {
      return `${student.firstName.charAt(0)}${student.surname.charAt(0)}`.toUpperCase();
    }
    if (student.fullName) {
      const parts = student.fullName.split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
      }
      return parts[0].charAt(0).toUpperCase();
    }
    if (student.nickname) {
      return student.nickname.charAt(0).toUpperCase();
    }
    return 'S';
  };

  const handleOpenAddStudent = (cls: { id: string; name: string }) => {

    setSelectedClassForStudent(cls);

    setSelectedStudentForEdit(null);

    setStudentLastName('');
    setStudentFirstName('');
    setStudentMiddleInitial('');

    setStudentGender('male');

    setShowAddStudentModal(true);

  };



  const handleCreateStudent = async () => {

    if (!selectedClassForStudent) return;

    if (!studentLastName.trim() || !studentFirstName.trim()) { showAlert('Error', 'Enter Lastname and Firstname (Middle Initial optional).', undefined, 'error'); return; }

    try {

      setSavingStudent(true);

      // Generate login code
      const loginCode = await generateLoginCode();

      const firstName = studentFirstName.trim();
      const surname = studentLastName.trim();
      const middleInitial = studentMiddleInitial.trim() ? (studentMiddleInitial.trim().toUpperCase().replace(/\.$/, '') + '.') : '';

      if (!firstName || !surname) {
        showAlert('Error', 'Please enter at least a first name and surname (e.g., "Juan Dela Cruz").', undefined, 'error');
        setSavingStudent(false);
        return;
      }

      // Create parent with readable ID (PARENT-0001, PARENT-0002, etc.)
      const parentResult = await createParent({
        loginCode,
        infoStatus: 'pending'
      });

      if (!parentResult.success || !parentResult.parentId) {
        showAlert('Error', parentResult.error || 'Failed to create parent.', undefined, 'error');
        setSavingStudent(false);
        return;
      }

      const parentId = parentResult.parentId;
      console.log(`[CreateStudent] Created parent with ID: ${parentId}, login code: ${loginCode}`);

      // Create student with readable ID (STUDENT-SECTION-0001, etc.)
      const studentResult = await createStudent({
        classId: selectedClassForStudent.id,
        parentId,
        firstName,
        middleInitial: middleInitial || '',
        surname,
        fullName: `${surname}, ${firstName}${middleInitial ? ` ${middleInitial}` : ''}`,
        gender: studentGender,
        gradeSection: selectedClassForStudent.name || 'DEFAULT'
      });

      if (!studentResult.success || !studentResult.studentId) {
        showAlert('Error', studentResult.error || 'Failed to create student.', undefined, 'error');
        setSavingStudent(false);
        return;
      }

      const studentId = studentResult.studentId;
      console.log(`[CreateStudent] Created student with ID: ${studentId}`);

      // Refresh lists

      await loadStudentsAndParents(teacherClasses.map((c) => c.id));

      

      // Close modal first

      setShowAddStudentModal(false);

      setSavingStudent(false);

      

      // Show alert after modal is closed

      setTimeout(() => {

        showAlert(

          'Student Created',

          `Student: ${firstName} ${middleInitial} ${surname}\n\nShare this Parent Login Code with the guardian: ${loginCode}`,

          [

            {

              text: 'Create Another',

              onPress: () => {

                setStudentLastName('');
                setStudentFirstName('');
                setStudentMiddleInitial('');

                setShowAddStudentModal(true);

              },

            },

            {

              text: 'Done',

              style: 'default',

            },

          ],

          'success'

        );

      }, 300);

    } catch (e) {

      showAlert('Error', 'Failed to create student.', undefined, 'error');

      setSavingStudent(false);

    }

  };


  const handleUpdateStudent = async () => {

    if (!selectedClassForStudent || !selectedStudentForEdit) return;

    if (!studentLastName.trim() || !studentFirstName.trim()) { showAlert('Error', 'Enter Lastname and Firstname (Middle Initial optional).', undefined, 'error'); return; }

    try {

      setSavingStudent(true);

      const firstName = studentFirstName.trim();
      const surname = studentLastName.trim();
      const middleInitial = studentMiddleInitial.trim() ? (studentMiddleInitial.trim().toUpperCase().replace(/\.$/, '') + '.') : '';

      if (!firstName || !surname) {
        showAlert('Error', 'Please enter at least a first name and surname (e.g., "Juan Dela Cruz").', undefined, 'error');
        setSavingStudent(false);
        return;
      }

      // Update the existing student record
      await updateData(`/students/${selectedStudentForEdit.studentId}`, {
        firstName,
        middleInitial: middleInitial || '',
        surname,
        fullName: `${surname}, ${firstName}${middleInitial ? ` ${middleInitial}` : ''}`,
        gender: studentGender,
      });

      // Refresh lists for affected class only
      await loadStudentsAndParents([selectedClassForStudent.id]);

      // Close modal
      setShowAddStudentModal(false);
      setSavingStudent(false);
      setSelectedStudentForEdit(null);

      showAlert('Updated', 'Student details saved.', undefined, 'success');

    } catch (e) {

      showAlert('Error', 'Failed to update student.', undefined, 'error');
      setSavingStudent(false);

    }

  };



  // Student menu handlers

  const handleEditStudent = (student: any, classInfo: { id: string; name: string }) => {

    setSelectedClassForStudent(classInfo);

    // Reconstruct full name from stored components, or use fullName if available
    setStudentLastName(String(student.surname || ''));
    setStudentFirstName(String(student.firstName || ''));
    setStudentMiddleInitial(String((student.middleInitial || '').replace(/\./g, '')));

    setStudentGender(String(student.gender || 'male') === 'female' ? 'female' : 'male');

    setSelectedStudentForEdit(student);

    setShowAddStudentModal(true);

    setStudentMenuVisible(null);

  };



  const handleDeleteStudent = (student: any, classId: string) => {

    showAlert(

      'Delete Student',

      `Remove "${formatStudentName(student)}" from this class? This cannot be undone.`,

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Delete',

          style: 'destructive',

          onPress: async () => {

            try {

              await deleteData(`/students/${student.studentId}`);

              await loadStudentsAndParents([classId]);

              showAlert('Removed', 'Student deleted.', undefined, 'success');

            } catch (e) {

              showAlert('Error', 'Failed to delete student.', undefined, 'error');

            }

          },

        },

      ],

      'warning'

    );

    setStudentMenuVisible(null);

  };



  const handleViewParentInfo = (student: any) => {

    const parentData = student.parentId ? parentsById[student.parentId] : null;

    if (parentData) {

      setSelectedParentForInfo({

        student: student,

        parent: parentData

      });

      setShowParentInfoModal(true);

    } else {

      showAlert('Info', 'Parent information not available.', undefined, 'info');

    }

    setStudentMenuVisible(null);

  };



  const fetchTeacherData = async (userId: string) => {

    try {

      setLoading(true);

      const { data, error } = await readData(`/teachers/${userId}`);

      

      if (error) {

        console.error('Error fetching teacher data:', error);

        // Use mock data for testing

        setTeacherData({

          firstName: 'John',

          lastName: 'Doe',

          email: 'john.doe@example.com',

          phone: '+1234567890',

          school: 'Camohaguin Elementary School',

          profilePictureUrl: '',

          uid: userId,

          createdAt: new Date().toISOString(),

        });

      } else if (data) {

        setTeacherData(data);

        setEditData(data);

      }

    } catch (error) {

      console.error('Error fetching teacher data:', error);

    } finally {

      setLoading(false);

    }

  };



  const handleProfilePress = () => {

    setShowProfileModal(true);

    setEditData(teacherData);

  };



  const handleEdit = () => {

    setEditing(true);

  };



  const handleSave = async () => {

    if (!editData) return;



    try {

      setUploading(true);

      

      let profilePictureUrl = editData.profilePictureUrl;

      

      // If profile picture was changed, upload new one

      if (editData.profilePictureUrl !== teacherData?.profilePictureUrl) {

        // This would be implemented when user selects new photo

        // For now, keep existing URL

      }



      const updatedData = {

        ...editData,

        profilePictureUrl,

      };



      const { success, error } = await updateData(`/teachers/${currentUserId}`, updatedData);

      

      setUploading(false);

      

      if (success) {

        setTeacherData(updatedData);

        setEditing(false);

        setShowProfileModal(false);

        // Show alert after modal is closed

        setTimeout(() => {

          showAlert('Success', 'Profile updated successfully!', undefined, 'success');

        }, 300);

      } else {

        showAlert('Error', `Failed to update profile: ${error}`, undefined, 'error');

      }

    } catch (error) {

      setUploading(false);

      showAlert('Error', 'Failed to update profile', undefined, 'error');

    }

  };



  const handleCancel = () => {

    setEditing(false);

    setEditData(teacherData);

  };



  const handleLogout = async () => {

    try {

      await signOutUser();

    } catch (e) {

      // ignore

    } finally {

      setShowProfileModal(false);

      router.replace('/RoleSelection');

    }

  };



  const handleInputChange = (field: keyof TeacherData, value: string) => {

    if (editData) {

      setEditData({ ...editData, [field]: value });

    }

  };



  // Refresh handler for pull-to-refresh

  const onRefresh = async () => {

    setRefreshing(true);

    try {

      if (currentUserId) {

        // Refresh teacher data

        await fetchTeacherData(currentUserId);

        

        // Refresh data based on active tab

        switch (activeTab) {

          case 'home':

            // Refresh announcements and classes for home tab

            await loadTeacherClasses(currentUserId);

            break;

          case 'list':

            // Refresh student lists

            if (teacherClasses.length > 0) {

              await loadStudentsAndParents(teacherClasses.map(c => c.id));

            }

            break;

          case 'class':

            // Refresh classes and students

            await loadTeacherClasses(currentUserId);

            if (teacherClasses.length > 0) {

              await loadStudentsAndParents(teacherClasses.map(c => c.id));

            }

            break;

          case 'results':

            // Refresh exercise results and assignments

            if (activeClasses.length > 0) {

              await loadAssignments(activeClasses.map(c => c.id));

              await loadClassAnalytics(activeClasses.map(c => c.id));

            }

            break;

          case 'exercises':

            // Refresh exercises based on current tab

            if (exercisesTab === 'my') {

              await loadMyExercises();

            } else if (exercisesTab === 'public') {

              await loadPublicExercises();

            } else if (exercisesTab === 'assigned') {

              await loadAssignedExercises();

              if (activeClasses.length > 0) {

                await loadAssignments(activeClasses.map(c => c.id));

              }

            }

            break;

        }

      }

    } catch (error) {

      console.error('Error refreshing data:', error);

    } finally {

      setRefreshing(false);

    }

  };



  const handleChangePhoto = async () => {

    try {

      // Request media library permissions

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      

      if (status !== 'granted') {

        showAlert('Permission Required', 'Media library permission is required to select photos.', undefined, 'warning');

        return;

      }



      const result = await ImagePicker.launchImageLibraryAsync({

        mediaTypes: 'images',

        allowsEditing: true,

        aspect: [1, 1],

        quality: 0.8,

      });



      if (!result.canceled && result.assets[0] && editData) {

        // Upload new photo to Firebase Storage

        const response = await fetch(result.assets[0].uri);

        const blob = await response.blob();

        const timestamp = Date.now();

        const filename = `teachers/profiles/${currentUserId}_${timestamp}.jpg`;

        

        const { downloadURL, error: uploadError } = await uploadFile(filename, blob, {

          contentType: 'image/jpeg',

        });

        

        if (uploadError) {

          showAlert('Error', 'Failed to upload photo', undefined, 'error');

          return;

        }

        

        // Update editData with new photo URL

        setEditData({ ...editData, profilePictureUrl: downloadURL || '' });

        // Don't show alert here - user will see success when they save the profile

      }

    } catch (error) {

      showAlert('Error', 'Failed to change photo', undefined, 'error');

      console.error('Photo change error:', error);

    }

  };



  // Technical Report Functions

  const pickReportImage = async () => {

    try {

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {

        showAlert('Permission Required', 'Please grant permission to access photos.', undefined, 'warning');

        return;

      }



      const result = await ImagePicker.launchImageLibraryAsync({

        mediaTypes: ImagePicker.MediaTypeOptions.Images,

        allowsMultipleSelection: true,

        quality: 0.8,

        selectionLimit: 5 - reportScreenshots.length,

      });



      if (!result.canceled && result.assets) {

        const newUris = result.assets.map(asset => asset.uri);

        setReportScreenshots(prev => [...prev, ...newUris].slice(0, 5));

      }

    } catch (error) {

      console.error('Error picking image:', error);

      showAlert('Error', 'Failed to pick image. Please try again.', undefined, 'error');

    }

  };
  const takeReportPhoto = async () => {

    try {

      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {

        showAlert('Permission Required', 'Please grant permission to access camera.', undefined, 'warning');

        return;

      }



      const result = await ImagePicker.launchCameraAsync({

        quality: 0.8,

      });



      if (!result.canceled && result.assets && result.assets[0]) {

        if (reportScreenshots.length < 5) {

          setReportScreenshots(prev => [...prev, result.assets[0].uri]);

        } else {

          showAlert('Limit Reached', 'You can only attach up to 5 screenshots.', undefined, 'warning');

        }

      }

    } catch (error) {

      console.error('Error taking photo:', error);

      showAlert('Error', 'Failed to take photo. Please try again.', undefined, 'error');

    }

  };



  const removeReportScreenshot = (uri: string) => {

    setReportScreenshots(prev => prev.filter(s => s !== uri));

  };



  const submitTechnicalReport = async () => {

    if (!reportDescription.trim()) {

      showAlert('Missing Information', 'Please describe the problem.', undefined, 'warning');

      return;

    }



    setSubmittingReport(true);

    try {

      const timestamp = new Date().toISOString();

      const random = Math.floor(Math.random() * 9000);

      const ticketNumber = `TICKET${random.toString().padStart(4, '0')}`;

      const reportId = ticketNumber;

      
      // Collect app and device metadata
      const metadata = await collectAppMetadata();
      console.log('Collected app metadata for ticket:', metadata);



      // Upload screenshots to Firebase Storage

      const uploadedUrls: string[] = [];

      for (let i = 0; i < reportScreenshots.length; i++) {

        const uri = reportScreenshots[i];

        const fileName = `technical-reports/${reportId}/screenshot_${i + 1}.jpg`;

        

        const response = await fetch(uri);

        const blob = await response.blob();

        const { downloadURL } = await uploadFile(fileName, blob);

        if (downloadURL) {

          uploadedUrls.push(downloadURL);

        }

      }



      const report = {

        id: reportId,

        ticketNumber: ticketNumber,

        reportedBy: currentUserId || 'unknown',

        reportedByEmail: teacherData?.email || 'unknown',

        reportedByName: teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Unknown Teacher',

        userRole: 'teacher' as const,

        timestamp,

        description: reportDescription.trim(),

        screenshots: uploadedUrls,

        status: 'pending' as const,

        // Add comprehensive metadata
        appVersion: metadata.appVersion,
        updateId: metadata.updateId,
        runtimeVersion: metadata.runtimeVersion,
        platform: metadata.platform,
        platformVersion: metadata.platformVersion,
        deviceInfo: metadata.deviceInfo,
        environment: metadata.environment,
        buildProfile: metadata.buildProfile,
        expoVersion: metadata.expoVersion,
        submittedAt: metadata.timestamp,

      };



      const { success, error } = await writeData(`/technicalReports/${reportId}`, report);

      

      if (success) {

        setShowTechReportModal(false);

        setReportDescription('');

        setReportScreenshots([]);

        showAlert('Success', `Report submitted successfully!\n\nYour Ticket Number:\n${ticketNumber}\n\nPlease save this number for reference. Thank you for helping us improve!`, undefined, 'success');

      } else {

        throw new Error(error || 'Failed to submit report');

      }

    } catch (error) {

      console.error('Error submitting report:', error);
      if (error instanceof Error) {
        logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to submit technical report');
      } else {
        logError('Failed to submit technical report: ' + String(error), 'error', 'TeacherDashboard');
      }

      showAlert('Error', 'Failed to submit report. Please try again.', undefined, 'error');

    } finally {

      setSubmittingReport(false);

    }

  };





  // Don't render until auth state resolves

  if (currentUserId === undefined) {

    return (

      <View style={styles.loadingContainer}>

        <Text style={styles.loadingText}>Loading...</Text>

      </View>

    );

  }



  if (loading) {

    return (

      <View style={styles.loadingContainer}>

        <Text style={styles.loadingText}>Loading...</Text>

      </View>

    );

  }



  return (

    <View style={styles.container}>

      {/* Background Pattern */}

      <View style={styles.backgroundPattern} />

      

      <ScrollView 

        style={styles.scrollView} 

        showsVerticalScrollIndicator={false}

        nestedScrollEnabled={true}

        keyboardShouldPersistTaps="handled"

        refreshControl={

          <RefreshControl

            refreshing={refreshing}

            onRefresh={onRefresh}

            colors={['#3b82f6']} // Android

            tintColor="#3b82f6" // iOS

          />

        }

      >

         {/* Header Section */}

         <View style={styles.header}>

           <TouchableOpacity style={styles.avatarContainer} onPress={handleProfilePress}>

             {teacherData?.profilePictureUrl ? (

               <Image 

                 source={{ uri: teacherData.profilePictureUrl }} 

                 style={styles.avatarImage}

               />

             ) : (

               <View style={styles.avatar}>

                 <MaterialIcons name="person" size={40} color="#4a5568" />

               </View>

             )}

           </TouchableOpacity>

           <View style={styles.welcomeText}>

             <Text style={styles.welcomeLabel}>Welcome,</Text>

             <View style={styles.nameRow}>

               <Text style={styles.welcomeTitle}>

                 {teacherData ? `${teacherData.firstName} ${teacherData.lastName}` : 'Teacher'}

               </Text>

               {teacherData?.isVerified ? (

                 <MaterialCommunityIcons name="check-decagram" size={20} color="#10b981" style={{ marginLeft: 8 }} />

               ) : null}

             </View>

           </View>

         </View>



         {activeTab === 'home' && (

           <>

             {/* Make Announcement Card */}

             <View style={styles.announcementCard}>

               <View style={styles.announcementGradient}>

                 <View style={styles.announcementHeader}>

                   <View style={styles.megaphoneIcon}>

                     <MaterialCommunityIcons name="bullhorn" size={32} color="#3b82f6" />

                   </View>

                   <View style={styles.announcementTitleContainer}>

                     <Text style={styles.announcementTitle}>Make Announcement</Text>

                     <View style={styles.announcementBadge}>

                       <Text style={styles.announcementBadgeText}>Quick</Text>

                     </View>

                   </View>

                 </View>

                 <Text style={styles.announcementText}>

                   Share important updates, reminders, and news with your students and their parents instantly.

                 </Text>

                 <View style={styles.announcementFeatures}>

                   <View style={styles.featureItem}>

                     <MaterialCommunityIcons name="account-group" size={16} color="#64748b" />

                     <Text style={styles.featureText}>Target specific classes</Text>

                   </View>

                   <View style={styles.featureItem}>

                     <MaterialCommunityIcons name="clock-outline" size={16} color="#64748b" />

                     <Text style={styles.featureText}>Instant delivery</Text>

                   </View>

                 </View>

                 <TouchableOpacity

                   style={styles.announcementButton}

                   onPress={async () => {

                     setShowAnnModal(true);

                     if (currentUserId) {

                       await loadTeacherClasses(currentUserId);

                       setAnnSelectedClassIds([]);

                     }

                   }}

                 >

                   <MaterialCommunityIcons name="plus" size={20} color="#ffffff" />

                   <Text style={styles.announcementButtonText}>Create Announcement</Text>

                 </TouchableOpacity>

               </View>

             </View>



            {/* Action Buttons */}

            <ResponsiveCards 
              cardsPerRow={{ xs: 2, sm: 2, md: 3, lg: 4, xl: 4 }}
              style={styles.actionButtons}
            >

              <TouchableOpacity style={styles.actionCard} onPress={() => setShowAddClassModal(true)}>

               <View style={styles.actionGradient1}>

                 <View style={styles.actionIcon}>

                   <MaterialCommunityIcons name="google-classroom" size={responsive.scale(28)} color="#3182ce" />

                 </View>

                 <Text style={styles.actionText}>Add Class</Text>

                </View>

              </TouchableOpacity>

              

             <TouchableOpacity style={styles.actionCard} onPress={() => setActiveTab('exercises')}>

               <View style={styles.actionGradient2}>

                 <View style={styles.actionIcon}>

                   <MaterialCommunityIcons name="abacus" size={responsive.scale(28)} color="#38a169" />

                 </View>

                 <Text style={styles.actionText}>Exercises</Text>

               </View>

             </TouchableOpacity>

            </ResponsiveCards>





             {/* Classrooms Section */}

             <View style={styles.classroomsSection}>

               <View style={styles.classroomsSectionHeader}>
                 <View>
                   <Text style={styles.sectionTitle}>My Classrooms</Text>
                   <Text style={styles.sectionSubtitle}>Manage your classes and track progress</Text>
                 </View>
                 <View style={styles.classroomBadge}>
                   <Text style={styles.classroomBadgeText}>{activeClasses.length}</Text>
                 </View>
               </View>

               {activeClasses.length === 0 ? (

                 <View style={styles.emptyStateContainer}>
                   <MaterialCommunityIcons name="school-outline" size={64} color="#cbd5e1" />
                   <Text style={styles.emptyStateTitle}>No Active Classes</Text>
                   <Text style={styles.emptyStateText}>Create your first classroom to get started</Text>
                 </View>

               ) : (

                activeClasses.map((cls, index) => (

                  <View key={cls.id} style={styles.classroomCard}>

                    {/* Gradient Header */}
                    <View style={[styles.classroomCardHeader, { 
                      backgroundColor: index % 4 === 0 ? '#3b82f6' : 
                                       index % 4 === 1 ? '#8b5cf6' :
                                       index % 4 === 2 ? '#10b981' : '#f59e0b'
                    }]}>
                      <View style={styles.classroomHeaderLeft}>
                        <View style={styles.classroomIconContainer}>
                          <MaterialCommunityIcons name="school" size={24} color="#ffffff" />
                        </View>
                        <View style={styles.classroomHeaderInfo}>
                          <Text style={styles.classroomTitle}>{cls.name}</Text>
                          <Text style={styles.classroomSubtitle}>{cls.schoolName || 'No School Name'}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        accessibilityLabel="More actions"
                        onPress={() => setOpenMenuClassId(openMenuClassId === cls.id ? null : cls.id)}
                        style={styles.moreButton}
                      >
                        <MaterialIcons name="more-vert" size={24} color="#ffffff" />
                      </TouchableOpacity>

                      {openMenuClassId === cls.id && (
                        <View style={styles.moreMenu}>
                          <TouchableOpacity
                            style={styles.moreMenuItem}
                            onPress={() => {
                              setOpenMenuClassId(null);
                              handleOpenAddStudent({ id: cls.id, name: cls.name });
                            }}
                          >
                            <AntDesign name="plus" size={16} color="#1e293b" />
                            <Text style={styles.moreMenuText}>Add Student</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.moreMenuItem}
                            onPress={() => {
                              setOpenMenuClassId(null);
                              handleShowParentsList(cls.id);
                            }}
                          >
                            <MaterialCommunityIcons name="account-group-outline" size={16} color="#1e293b" />
                            <Text style={styles.moreMenuText}>View Parents</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.moreMenuItem}
                            onPress={() => {
                              setOpenMenuClassId(null);
                              handleCloseClass(cls);
                            }}
                            disabled={closingClassId === cls.id}
                          >
                            <MaterialCommunityIcons name="lock" size={16} color="#ef4444" />
                            <Text style={[styles.moreMenuText, { color: '#ef4444' }]}>{closingClassId === cls.id ? 'Closing…' : 'Close Class'}</Text>
                          </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.moreMenuItem}
                                onPress={() => {
                                  setOpenMenuClassId(null);
                                  handleDeleteClass(cls);
                                }}
                                disabled={deletingClassId === cls.id}
                              >
                                <MaterialCommunityIcons name="delete-forever" size={16} color="#ef4444" />
                                <Text style={[styles.moreMenuText, { color: '#ef4444' }]}>{deletingClassId === cls.id ? 'Deleting…' : 'Delete Class'}</Text>
                              </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Card Body */}
                    <View style={styles.classroomCardBody}>
                      {/* School Year Badge */}
                      <View style={styles.schoolYearBadge}>
                        <MaterialCommunityIcons name="calendar-today" size={14} color="#64748b" />
                        <Text style={styles.schoolYearText}>SY {formatSchoolYear(cls.schoolYear)}</Text>
                      </View>

                      {/* Student Statistics Section */}
                      <View style={styles.studentStatsContainer}>
                        <View style={styles.studentStatsHeader}>
                          <MaterialCommunityIcons name="account-group" size={18} color="#1e293b" />
                          <Text style={styles.studentStatsTitle}>Student Demographics</Text>
                        </View>
                        <View style={styles.studentStatsGrid}>
                          <View style={[styles.studentStatCard, styles.studentStatCardTotal]}>
                            <View style={styles.studentStatIconContainer}>
                              <MaterialCommunityIcons name="account-group" size={responsive.scale(20)} color="#3b82f6" />
                            </View>
                            <Text style={styles.studentStatValue}>{studentsByClass[cls.id]?.length ?? 0}</Text>
                            <Text style={styles.studentStatLabel}>Total Students</Text>
                          </View>
                          <View style={[styles.studentStatCard, styles.studentStatCardMale]}>
                            <View style={styles.studentStatIconContainer}>
                              <MaterialCommunityIcons name="human-male" size={responsive.scale(20)} color="#10b981" />
                            </View>
                            <Text style={styles.studentStatValue}>
                              {studentsByClass[cls.id]?.filter(s => s.gender === 'male').length ?? 0}
                            </Text>
                            <Text style={styles.studentStatLabel}>Male Students</Text>
                          </View>
                          <View style={[styles.studentStatCard, styles.studentStatCardFemale]}>
                            <View style={styles.studentStatIconContainer}>
                              <MaterialCommunityIcons name="human-female" size={responsive.scale(20)} color="#f59e0b" />
                            </View>
                            <Text style={styles.studentStatValue}>
                              {studentsByClass[cls.id]?.filter(s => s.gender === 'female').length ?? 0}
                            </Text>
                            <Text style={styles.studentStatLabel}>Female Students</Text>
                          </View>
                        </View>
                      </View>

                      {/* Exercise Statistics */}
                      <View style={styles.exerciseStatsContainer}>
                        <View style={styles.exerciseStatsRow}>
                          <View style={styles.exerciseStatItem}>
                            <View style={[styles.exerciseStatIconBg, { backgroundColor: '#ede9fe' }]}>
                              <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#8b5cf6" />
                            </View>
                            <View style={styles.exerciseStatInfo}>
                              <Text style={styles.exerciseStatValue}>{assignmentsByClass[cls.id]?.total ?? 0}</Text>
                              <Text style={styles.exerciseStatLabel}>Exercises</Text>
                            </View>
                          </View>

                          <View style={styles.exerciseStatDivider} />

                          <View style={styles.exerciseStatItem}>
                            <View style={[styles.exerciseStatIconBg, { backgroundColor: '#dcfce7' }]}>
                              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#10b981" />
                            </View>
                            <View style={styles.exerciseStatInfo}>
                              <Text style={styles.exerciseStatValue}>{assignmentsByClass[cls.id]?.completed ?? 0}</Text>
                              <Text style={styles.exerciseStatLabel}>Completed</Text>
                            </View>
                          </View>

                          <View style={styles.exerciseStatDivider} />

                          <View style={styles.exerciseStatItem}>
                            <View style={[styles.exerciseStatIconBg, { backgroundColor: '#fef3c7' }]}>
                              <MaterialCommunityIcons name="timer-outline" size={18} color="#f59e0b" />
                            </View>
                            <View style={styles.exerciseStatInfo}>
                              <Text style={styles.exerciseStatValue}>{assignmentsByClass[cls.id]?.pending ?? 0}</Text>
                              <Text style={styles.exerciseStatLabel}>Pending</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* View Results Button */}
                      <TouchableOpacity 
                        style={styles.viewResultsButton}
                        onPress={async () => {
                          setActiveTab('results');
                          // Auto-refresh data when switching to results tab to get latest completion stats
                          if (activeClasses.length > 0) {
                            await loadAssignments(activeClasses.map(c => c.id));
                            await loadClassAnalytics(activeClasses.map(c => c.id));
                          }
                        }}
                      >
                        <Text style={styles.viewResultsButtonText}>View All Results</Text>
                        <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
                      </TouchableOpacity>
                    </View>

                   </View>

                 ))

               )}

             </View>

           </>

         )}
         {activeTab === 'exercises' && (

           <View style={styles.exercisesSection}>

             {/* Exercises Library Header */}

             <View style={styles.classTabHeader}>

               <View>

                 <Text style={styles.classTabTitle}>Exercises Library</Text>

                 <Text style={styles.classTabSubtitle}>Create, manage, and assign exercises</Text>

               </View>

               <TouchableOpacity 

                  style={styles.createExerciseButtonHeader}

                  onPress={() => router.push('/CreateExercise')}

                >

                  <AntDesign name="plus" size={16} color="#ffffff" />

                  <Text style={styles.createExerciseText}>Create</Text>

                </TouchableOpacity>

             </View>



             {/* Exercises Tabs */}

             <View style={styles.exercisesTabs}>

               <TouchableOpacity 

                 style={[styles.exercisesTab, exercisesTab === 'my' && styles.exercisesTabActive]}

                 onPress={() => {

                   setExercisesTab('my');

                   loadMyExercises();

                 }}

               >

                 <Text style={[styles.exercisesTabText, exercisesTab === 'my' && styles.exercisesTabTextActive]}>My Exercises</Text>

               </TouchableOpacity>

               <TouchableOpacity 

                 style={[styles.exercisesTab, exercisesTab === 'public' && styles.exercisesTabActive]}

                 onPress={() => {

                   setExercisesTab('public');

                   loadPublicExercises();

                 }}

               >

                 <Text style={[styles.exercisesTabText, exercisesTab === 'public' && styles.exercisesTabTextActive]}>Public</Text>

               </TouchableOpacity>

               <TouchableOpacity 

                 style={[styles.exercisesTab, exercisesTab === 'assigned' && styles.exercisesTabActive]}

                 onPress={() => {

                   setExercisesTab('assigned');

                   loadAssignedExercises();

                  // Also load assignments to get exercise results

                  if (activeClasses.length > 0) {

                    loadAssignments(activeClasses.map(c => c.id));

                  }

                 }}

               >

                 <Text style={[styles.exercisesTabText, exercisesTab === 'assigned' && styles.exercisesTabTextActive]}>Assigned</Text>

               </TouchableOpacity>

             </View>



             {/* Exercise Cards */}

             <ScrollView 

               style={styles.exerciseCardsContainer}

               nestedScrollEnabled={true}

               keyboardShouldPersistTaps="handled"

               showsVerticalScrollIndicator={false}

             >

               {exercisesTab === 'my' ? (

                 <>

                   {exercisesLoading ? (

                     <View style={styles.loadingContainer}>

                       <Text style={styles.loadingText}>Loading your exercises...</Text>

                     </View>

                   ) : myExercises.length === 0 ? (

                     <View style={styles.emptyState}>

                       <MaterialCommunityIcons name="book-open-variant" size={48} color="#9ca3af" />

                       <Text style={styles.emptyStateText}>No exercises created yet</Text>

                       <Text style={styles.emptyStateSubtext}>Create your first exercise to get started</Text>

                     </View>

                   ) : (

                     myExercises.map((exercise) => (

                       <View key={exercise.id} style={styles.exerciseCard}>

                         {exercise.category && (

                           <View style={styles.categoryBadgeTopRight}>

                             <Text style={styles.categoryBadgeText}>{exercise.category}</Text>

                           </View>

                         )}

                         <View style={styles.exerciseContent}>

                           <Text style={styles.exerciseTitle}>{exercise.title || 'Untitled Exercise'}</Text>

                           <Text 

                             style={styles.exerciseDescription}

                             numberOfLines={3}

                             ellipsizeMode="tail"

                           >

                             {exercise.description || 'No description available'}

                           </Text>

                           <View style={styles.exerciseStats}>

                             <Text style={styles.exerciseStat}>{exercise.questionCount || 0} Questions</Text>

                             <Text style={styles.exerciseStatSeparator}>•</Text>

                             <Text style={styles.exerciseStat}>{exercise.timesUsed || 0} uses</Text>

                             {exercise.isPublic && (
                               <>
                                 <Text style={styles.exerciseStatSeparator}>•</Text>
                                 <Text style={styles.exerciseStat}>{exercise.timesCopied || 0} copies</Text>
                               </>
                             )}

                           </View>

                           <View style={styles.exerciseMeta}>

                             <Text style={styles.exerciseCreator}>By You</Text>

                             <Text style={styles.exerciseDate}>

                               {exercise.createdAt ? new Date(exercise.createdAt).toLocaleDateString() : 'Unknown date'}

                             </Text>

                           </View>

                         </View>

                         <View style={styles.exerciseActions}>

                           <TouchableOpacity 

                             style={styles.exerciseOptions}

                             onPress={() => {

                               showAlert(

                                 'Exercise Options',

                                 'You own this exercise. What would you like to do?',

                                 [

                                 { text: 'Edit', onPress: () => router.push(`/CreateExercise?edit=${exercise.id}`) },

                                 { text: 'Delete', style: 'destructive', onPress: () => handleDeleteExercise(exercise.id) },

                                 { text: 'Make a Copy', onPress: () => handleCopyExercise(exercise) },

                                 { text: 'Cancel', style: 'cancel' }

                                 ],

                                 'info'

                               );

                             }}

                           >

                             <MaterialIcons name="more-vert" size={20} color="#64748b" />

                           </TouchableOpacity>

                         </View>

                         <View style={styles.exerciseBottomActions}>

                           <TouchableOpacity 

                             style={styles.assignButtonBottom}

                             onPress={() => {

                               setSelectedExerciseForAssign(exercise);

                               setShowAssignForm(true);

                             }}

                           >

                             <MaterialCommunityIcons name="send" size={16} color="#ffffff" />

                             <Text style={styles.assignButtonText}>Assign</Text>

                           </TouchableOpacity>

                         </View>

                       </View>

                     ))

                   )}

                 </>

               ) : exercisesTab === 'public' ? (

                 <>

                   {/* Search and Filter Bar */}

                   <View style={styles.filterContainer}>

                     <View style={styles.searchContainer}>

                       <MaterialCommunityIcons name="magnify" size={20} color="#64748b" />

                       <TextInput

                         style={styles.searchInput}

                         placeholder="Search exercises..."

                         placeholderTextColor="#64748b"

                         value={searchQuery}

                         onChangeText={setSearchQuery}

                       />

                     </View>

                     <View style={styles.categoryFilterContainer}>

                       <ScrollView 

                         horizontal 

                         showsHorizontalScrollIndicator={false}

                         contentContainerStyle={styles.categoryScrollContent}

                         style={styles.categoryScrollView}

                         bounces={false}

                         decelerationRate="fast"

                         scrollEventThrottle={16}

                         nestedScrollEnabled={true}

                         keyboardShouldPersistTaps="handled"

                       >

                         {categoryOptions.map((category) => (

                           <TouchableOpacity

                             key={category}

                             style={[

                               styles.categoryFilterButton,

                               selectedCategory === category && styles.categoryFilterButtonActive

                             ]}

                             onPress={() => setSelectedCategory(category)}

                           >

                             <Text style={[

                               styles.categoryFilterText,

                               selectedCategory === category && styles.categoryFilterTextActive

                             ]}>

                               {category}

                             </Text>

                           </TouchableOpacity>

                         ))}

                       </ScrollView>

                     </View>

                   </View>



                   {exercisesLoading ? (

                     <View style={styles.loadingContainer}>

                       <Text style={styles.loadingText}>Loading public exercises...</Text>

                     </View>

                   ) : (() => {

                     // Show all public exercises (including ones created by current user)

                     const groupedExercises = getFilteredAndGroupedExercises(publicExercises);

                     const categories = Object.keys(groupedExercises).sort();

                     

                     if (categories.length === 0) {

                       return (

                         <View style={styles.emptyState}>

                           <MaterialCommunityIcons name="book-open-variant" size={48} color="#9ca3af" />

                           <Text style={styles.emptyStateText}>No exercises found</Text>

                           <Text style={styles.emptyStateSubtext}>

                             {searchQuery || selectedCategory !== 'All' 

                               ? 'Try adjusting your search or filter criteria'

                               : 'Check back later for new exercises shared by other teachers'

                             }

                           </Text>

                         </View>

                       );

                     }

                     

                     return categories.map((category) => (

                       <View key={category} style={styles.categorySection}>

                         <Text style={styles.categoryHeader}>{category}</Text>

                         {groupedExercises[category].map((exercise: any) => (

                           <View key={exercise.id} style={styles.exerciseCard}>

                             {exercise.category && (

                               <View style={styles.categoryBadgeTopRight}>

                                 <Text style={styles.categoryBadgeText}>{exercise.category}</Text>

                               </View>

                             )}

                        

              

                             <View style={styles.exerciseContent}>

                               <Text style={styles.exerciseTitle}>{exercise.title || 'Untitled Exercise'}</Text>

                               <Text 

                                 style={styles.exerciseDescription}

                                 numberOfLines={3}

                                 ellipsizeMode="tail"

                               >

                                 {exercise.description || 'No description available'}

                               </Text>

                               <View style={styles.exerciseStats}>

                                 <Text style={styles.exerciseStat}>{exercise.questionCount || 0} Questions</Text>

                                 <Text style={styles.exerciseStatSeparator}>•</Text>

                                 <Text style={styles.exerciseStat}>{exercise.timesUsed || 0} uses</Text>

                                 <Text style={styles.exerciseStatSeparator}>•</Text>

                                 <Text style={styles.exerciseStat}>{exercise.timesCopied || 0} copies</Text>

                               </View>

                               <View style={styles.exerciseMeta}>

                                 <Text style={styles.exerciseCreator}>

                                   By {exercise.teacherId === currentUserId ? 'You' : (exercise.teacherName || 'Unknown Teacher')}

                                 </Text>

                                 <Text style={styles.exerciseDate}>

                                   {exercise.createdAt ? new Date(exercise.createdAt).toLocaleDateString() : 'Unknown date'}

                                 </Text>

                               </View>

                             </View>

                             <TouchableOpacity 

                               style={styles.exerciseOptions}

                               onPress={() => {

                                 const isOwner = exercise.teacherId === currentUserId;

                                 

                                 if (isOwner) {

                                   // For owners, show a more focused alert with primary actions

                                   showAlert(

                                     'Your Exercise',

                                     'What would you like to do with this exercise?',

                                     [

                                       { text: 'Edit Exercise', onPress: () => handleEditPublicExercise(exercise) },

                                       { text: 'Delete Exercise', onPress: () => handleDeletePublicExercise(exercise), style: 'destructive' },

                                       { text: 'Cancel', style: 'cancel' }

                                     ],

                                     'info'

                                   );

                                 } else {

                                   // For non-owners, show copy option

                                   showAlert(

                                     'Exercise Options',

                                     'What would you like to do with this exercise?',

                                     [

                                       { text: 'Make a Copy', onPress: () => handleCopyExercise(exercise) },

                                       { text: 'Cancel', style: 'cancel' }

                                     ],

                                     'info'

                                   );

                                 }

                               }}

                             >

                               <MaterialIcons name="more-vert" size={20} color="#64748b" />

                             </TouchableOpacity>

                           </View>

                         ))}

                       </View>

                     ));

                   })()}

                 </>
               ) : (

                 // Assigned Exercises Tab

                 <>

                   {/* Header with refresh button */}
                   <View style={styles.assignmentsHeader}>
                     <Text style={styles.assignmentsHeaderTitle}>Assigned Exercises</Text>
                     <TouchableOpacity 
                       style={styles.refreshButton}
                       onPress={async () => {
                         if (activeClasses.length > 0) {
                           await loadAssignments(activeClasses.map(c => c.id));
                           await loadClassAnalytics(activeClasses.map(c => c.id));
                         }
                       }}
                     >
                       <MaterialCommunityIcons name="refresh" size={20} color="#3b82f6" />
                     </TouchableOpacity>
                   </View>

                   {exercisesLoading ? (

                     <View style={styles.loadingContainer}>

                       <Text style={styles.loadingText}>Loading assigned exercises...</Text>

                     </View>

                   ) : assignedExercises.filter((assignment) => 

                     activeClasses.some(activeClass => activeClass.id === assignment.classId)

                   ).length === 0 ? (

                     <View style={styles.emptyState}>

                       <MaterialCommunityIcons name="clipboard-text" size={48} color="#9ca3af" />

                       <Text style={styles.emptyStateText}>No exercises assigned to selected classes</Text>

                       <Text style={styles.emptyStateSubtext}>Assign exercises to your classes to see them here</Text>

                     </View>

                  ) : (

                    (() => {

                      // Group assignments by quarter

                      const filteredAssignments = assignedExercises.filter((assignment) => {

                        return activeClasses.some(activeClass => activeClass.id === assignment.classId);

                      });

                      

                      const groupedByQuarter: Record<string, typeof assignedExercises> = {

                        'Quarter 1': [],

                        'Quarter 2': [],

                        'Quarter 3': [],

                        'Quarter 4': [],

                        'No Quarter': [], // For assignments without a quarter

                      };

                      

                      filteredAssignments.forEach((assignment) => {

                        const quarter = assignment.quarter || 'No Quarter';

                        groupedByQuarter[quarter].push(assignment);

                      });

                      
                      // Sort assignments within each quarter from earliest to latest assigned
                      Object.keys(groupedByQuarter).forEach((q) => {
                        groupedByQuarter[q].sort((a: any, b: any) => {
                          const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
                          const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
                          return ta - tb;
                        });
                      });
                      

                      const quarters = ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4', 'No Quarter'].filter(

                        (quarter) => groupedByQuarter[quarter].length > 0

                      );

                      

                      return quarters.map((quarter) => (

                        <View key={quarter} style={styles.quarterSection}>

                          <View style={styles.quarterHeader}>

                            <MaterialCommunityIcons 

                              name="calendar-range" 

                              size={20} 

                              color="#3b82f6" 

                            />

                            <Text style={styles.quarterHeaderText}>{quarter}</Text>

                            <View style={styles.quarterBadge}>

                              <Text style={styles.quarterBadgeText}>

                                {groupedByQuarter[quarter].length} {groupedByQuarter[quarter].length === 1 ? 'assignment' : 'assignments'}

                              </Text>

                            </View>

                          </View>

                          

                          {groupedByQuarter[quarter].map((assignment) => {

                            const timeRemaining = getTimeRemaining(assignment.deadline);

                            const completionStats = getStudentCompletionStats(assignment);

                            

                            return (

                              <View key={assignment.id} style={styles.assignmentCard}>

                           <View style={styles.assignmentHeader}>

                             <View style={styles.assignmentInfo}>

                               <Text style={styles.assignmentTitle}>

                                 {assignment.exercise?.title || 'Unknown Exercise'}

                               </Text>

                               <Text style={styles.assignmentClass}>

                                 {assignment.className || 'Unknown Class'}

                               </Text>

                             </View>

                             <View style={styles.assignmentOptions}>

                               {/* Status Toggle */}

                               <TouchableOpacity 

                                 style={[

                                   styles.statusToggleButton,

                                   assignment.acceptingStatus === 'closed' && styles.statusToggleButtonClosed

                                 ]}

                                 onPress={() => handleToggleAcceptingStatus(assignment)}

                               >

                                 <MaterialCommunityIcons 

                                   name={assignment.acceptingStatus === 'closed' ? 'lock' : 'lock-open'} 

                                   size={16} 

                                   color={assignment.acceptingStatus === 'closed' ? '#ef4444' : '#10b981'} 

                                 />

                                 <Text style={[

                                   styles.statusToggleText,

                                   assignment.acceptingStatus === 'closed' && styles.statusToggleTextClosed

                                 ]}>

                                   {assignment.acceptingStatus === 'closed' ? 'Closed' : 'Open'}

                                 </Text>

                               </TouchableOpacity>

                               

                               <TouchableOpacity 

                                 style={styles.assignmentActionButton}

                                 onPress={() => handleEditAssignment(assignment)}

                               >

                                 <MaterialIcons name="edit" size={20} color="#3b82f6" />

                               </TouchableOpacity>

                               <TouchableOpacity 

                                 style={styles.assignmentActionButton}

                                 onPress={() => handleDeleteAssignment(assignment)}

                               >

                                 <MaterialIcons name="delete" size={20} color="#ef4444" />

                               </TouchableOpacity>

                             </View>

                           </View>

                           

                           {/* Student Completion Stats */}

                           <View style={styles.assignmentStats}>

                             <TouchableOpacity 

                               style={styles.completionStats}

                               onPress={() => handleShowStudentStatus(assignment)}

                               activeOpacity={0.7}

                             >

                               <View style={styles.completionIcon}>

                                 <MaterialCommunityIcons name="account-group" size={16} color="#3b82f6" />

                               </View>

                               <Text style={styles.completionText}>

                                 {completionStats.completed}/{completionStats.total} students completed

                               </Text>

                               <View style={[styles.completionBadge, { 

                                 backgroundColor: completionStats.percentage === 100 ? '#10b981' : 

                                                completionStats.percentage >= 50 ? '#f59e0b' : '#ef4444'

                               }]}>

                                 <Text style={styles.completionPercentage}>{completionStats.percentage}%</Text>

                               </View>

                               <MaterialCommunityIcons name="chevron-right" size={16} color="#64748b" />

                             </TouchableOpacity>

                             

                             {/* Progress Bar */}

                             <View style={styles.progressBarContainer}>

                               <View style={styles.progressBar}>

                                 <View 

                                   style={[

                                     styles.progressBarFill, 

                                     { 

                                       width: `${completionStats.percentage}%`,

                                       backgroundColor: completionStats.percentage === 100 ? '#10b981' : 

                                                      completionStats.percentage >= 50 ? '#f59e0b' : '#ef4444'

                                     }

                                   ]} 

                                 />

                               </View>

                             </View>

                           </View>

                           

                           <View style={styles.assignmentDetails}>

                             <View style={styles.assignmentDetail}>

                               <MaterialCommunityIcons name="calendar-clock" size={16} color="#64748b" />

                               <Text style={styles.assignmentDetailText}>

                                 Due: {new Date(assignment.deadline).toLocaleDateString()}

                               </Text>

                             </View>

                             <View style={[styles.assignmentDetail, styles.timeRemainingDetail]}>

                               <MaterialCommunityIcons 

                                 name={timeRemaining.urgent ? "clock-alert" : "clock"} 

                                 size={16} 

                                 color={timeRemaining.color} 

                               />

                               <Text style={[styles.assignmentDetailText, { color: timeRemaining.color }]}>

                                 {timeRemaining.text}

                               </Text>

                             </View>

                          </View>

                        </View>

                              );

                            })}

                        </View>

                      ));

                    })()

                  )}

                 </>

               )}

             </ScrollView>

           </View>

         )}



         {activeTab === 'list' && (

           <View style={{ paddingBottom: 140 }}>

             {/* Header */}

             <View style={styles.classTabHeader}>

               <View>

                 <Text style={styles.classTabTitle}>Student Lists</Text>

                 <Text style={styles.classTabSubtitle}>View and manage all your students</Text>

               </View>

               <MaterialCommunityIcons name="account-multiple" size={32} color="#3b82f6" />

             </View>

             {activeClasses.length === 0 ? (

               <View style={styles.emptyStateContainer}>

                 <MaterialCommunityIcons name="account-group-outline" size={64} color="#cbd5e1" />

                 <Text style={styles.emptyStateText}>No active classes</Text>

                 <Text style={styles.emptyStateSubtext}>Create a class to add students</Text>

               </View>

             ) : (

             activeClasses.map((cls) => (

               <TouchableWithoutFeedback key={cls.id} onPress={() => setExportMenuVisible(null)}>
                 <View style={styles.classTabCard}>

                 <View style={styles.classCardHeader}>

                   <View style={styles.classIconContainer}>

                     <MaterialCommunityIcons name="google-classroom" size={24} color="#3b82f6" />

                   </View>

                   <View style={{ flex: 1 }}>

                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>

                       <Text style={styles.classroomTitle}>{cls.name}</Text>

                       <TouchableOpacity 
                         style={styles.exportMenuBtn} 
                         onPress={() => setExportMenuVisible(exportMenuVisible === cls.id ? null : cls.id)}
                         activeOpacity={0.7}
                       >

                         <MaterialIcons name="more-vert" size={20} color="#64748b" />

                       </TouchableOpacity>

                       {exportMenuVisible === cls.id && (
                         <View style={styles.exportMenuDropdown}>
                           <TouchableOpacity 
                             style={styles.exportMenuItem}
                             onPress={() => {
                               setExportMenuVisible(null);
                               exportClassListToPdf(cls);
                             }}
                           >
                             <MaterialCommunityIcons name="file-pdf-box" size={18} color="#ef4444" />
                             <Text style={styles.exportMenuText}>Export PDF</Text>
                           </TouchableOpacity>
                           <TouchableOpacity 
                             style={styles.exportMenuItem}
                             onPress={() => {
                               setExportMenuVisible(null);
                               exportClassListToExcel(cls);
                             }}
                           >
                             <MaterialCommunityIcons name="file-excel-box" size={18} color="#10b981" />
                             <Text style={styles.exportMenuText}>Export Excel</Text>
                           </TouchableOpacity>
                         </View>
                       )}

                     </View>

                     <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>

                       <MaterialIcons name="school" size={14} color="#64748b" />

                       <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>

                     </View>

                     <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>

                       <MaterialIcons name="calendar-today" size={14} color="#64748b" />

                       <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>

                     </View>

                   </View>

                 </View>

                <View style={styles.classStudentCount}>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>

                    <MaterialCommunityIcons name="account-group" size={18} color="#64748b" />

                    <Text style={styles.studentCountText}>{studentsByClass[cls.id]?.length ?? 0} Total Students</Text>

                  </View>

                  <TouchableOpacity style={[styles.addStudentBtn, { backgroundColor: '#3b82f6' }]} onPress={() => handleOpenAddStudent({ id: cls.id, name: cls.name })}>

                    <AntDesign name="plus" size={16} color="#ffffff" />

                    <Text style={[styles.addStudentBtnText, { marginLeft: 6 }]}>Add Student</Text>

                  </TouchableOpacity>

                </View>

                 {(studentsByClass[cls.id] || []).length === 0 ? (

                   <Text style={{ color: '#64748b' }}>No students yet.</Text>

                ) : (

                  <TouchableWithoutFeedback onPress={() => setStudentMenuVisible(null)}>

                    <View style={styles.studentTableWrapper}>

                      <ScrollView

                        horizontal

                        showsHorizontalScrollIndicator={false}

                        contentContainerStyle={styles.studentTableScrollContent}

                      >

                        <View
                          style={[
                            styles.studentTableContent,
                            { minWidth: Math.max(width - 48, 280) }
                          ]}
                        >

                          {/* Header row is rendered below with sortable columns */}

                          {(() => {
                        const rows = (studentsByClass[cls.id] || []).map((s: any) => {
                          const p = s.parentId ? parentsById[s.parentId] : undefined;
                          const name = formatStudentName(s);
                          const gender = String(s.gender || '').toLowerCase() === 'female' ? 'Female' : 'Male';
                          const parentCode = p?.loginCode || '—';
                          const enrolled = p?.infoStatus === 'completed';
                          const sortKeyName = `${(s.surname || '').toLowerCase()} ${(s.firstName || '').toLowerCase()} ${(s.middleInitial || '').toLowerCase()}`.trim();
                          return { s, p, name, gender, parentCode, enrolled, sortKeyName };
                        });

                        const compare = (a: any, b: any) => {
                          if (listSortBy === 'name') {
                            const nameCmp = a.sortKeyName.localeCompare(b.sortKeyName);
                            return listSortOrder === 'asc' ? nameCmp : -nameCmp;
                          }
                          // listSortBy === 'gender'
                          const genderCmpRaw = a.gender.localeCompare(b.gender);
                          if (genderCmpRaw === 0) {
                            // Always A->Z within the same gender
                            return a.sortKeyName.localeCompare(b.sortKeyName);
                          }
                          // Flip only the gender grouping when desc (Male on top), keep within-group unaffected
                          return listSortOrder === 'desc' ? -genderCmpRaw : genderCmpRaw;
                        };

                        const sorted = rows.sort(compare);

                        const toggleSort = (key: 'name' | 'gender') => {
                          if (listSortBy === key) {
                            setListSortOrder(listSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setListSortBy(key);
                            setListSortOrder('asc');
                          }
                        };

                        return (
                          <>
                            <View style={[styles.studentRow, { backgroundColor: '#f8fafc', alignItems: 'center' }]}>
                              <Text style={[styles.studentIndex, { fontWeight: '700', color: '#334155', width: 28, textAlign: 'left' }]}>#</Text>
                              <TouchableOpacity onPress={() => toggleSort('name')} style={{ flex: 1 }}>
                                <Text style={[styles.studentName, { fontWeight: '700', color: '#334155' }]} numberOfLines={1} ellipsizeMode="tail">Name</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => toggleSort('gender')} style={{ width: 80 }}>
                                <Text style={{ color: '#334155', fontWeight: '700', width: 80, textAlign: 'left' }} numberOfLines={1}>Gender</Text>
                              </TouchableOpacity>
                              <Text style={[styles.studentCode, { fontWeight: '700', color: '#334155', width: 90, textAlign: 'left' }]} numberOfLines={1}>Parent Code</Text>
                              <View style={styles.studentActionsHeader} />
                            </View>

                            {sorted.map((row: any, idx: number) => (
                              <View key={row.s.studentId} style={[styles.studentRow, { alignItems: 'center' }]}>
                                <Text style={[styles.studentIndex, { width: 28 }]}>{idx + 1}.</Text>
                                <Text style={[styles.studentName, { flex: 1, minWidth: 120 }]} numberOfLines={1} ellipsizeMode="tail">{row.name}</Text>
                                <Text style={{ width: 80, color: '#111827', textAlign: 'left' }} numberOfLines={1}>{row.gender}</Text>
                                <Text style={[styles.studentCode, { width: 90, textAlign: 'left', color: row.enrolled ? '#111827' : '#ef4444', fontWeight: row.enrolled ? '500' : '700' }]} numberOfLines={1}>{row.parentCode}</Text>
                                <View style={styles.studentActionsWrap}>
                                  <TouchableOpacity
                                    accessibilityLabel="Student options"
                                    onPress={() => setStudentMenuVisible(studentMenuVisible === row.s.studentId ? null : row.s.studentId)}
                                    style={styles.iconBtn}
                                  >
                                    <MaterialIcons name="more-vert" size={20} color="#64748b" />
                                  </TouchableOpacity>
                                  {studentMenuVisible === row.s.studentId && (
                                    <View style={styles.studentMenuDropdown}>
                                      <TouchableOpacity
                                        style={styles.studentMenuItem}
                                        onPress={() => handleEditStudent(row.s, { id: cls.id, name: cls.name })}
                                      >
                                        <MaterialIcons name="edit" size={16} color="#64748b" />
                                        <Text style={styles.studentMenuText}>Edit Student</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={styles.studentMenuItem}
                                        onPress={() => handleViewParentInfo(row.s)}
                                      >
                                        <MaterialIcons name="person" size={16} color="#3b82f6" />
                                        <Text style={styles.studentMenuText}>View Parent Info</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={[styles.studentMenuItem, styles.studentMenuItemDanger]}
                                        onPress={() => handleDeleteStudent(row.s, cls.id)}
                                      >
                                        <MaterialIcons name="delete" size={16} color="#ef4444" />
                                        <Text style={[styles.studentMenuText, styles.studentMenuTextDanger]}>Delete Student</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              </View>
                            ))}
                          </>
                        );
                      })()}

                        </View>

                      </ScrollView>

                    </View>

                  </TouchableWithoutFeedback>

                )}

                 </View>
               </TouchableWithoutFeedback>

             ))

             )}

           </View>

         )}
         {activeTab === 'results' && (

           <View style={{ paddingBottom: 140 }}>

             {/* Compact Header with Quarter Filter */}

             <View style={[styles.classTabHeader, { marginBottom: 12 }]}>

               <View style={{ flex: 1 }}>

                 <Text style={styles.classTabTitle}>Exercise Results</Text>

                 <Text style={[styles.classTabSubtitle, { fontSize: 11 }]}>Grouped by quarter</Text>

               </View>

               <MaterialIcons name="assessment" size={28} color="#3b82f6" />

             </View>
             
             {/* Quarter Filter Pills */}
             <View style={styles.quarterFilterContainer}>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                 <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
                   {['All Quarters', 'Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'].map((quarter) => (
                     <TouchableOpacity
                       key={quarter}
                       style={[
                         styles.quarterPill,
                         selectedQuarter === quarter && styles.quarterPillActive
                       ]}
                       onPress={() => setSelectedQuarter(quarter)}
                     >
                       <Text style={[
                         styles.quarterPillText,
                         selectedQuarter === quarter && styles.quarterPillTextActive
                       ]}>
                         {quarter}
                       </Text>
                     </TouchableOpacity>
                   ))}
                 </View>
               </ScrollView>
             </View>



             {/* Class-wise Results */}

             {activeClasses.length === 0 ? (

               <View style={styles.emptyStateContainer}>

                 <MaterialCommunityIcons name="chart-box-outline" size={64} color="#cbd5e1" />

                 <Text style={styles.emptyStateText}>No results yet</Text>

                 <Text style={styles.emptyStateSubtext}>Results will appear once students complete exercises</Text>

               </View>

             ) : (

             activeClasses.map((cls) => {

               const classResults = exerciseResults[cls.id] || [];

               const classStudents = studentsByClass[cls.id] || [];

               

               // Calculate class statistics

               const totalSubmissions = classResults.length;

               const uniqueStudents = new Set(classResults.map((r: any) => r.studentId)).size;

               const averageScore = totalSubmissions > 0 ? 

                 classResults.reduce((sum: number, result: any) => sum + (result.scorePercentage || 0), 0) / totalSubmissions : 0;

               

               // Note: Class-level metrics removed - now calculated per exercise

               

               return (

                <View key={cls.id} style={styles.resultsClassCard}>

                  <View style={styles.resultsClassHeader}>

                    <View style={styles.resultsClassIcon}>

                      <MaterialCommunityIcons name="google-classroom" size={16} color="#3b82f6" />

                    </View>

                    <View style={styles.resultsClassInfo}>

                      <Text style={styles.resultsClassName}>{cls.name}</Text>

                      <View style={styles.resultsClassMeta}>

                        <MaterialIcons name="school" size={10} color="#64748b" />

                        <Text style={styles.resultsClassMetaText}>{cls.schoolName || '—'}</Text>
                        
                        <View style={styles.resultsClassMetaDivider} />

                        <MaterialIcons name="calendar-today" size={10} color="#64748b" />

                        <Text style={styles.resultsClassMetaText}>SY: {formatSchoolYear(cls.schoolYear)}</Text>

                      </View>

                    </View>

                  </View>

                  



                   {classResults.length === 0 ? (

                     <View style={styles.emptyResultsCard}>

                       <MaterialCommunityIcons name="chart-line" size={48} color="#cbd5e1" />

                       <Text style={styles.emptyResultsText}>No completed exercises yet</Text>

                       <Text style={styles.emptyResultsSubtext}>

                         Results will appear here when students complete assignments

                       </Text>

                     </View>

                   ) : (

                     <View style={styles.resultsList}>

                       {(() => {

                         // Sort results by score percentage (descending) and calculate ranks

                         const sortedResults = [...classResults].sort((a: any, b: any) => 

                           (b.scorePercentage || 0) - (a.scorePercentage || 0)

                         );

                         

                         // Calculate ranks (handling ties properly)

                         const rankedResults = sortedResults.map((result: any, idx: number) => {

                           let rank = idx + 1;

                           

                           // Handle ties - if previous result has same score, use same rank

                           if (idx > 0 && sortedResults[idx - 1].scorePercentage === result.scorePercentage) {

                             // Find the first result with this score to get its rank

                             for (let i = idx - 1; i >= 0; i--) {

                               if (sortedResults[i].scorePercentage === result.scorePercentage) {

                                 rank = i + 1;

                               } else {

                                 break;

                               }

                             }

                           }

                           

                           return { ...result, rank };

                         });

                         

                        // Group results by quarter, then by exercise
                        const resultsByQuarterAndExercise = rankedResults.reduce((acc: any, result: any) => {
                          // Get quarter from assignedExercises first, then fallback to assignmentMetadata
                          let quarter = 'Unknown Quarter';
                          
                          // Try to find the assignment in assignedExercises to get the quarter
                          // First try to match by assignedExerciseId if available, then by exerciseId + classId
                          let assignment = null;
                          
                          if (result.assignedExerciseId) {
                            assignment = assignedExercises.find((assignment: any) => 
                              assignment.id === result.assignedExerciseId
                            );
                          }
                          
                          // If not found by assignedExerciseId, try by exerciseId + classId
                          if (!assignment) {
                            assignment = assignedExercises.find((assignment: any) => 
                              assignment.exerciseId === result.exerciseId && 
                              assignment.classId === result.classId
                            );
                          }
                          
                          if (assignment?.quarter) {
                            quarter = assignment.quarter;
                            console.log('[QUARTER MATCH] Found quarter from assignedExercises:', {
                              exerciseId: result.exerciseId,
                              assignedExerciseId: result.assignedExerciseId,
                              quarter: assignment.quarter,
                              assignmentId: assignment.id
                            });
                          } else if (result.assignmentMetadata?.quarter) {
                            quarter = result.assignmentMetadata.quarter;
                            console.log('[QUARTER MATCH] Using quarter from assignmentMetadata:', quarter);
                          } else {
                            console.log('[QUARTER MATCH] No quarter found for result:', {
                              exerciseId: result.exerciseId,
                              assignedExerciseId: result.assignedExerciseId,
                              classId: result.classId,
                              assignedExercisesLength: assignedExercises.length,
                              allAssignedExercises: assignedExercises.map(a => ({ id: a.id, exerciseId: a.exerciseId, classId: a.classId, quarter: a.quarter })),
                              availableAssignments: assignedExercises.filter(a => a.exerciseId === result.exerciseId && a.classId === result.classId).map(a => ({ id: a.id, quarter: a.quarter }))
                            });
                          }
                          
                          const exerciseTitle = result.exerciseTitle || 'Unknown Exercise';
                          
                          if (!acc[quarter]) {
                            acc[quarter] = {};
                          }
                          
                          if (!acc[quarter][exerciseTitle]) {
                            acc[quarter][exerciseTitle] = [];
                          }
                          
                          acc[quarter][exerciseTitle].push(result);
                          return acc;
                        }, {});
                        
                        // Filter by selected quarter
                        const filteredQuarters = selectedQuarter === 'All Quarters' 
                          ? resultsByQuarterAndExercise 
                          : { [selectedQuarter]: resultsByQuarterAndExercise[selectedQuarter] || {} };



                         // Handle sorting function

                        const handleSort = (newSortBy: 'name' | 'correct' | 'score' | 'remarks' | 'attempts' | 'time') => {

                          if (resultsSortBy === newSortBy) {

                            setResultsSortOrder(resultsSortOrder === 'asc' ? 'desc' : 'asc');

                          } else {

                            setResultsSortBy(newSortBy);

                            setResultsSortOrder('asc');

                          }

                        };



                        return Object.entries(filteredQuarters).map(([quarter, resultsByExercise]: [string, any]) => (
                          <View key={quarter} style={{ marginBottom: 16 }}>
                            {/* Quarter Header with Export Button */}
                            <View style={styles.resultsQuarterHeader}>
                              <View style={styles.resultsQuarterTitleRow}>
                                <MaterialCommunityIcons name="calendar-range" size={16} color="#8b5cf6" />
                                <Text style={styles.resultsQuarterTitle}>{quarter}</Text>
                              </View>
                              <TouchableOpacity
                                style={styles.resultsExportBtn}
                                onPress={() => handleExportQuarterToExcel(quarter, cls.id, resultsByExercise, classStudents)}
                              >
                                <MaterialCommunityIcons name="microsoft-excel" size={14} color="#10b981" />
                                <Text style={styles.resultsExportBtnText}>Export</Text>
                              </TouchableOpacity>
                            </View>
                            
                            {/* Exercises in this quarter */}
                            {Object.entries(resultsByExercise).map(([exerciseTitle, exerciseResults]: [string, any]) => {

                          // Find the assignment for this exercise to get status
                          // First try from assignedExercises, then fall back to assignmentMetadata from results
                          let exerciseAssignment = assignedExercises.find((assignment: any) => 

                            assignment.exerciseId === exerciseResults[0]?.exerciseId && 

                            assignment.classId === cls.id

                          );
                          
                          // If not found in assignedExercises, use the data from the first result's assignmentMetadata
                          if (!exerciseAssignment && exerciseResults[0]?.assignmentMetadata) {
                            const metadata = exerciseResults[0].assignmentMetadata;
                            console.log('[RESULTS STATUS] Using assignmentMetadata fallback for', exerciseTitle, {
                              acceptingStatus: metadata.acceptingStatus,
                              deadline: metadata.deadline
                            });
                            exerciseAssignment = {
                              id: metadata.assignmentId || exerciseResults[0].assignedExerciseId,
                              exerciseId: exerciseResults[0].exerciseId,
                              classId: metadata.classId,
                              acceptingStatus: metadata.acceptingStatus,
                              deadline: metadata.deadline,
                              acceptLateSubmissions: metadata.acceptLateSubmissions
                            } as any;
                          }

                          

                          // Determine if exercise is still accepting results
                          const isAcceptingResults = exerciseAssignment ? 

                            exerciseAssignment.acceptingStatus === 'open' && 

                            (new Date() <= new Date(exerciseAssignment.deadline) || (exerciseAssignment.acceptLateSubmissions ?? true)) : 

                            false;

                           

                           // Sort the exercise results based on current sort settings (default: score descending)

                           const sortedResults = [...exerciseResults].sort((a: any, b: any) => {

                             const aQuestionResults = a.questionResults || [];

                             const bQuestionResults = b.questionResults || [];

                             

                             let aValue, bValue;

                             

                             // Default sorting by score (descending) if no specific sort is set
                             if (!resultsSortBy || resultsSortBy === 'score') {
                               aValue = a.scorePercentage || 0;
                               bValue = b.scorePercentage || 0;
                               return bValue - aValue; // Descending order (highest to lowest)
                             }

                             if (resultsSortBy === 'attempts') {

                               const aTotalAttempts = aQuestionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

                               const bTotalAttempts = bQuestionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

                               aValue = aQuestionResults.length > 0 ? aTotalAttempts / aQuestionResults.length : 1;

                               bValue = bQuestionResults.length > 0 ? bTotalAttempts / bQuestionResults.length : 1;

                               return resultsSortOrder === 'asc' ? aValue - bValue : bValue - aValue;

                             } else if (resultsSortBy === 'time') {

                               aValue = a.totalTimeSpent || 0;

                               bValue = b.totalTimeSpent || 0;

                               return resultsSortOrder === 'asc' ? aValue - bValue : bValue - aValue;

                             } else if (resultsSortBy === 'name') {

                               // Find student names for comparison

                               let studentA = Object.values(studentsByClass).flat().find((s: any) => s.studentId === a.studentId);

                               if (!studentA && a.studentInfo?.name) {
                                 studentA = Object.values(studentsByClass).flat().find((s: any) => 
                                   s.fullName && s.fullName.toLowerCase().trim() === a.studentInfo.name.toLowerCase().trim()
                                 );
                               }

                               let studentB = Object.values(studentsByClass).flat().find((s: any) => s.studentId === b.studentId);

                               if (!studentB && b.studentInfo?.name) {
                                 studentB = Object.values(studentsByClass).flat().find((s: any) => 
                                   s.fullName && s.fullName.toLowerCase().trim() === b.studentInfo.name.toLowerCase().trim()
                                 );
                               }

                               const nameA = studentA ? formatStudentName(studentA) : (a.studentInfo?.name || 'Unknown Student');

                               const nameB = studentB ? formatStudentName(studentB) : (b.studentInfo?.name || 'Unknown Student');

                               const comparison = nameA.localeCompare(nameB);

                               return resultsSortOrder === 'asc' ? comparison : -comparison;

                             } else if (resultsSortBy === 'correct') {

                               const aCorrect = a.resultsSummary?.totalCorrect || aQuestionResults.filter((q: any) => q.isCorrect).length;

                               const bCorrect = b.resultsSummary?.totalCorrect || bQuestionResults.filter((q: any) => q.isCorrect).length;

                               aValue = aCorrect;

                               bValue = bCorrect;

                               return resultsSortOrder === 'asc' ? aValue - bValue : bValue - aValue;

                             } else if (resultsSortBy === 'remarks') {

                               const getRemarks = (score: number) => {
                                 if (score >= 85) return 'Highly Proficient';
                                 if (score >= 75) return 'Proficient';
                                 if (score >= 50) return 'Nearly Proficient';
                                 if (score >= 25) return 'Low Proficient';
                                 return 'Not Proficient';
                               };

                               const remarksA = getRemarks(a.scorePercentage || 0);

                               const remarksB = getRemarks(b.scorePercentage || 0);

                               // Define order for remarks

                               const remarksOrder = { 'Not Proficient': 0, 'Low Proficient': 1, 'Nearly Proficient': 2, 'Proficient': 3, 'Highly Proficient': 4 };

                               aValue = remarksOrder[remarksA as keyof typeof remarksOrder] || 0;

                               bValue = remarksOrder[remarksB as keyof typeof remarksOrder] || 0;

                               return resultsSortOrder === 'asc' ? aValue - bValue : bValue - aValue;

                             }

                             

                             return 0;

                           });



                           // Calculate exercise-specific metrics

                           const exerciseTotalTime = exerciseResults.reduce((sum: number, result: any) => sum + (result.totalTimeSpent || 0), 0);

                           const exerciseAverageTime = exerciseResults.length > 0 ? exerciseTotalTime / exerciseResults.length : 0;

                           

                           const exerciseAverageAttempts = exerciseResults.length > 0 ? 

                             exerciseResults.reduce((sum: number, result: any) => {

                               const questionResults = result.questionResults || [];

                               const totalAttempts = questionResults.reduce((qSum: number, q: any) => qSum + (q.attempts || 1), 0);

                               return sum + (questionResults.length > 0 ? totalAttempts / questionResults.length : 1);

                             }, 0) / exerciseResults.length : 0;

                           

                           const exerciseCompletionRate = classStudents.length > 0 ? 

                             (exerciseResults.length / classStudents.length) * 100 : 0;



                           return (

                            <View key={exerciseTitle} style={styles.resultsExerciseCard}>

                              {/* Exercise Header with Status */}

                              <View style={styles.resultsExerciseHeader}>

                                <View style={styles.resultsExerciseTitleRow}>

                                  <MaterialCommunityIcons name="book-open-variant" size={16} color="#3b82f6" />

                                  <Text style={styles.resultsExerciseTitle}>{exerciseTitle}</Text>

                                   <View style={[

                                     styles.resultsExerciseStatusBadge,

                                     { backgroundColor: isAcceptingResults ? '#10b981' : '#64748b' }

                                   ]}>

                                     <MaterialCommunityIcons 

                                       name={isAcceptingResults ? "check-circle" : "close-circle"} 

                                       size={10} 

                                       color="#ffffff" 

                                     />

                                     <Text style={styles.resultsExerciseStatusText}>

                                       {isAcceptingResults ? 'Open' : 'Closed'}

                                     </Text>

                                   </View>

                                 </View>

                                 

                                {/* Exercise Details - Compact Inline */}

                                <View style={styles.resultsExerciseDetails}>

                                  <View style={styles.resultsExerciseDetailItem}>

                                    <MaterialCommunityIcons name="help-circle-outline" size={12} color="#64748b" />

                                    <Text style={styles.resultsExerciseDetailText}>

                                      {exerciseResults[0]?.questionResults?.length || 0} Q

                                    </Text>

                                  </View>

                                  <View style={styles.resultsExerciseDetailItem}>

                                    <MaterialCommunityIcons name="account-group" size={12} color="#64748b" />

                                    <Text style={styles.resultsExerciseDetailText}>

                                      {exerciseResults.length}/{classStudents.length}

                                    </Text>

                                  </View>

                                  <View style={styles.resultsExerciseDetailItem}>

                                    <MaterialCommunityIcons name="school-outline" size={12} color="#64748b" />

                                    <Text style={styles.resultsExerciseDetailText}>

                                      {exerciseAssignment?.exercise?.category || 'General'}

                                    </Text>

                                  </View>

                                </View>

                               </View>

                               

                               {/* Student Results Table */}

                               <View style={styles.resultsStudentTable}>

                                 <View style={styles.resultsTableSectionHeader}>
                                   <Text style={styles.resultsTableTitle}>Student Results</Text>
                                   <View style={styles.resultsTableActions}>
                                     <TouchableOpacity 
                                       style={styles.resultsViewAllBtn}
                                       onPress={() => setShowAllStudents(!showAllStudents)}
                                     >
                                       <MaterialCommunityIcons 
                                         name={showAllStudents ? "eye-off" : "eye"} 
                                         size={14} 
                                         color="#64748b" 
                                       />
                                       <Text style={styles.resultsViewAllBtnText}>
                                         {showAllStudents ? 'Show Top 6' : 'View All'}
                                       </Text>
                                     </TouchableOpacity>
                                     
                                     <TouchableOpacity 
                                       style={styles.resultsExportBtn}
                                       onPress={() => handleExportToExcel(exerciseTitle, sortedResults, classStudents)}
                                     >
                                       <MaterialCommunityIcons name="file-excel" size={14} color="#10b981" />
                                       <Text style={styles.resultsExportBtnText}>Excel</Text>
                                     </TouchableOpacity>
                                   </View>
                                 </View>

                                 

                                <ScrollView 
                                  horizontal={shouldAllowHorizontalSwipe}
                                  showsHorizontalScrollIndicator={shouldAllowHorizontalSwipe}
                                  style={styles.tableScrollContainer}
                                  contentContainerStyle={[
                                    styles.tableScrollContent,
                                    shouldAllowHorizontalSwipe ? { minWidth: 720 } : null
                                  ]}
                                  nestedScrollEnabled={true}
                                  keyboardShouldPersistTaps="handled"
                                  scrollEnabled={shouldAllowHorizontalSwipe}
                                >

                                   <View style={styles.tableContainer}>

                                     {/* Table Header */}

                                     <View style={styles.resultsTableHeader}>

                                       <Text style={[styles.tableHeaderText, { width: 35, textAlign: 'center' }]}>#</Text>

                                       <TouchableOpacity 

                                         style={[styles.sortableHeaderCell, { maxWidth: 120, justifyContent: 'flex-start' }]}

                                         onPress={() => handleSort('name')}

                                       >

                                         <Text style={[styles.tableHeaderText, resultsSortBy === 'name' && styles.activeSort, { textAlign: 'left' }]}>

                                           Name

                                         </Text>

                                         {resultsSortBy === 'name' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={14} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                       <TouchableOpacity 

                                         style={[styles.sortableHeaderCell, { flex: 1.5, justifyContent: 'center' }]}

                                         onPress={() => handleSort('remarks')}

                                       >

                                         <Text style={[styles.tableHeaderText, resultsSortBy === 'remarks' && styles.activeSort, { textAlign: 'center' }]}>

                                           Remarks

                                         </Text>

                                         {resultsSortBy === 'remarks' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={14} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                       <TouchableOpacity 

                                         style={[styles.sortableHeaderCell, { flex: 1, justifyContent: 'center' }]}

                                         onPress={() => handleSort('score')}

                                       >

                                         <Text style={[styles.tableHeaderText, resultsSortBy === 'score' && styles.activeSort, { textAlign: 'center' }]}>

                                           Score%

                                         </Text>

                                         {resultsSortBy === 'score' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={14} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                       <TouchableOpacity 

                                         style={[styles.sortableHeaderCell, { flex: 1, justifyContent: 'center' }]}

                                         onPress={() => handleSort('correct')}

                                       >

                                         <Text style={[styles.tableHeaderText, resultsSortBy === 'correct' && styles.activeSort, { textAlign: 'center' }]}>

                                           Correct

                                         </Text>

                                         {resultsSortBy === 'correct' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={14} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                       <TouchableOpacity 

                                         style={[styles.sortableHeaderCell, { flex: 1, justifyContent: 'center' }]}

                                         onPress={() => handleSort('attempts')}

                                       >

                                         <Text style={[styles.tableHeaderText, resultsSortBy === 'attempts' && styles.activeSort, { textAlign: 'center' }]}>

                                           Attempts

                                         </Text>

                                         {resultsSortBy === 'attempts' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={14} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                       <TouchableOpacity 

                                         style={[styles.sortableHeaderCell, { flex: 1, justifyContent: 'center' }]}

                                         onPress={() => handleSort('time')}

                                       >

                                         <Text style={[styles.tableHeaderText, resultsSortBy === 'time' && styles.activeSort, { textAlign: 'center' }]}>

                                           Time

                                         </Text>

                                         {resultsSortBy === 'time' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={14} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                       <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Submission</Text>

                                     </View>

                                   

                                     {/* Table Rows */}

                                    {(showAllStudents ? sortedResults : sortedResults.slice(0, 6)).map((result: any, idx: number) => {

                                      // Find student by studentId from the result (proper database lookup)
                                      let student = Object.values(studentsByClass).flat().find((s: any) => s.studentId === result.studentId);
                                      
                                      // If not found by studentId, try matching by studentInfo name
                                      if (!student && result.studentInfo?.name) {
                                        student = Object.values(studentsByClass).flat().find((s: any) => 
                                          s.fullName && s.fullName.toLowerCase().trim() === result.studentInfo.name.toLowerCase().trim()
                                        );
                                      }
                                      
                                      // If still not found, try by parentId
                                      if (!student && result.parentId) {
                                        student = Object.values(studentsByClass).flat().find((s: any) => s.parentId === result.parentId);
                                      }

                                      // Get student name with fallback to studentInfo
                                      const studentNickname = student ? formatStudentName(student) : 
                                        (result.studentInfo?.name || 'Unknown Student');

                                       

                                       // Calculate average attempts and total time - IMPROVED ACCURACY
                                       const questionResults = result.questionResults || [];

                                       // More accurate attempts calculation
                                       const totalAttempts = questionResults.reduce((sum: number, q: any) => {
                                         // Use actual attempts if available, otherwise default to 1
                                         const attempts = q.attempts || 1;
                                         return sum + attempts;
                                       }, 0);

                                       const avgAttempts = questionResults.length > 0 ? (totalAttempts / questionResults.length).toFixed(1) : '1.0';

                                       // More accurate time calculation
                                       const totalTimeMs = result.totalTimeSpent || 0;
                                       const totalTimeMinutes = Math.floor(totalTimeMs / 60000);
                                       const totalTimeSeconds = Math.floor((totalTimeMs % 60000) / 1000);
                                       
                                       // Format time display more accurately
                                       let timeDisplay = '';
                                       if (totalTimeMinutes > 0) {
                                         timeDisplay = `${totalTimeMinutes}m ${totalTimeSeconds}s`;
                                       } else {
                                         timeDisplay = `${totalTimeSeconds}s`;
                                       }

                                       
                                       // Calculate total correct and score - IMPROVED ACCURACY
                                       const totalQuestions = questionResults.length;
                                       
                                       // More accurate total correct calculation
                                       let totalCorrect = 0;
                                       if (result.resultsSummary?.totalCorrect !== undefined) {
                                         totalCorrect = result.resultsSummary.totalCorrect;
                                       } else {
                                         // Count actual correct answers from question results
                                         totalCorrect = questionResults.filter((q: any) => q.isCorrect === true).length;
                                       }
                                       
                                       // More accurate score percentage calculation
                                       let scorePercentage = 0;
                                       if (result.scorePercentage !== undefined && result.scorePercentage !== null) {
                                         scorePercentage = result.scorePercentage;
                                       } else if (totalQuestions > 0) {
                                         scorePercentage = Math.round((totalCorrect / totalQuestions) * 100);
                                       }

                                       // Get remarks based on new proficiency levels
                                       const getRemarks = (score: number) => {
                                         if (score >= 85) return 'Highly Proficient';
                                         if (score >= 75) return 'Proficient';
                                         if (score >= 50) return 'Nearly Proficient';
                                         if (score >= 25) return 'Low Proficient';
                                         return 'Not Proficient';
                                       };

                                       const remarks = getRemarks(scorePercentage);
                                       const remarksColor = scorePercentage >= 85 ? '#10b981' : 
                                                           scorePercentage >= 75 ? '#3b82f6' : 
                                                           scorePercentage >= 50 ? '#f59e0b' : 
                                                           scorePercentage >= 25 ? '#f97316' : '#ef4444';

                                       

                                       // Calculate performance level for this student - IMPROVED ACCURACY
                                       const studentPerformanceLevel = (() => {
                                         const avgAttemptsNum = parseFloat(avgAttempts);
                                         const timeInSeconds = totalTimeMs / 1000;
                                         
                                         // More accurate performance level calculation based on actual data
                                         if (avgAttemptsNum <= 1.2 && timeInSeconds <= 60 && scorePercentage >= 90) return 'excellent';
                                         if (avgAttemptsNum <= 2.0 && timeInSeconds <= 120 && scorePercentage >= 75) return 'good';
                                         if (avgAttemptsNum <= 3.0 && timeInSeconds <= 180 && scorePercentage >= 60) return 'fair';
                                         return 'needs_improvement';
                                       })();

                                       

                                       // Calculate submission status
                                       const submissionStatus = (() => {
                                         if (!result.completedAt) return 'Not Submitted';
                                         
                                         // Check if there's a deadline from the assignment
                                         if (exerciseAssignment?.deadline) {
                                           const deadline = new Date(exerciseAssignment.deadline);
                                           const completedAt = new Date(result.completedAt);
                                           return completedAt <= deadline ? 'On-Time' : 'Late';
                                         }
                                         
                                         return 'Submitted';
                                       })();

                                       const submissionColor = submissionStatus === 'On-Time' ? '#10b981' : 
                                                             submissionStatus === 'Late' ? '#ef4444' : '#64748b';

                                       return (

                                         <View key={result.resultId || idx} style={styles.resultsTableRow}>

                                           <Text style={[styles.tableRowText, { width: 35, textAlign: 'center' }]}>{idx + 1}</Text>

                                           <TouchableOpacity 

                                             style={{ maxWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}

                                          onPress={() => handleStudentNameClick(result.studentId, result.exerciseId, result.classId, studentNickname, result.resultId)}

                                           >

                                             <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 120 }}>

                                               <Text style={[styles.tableRowText, styles.studentNameCell, { color: '#3b82f6', textAlign: 'left' }]}>{studentNickname}</Text>

                                             </ScrollView>

                                           </TouchableOpacity>

                                           <Text style={[styles.tableRowText, { flex: 1.5, fontWeight: '600', color: remarksColor, textAlign: 'center' }]}>{remarks}</Text>

                                           <Text style={[styles.tableRowText, { flex: 1, fontWeight: '700', textAlign: 'center' }]}>{scorePercentage.toFixed(0)}%</Text>

                                           <Text style={[styles.tableRowText, { flex: 1, textAlign: 'center' }]}>{totalCorrect}/{totalQuestions}</Text>

                                           <Text style={[styles.tableRowText, { flex: 1, textAlign: 'center' }]}>{avgAttempts}</Text>

                                           <Text style={[styles.tableRowText, { flex: 1, textAlign: 'center' }]}>{timeDisplay}</Text>

                                           <Text style={[styles.tableRowText, { flex: 1, fontWeight: '600', color: submissionColor, textAlign: 'center' }]}>{submissionStatus}</Text>

                                         </View>

                                       );

                                     })}

                                   </View>

                                 </ScrollView>

                              </View>

                               {/* Class Statistics Section */}
                               <View style={styles.resultsStatsSection}>
                                 <View style={styles.resultsStatsHeader}>
                                   <MaterialCommunityIcons name="chart-box" size={16} color="#8b5cf6" />
                                   <Text style={styles.resultsStatsTitle}>Class Statistics</Text>
                                 </View>
                                 
                                 {(() => {
                                   // Calculate all statistics
                                   const scores = exerciseResults.map((r: any) => r.scorePercentage || 0);
                                   const sortedScores = [...scores].sort((a, b) => a - b);
                                   
                                   // Mean Percentage Score (MPS)
                                   const mps = scores.length > 0 ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length : 0;
                                   
                                   // Median
                                   let median = 0;
                                   if (sortedScores.length > 0) {
                                     const mid = Math.floor(sortedScores.length / 2);
                                     median = sortedScores.length % 2 === 0 
                                       ? (sortedScores[mid - 1] + sortedScores[mid]) / 2 
                                       : sortedScores[mid];
                                   }
                                   
                                   // Mode (most frequent score)
                                   const scoreFrequency: { [key: number]: number } = {};
                                   scores.forEach((score: number) => {
                                     const roundedScore = Math.round(score);
                                     scoreFrequency[roundedScore] = (scoreFrequency[roundedScore] || 0) + 1;
                                   });
                                   let mode = 0;
                                   let maxFreq = 0;
                                   Object.entries(scoreFrequency).forEach(([score, freq]) => {
                                     if (freq > maxFreq) {
                                       maxFreq = freq;
                                       mode = parseInt(score);
                                     }
                                   });
                                   
                                   // Standard Deviation
                                   let stdDev = 0;
                                   if (scores.length > 1) {
                                     const variance = scores.reduce((sum: number, score: number) => sum + Math.pow(score - mps, 2), 0) / scores.length;
                                     stdDev = Math.sqrt(variance);
                                   }
                                   
                                   // Range
                                   const highestScore = sortedScores.length > 0 ? sortedScores[sortedScores.length - 1] : 0;
                                   const lowestScore = sortedScores.length > 0 ? sortedScores[0] : 0;
                                   const range = highestScore - lowestScore;
                                   
                                   // Find students with highest and lowest scores
                                   const topStudent = exerciseResults.find((r: any) => r.scorePercentage === highestScore);
                                   const bottomStudent = exerciseResults.find((r: any) => r.scorePercentage === lowestScore);
                                   
                                   const getStudentName = (result: any) => {
                                     const student = Object.values(studentsByClass).flat().find((s: any) => s.studentId === result?.studentId);
                                     return student ? formatStudentName(student) : (result?.studentInfo?.name || 'Unknown');
                                   };
                                   
                                   // Class Average Attempts per Item
                                   const allAttempts = exerciseResults.map((r: any) => {
                                     const questionResults = r.questionResults || [];
                                     const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);
                                     return questionResults.length > 0 ? totalAttempts / questionResults.length : 1;
                                   });
                                   const avgAttemptsPerItem = allAttempts.length > 0 ? allAttempts.reduce((sum: number, val: number) => sum + val, 0) / allAttempts.length : 0;
                                   
                                   // Class Average Time per Item
                                   const allTimes = exerciseResults.map((r: any) => {
                                     const questionResults = r.questionResults || [];
                                     return questionResults.length > 0 ? (r.totalTimeSpent || 0) / questionResults.length : 0;
                                   });
                                   const avgTimePerItem = allTimes.length > 0 ? allTimes.reduce((sum: number, val: number) => sum + val, 0) / allTimes.length : 0;
                                   
                                   // Passing Rate (assuming 75% is passing)
                                   const passingScore = 75;
                                   const passedCount = scores.filter((score: number) => score >= passingScore).length;
                                   const passingRate = scores.length > 0 ? (passedCount / scores.length) * 100 : 0;
                                   
                                   // Item Analysis - Performance distribution
                                   const highlyProficientCount = scores.filter((s: number) => s >= 85).length;
                                   const proficientCount = scores.filter((s: number) => s >= 75 && s < 85).length;
                                   const nearlyProficientCount = scores.filter((s: number) => s >= 50 && s < 75).length;
                                   const lowProficientCount = scores.filter((s: number) => s >= 25 && s < 50).length;
                                   const notProficientCount = scores.filter((s: number) => s < 25).length;
                                   
                                   // Create unique key for this exercise stats
                                   const statsKey = `${cls.id}-${exerciseResults[0]?.exerciseId || exerciseTitle}`;
                                   const isExpanded = expandedStats[statsKey] || false;

                                   return (
                                    <View style={styles.resultsStatsContent}>
                                      {/* Primary Metrics Grid */}
                                      <View style={styles.resultsStatsGrid}>
                                        <View style={styles.resultsStatCard}>
                                          <MaterialCommunityIcons name="percent" size={14} color="#3b82f6" />
                                          <Text style={styles.resultsStatLabel}>MPS</Text>
                                          <Text style={styles.resultsStatValue}>{mps.toFixed(1)}%</Text>
                                        </View>
                                        
                                        <View style={styles.resultsStatCard}>
                                          <MaterialCommunityIcons name="chart-line" size={14} color="#10b981" />
                                          <Text style={styles.resultsStatLabel}>Pass Rate</Text>
                                          <Text style={[styles.resultsStatValue, { color: passingRate >= 75 ? '#10b981' : passingRate >= 50 ? '#f59e0b' : '#ef4444' }]}>
                                            {passingRate.toFixed(1)}%
                                          </Text>
                                          <Text style={styles.resultsStatSubtext}>{passedCount}/{scores.length}</Text>
                                        </View>
                                      </View>

                                      {/* Toggle Button */}
                                      <TouchableOpacity 
                                        style={styles.statsToggleButton}
                                        onPress={() => handleOpenDetailedStats(
                                          exerciseTitle,
                                          cls.id,
                                          exerciseResults
                                        )}
                                      >
                                        <Text style={styles.statsToggleText}>
                                          Show Detailed Statistics
                                        </Text>
                                        <MaterialCommunityIcons 
                                          name="chevron-right" 
                                          size={18} 
                                          color="#3b82f6" 
                                        />
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })()}
                              </View>

                           </View>

                          );

                        })}
                        
                          </View>
                        ));

                      })()}

                     </View>

                   )}

                 </View>

               );
             })

             )}

           </View>

         )}



        {activeTab === 'class' && (

          <View style={{ paddingBottom: 350 }}>

            {/* Header */}

            <View style={styles.classTabHeader}>

              <View>

                <Text style={styles.classTabTitle}>Classroom</Text>

                <Text style={styles.classTabSubtitle}>Manage your classes and students</Text>

              </View>

              <MaterialCommunityIcons name="google-classroom" size={32} color="#3b82f6" />

            </View>

            {teacherClasses.length === 0 ? (

              <View style={styles.emptyStateContainer}>

                <MaterialCommunityIcons name="school-outline" size={64} color="#cbd5e1" />

                <Text style={styles.emptyStateText}>No classes yet</Text>

                <Text style={styles.emptyStateSubtext}>Create a class to get started</Text>

              </View>

            ) : (

              <>

                {activeClasses.length > 0 && (

                  <>

                    <View style={styles.classSectionHeader}>

                      <View style={styles.classSectionBadge}>

                        <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />

                        <Text style={styles.classSectionTitle}>Active Classes</Text>

                      </View>

                      <Text style={styles.classSectionCount}>{activeClasses.length}</Text>

                    </View>

                    {[...activeClasses].sort(compareBySchoolYearDescThenName).map((cls) => (

                      <View key={cls.id} style={styles.classTabCard}>

                        <View style={styles.classCardHeader}>

                          <View style={styles.classIconContainer}>

                            <MaterialCommunityIcons name="google-classroom" size={20} color="#3b82f6" />

                          </View>

                          <View style={{ flex: 1 }}>

                            <Text style={styles.classroomTitle}>{cls.name}</Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>

                              <MaterialIcons name="school" size={12} color="#64748b" />

                              <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>

                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>

                              <MaterialIcons name="calendar-today" size={12} color="#64748b" />

                              <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>

                            </View>

                          </View>

                          <View style={styles.statusPillActive}>

                            <MaterialCommunityIcons name="circle" size={8} color="#10B981" />

                            <Text style={styles.statusTextActive}>Active</Text>

                          </View>

                        </View>

                        <View style={styles.classStudentCount}>

                          <MaterialCommunityIcons name="account-group" size={16} color="#64748b" />

                          <Text style={styles.studentCountText}>{studentsByClass[cls.id]?.length ?? 0} Students</Text>

                        </View>

                        <View style={styles.quickStats}>

                          <View style={styles.statItem}>

                            <View style={[styles.statIconBg, { backgroundColor: '#f3e8ff' }]}>

                              <MaterialCommunityIcons name="book-open-outline" size={14} color="#8b5cf6" />

                            </View>

                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.total ?? 0}</Text>

                            <Text style={styles.statLabel}>Exercises</Text>

                          </View>

                          <View style={styles.statDivider} />

                          <View style={styles.statItem}>

                            <View style={[styles.statIconBg, { backgroundColor: '#dcfce7' }]}>

                              <MaterialCommunityIcons name="check-circle-outline" size={14} color="#10b981" />

                            </View>

                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.completed ?? 0}</Text>

                            <Text style={styles.statLabel}>Completed</Text>
                          </View>

                          <View style={styles.statDivider} />

                          <View style={styles.statItem}>

                            <View style={[styles.statIconBg, { backgroundColor: '#fef3c7' }]}>

                              <MaterialCommunityIcons name="clock-outline" size={14} color="#f59e0b" />

                            </View>

                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.pending ?? 0}</Text>

                            <Text style={styles.statLabel}>Pending</Text>

                          </View>

                        </View>

                      </View>

                    ))}

                  </>

                )}

                {teacherClasses.filter((c) => c.status === 'inactive').length > 0 && (

                  <>

                    <View style={styles.classSectionHeader}>

                      <View style={styles.classSectionBadge}>

                        <MaterialCommunityIcons name="archive" size={16} color="#94a3b8" />

                        <Text style={styles.classSectionTitle}>Inactive Classes</Text>

                      </View>

                      <Text style={styles.classSectionCount}>{teacherClasses.filter((c) => c.status === 'inactive').length}</Text>

                    </View>

                    {teacherClasses

                      .filter((c) => c.status === 'inactive')

                      .sort(compareBySchoolYearDescThenName)

                      .map((cls) => (

                      <View key={cls.id} style={styles.classTabCard}>

                        <View style={styles.classCardHeader}>

                          <View style={styles.classIconContainerInactive}>

                            <MaterialCommunityIcons name="google-classroom" size={20} color="#94a3b8" />

                          </View>

                          <View style={{ flex: 1 }}>

                            <Text style={styles.classroomTitle}>{cls.name}</Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>

                              <MaterialIcons name="school" size={12} color="#64748b" />

                              <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>

                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>

                              <MaterialIcons name="calendar-today" size={12} color="#64748b" />

                              <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>

                            </View>

                          </View>

                          <View style={styles.statusPillInactive}>

                            <MaterialCommunityIcons name="circle" size={8} color="#94a3b8" />

                            <Text style={styles.statusTextInactive}>Inactive</Text>

                          </View>

                        </View>

                        <View style={styles.classStudentCount}>

                          <MaterialCommunityIcons name="account-group" size={16} color="#64748b" />

                          <Text style={styles.studentCountText}>{studentsByClass[cls.id]?.length ?? 0} Students</Text>

                        </View>

                      </View>

                    ))}

                  </>

                )}

              </>

            )}

          </View>

        )}

      </ScrollView>



      {/* Bottom Navigation */}

      <View style={styles.bottomNav}>

        <TouchableOpacity style={[styles.navItem, activeTab === 'home' && styles.activeNavItem]} onPress={() => setActiveTab('home')}>

          <AntDesign name="home" size={24} color={activeTab === 'home' ? '#000000' : '#9ca3af'} />

          <Text style={[styles.navText, activeTab === 'home' && styles.activeNavText]}>Home</Text>

        </TouchableOpacity>

        

        <TouchableOpacity style={[styles.navItem, activeTab === 'list' && styles.activeNavItem]} onPress={() => setActiveTab('list')}>

          <MaterialIcons name="list" size={24} color={activeTab === 'list' ? '#000000' : '#9ca3af'} />

          <Text style={[styles.navText, activeTab === 'list' && styles.activeNavText]}>List</Text>

        </TouchableOpacity>

        

        <TouchableOpacity style={[styles.navItem, activeTab === 'class' && styles.activeNavItem]} onPress={() => setActiveTab('class')}>

          <MaterialCommunityIcons name="account-group" size={24} color={activeTab === 'class' ? '#000000' : '#9ca3af'} />

          <Text style={[styles.navText, activeTab === 'class' && styles.activeNavText]}>Class</Text>

        </TouchableOpacity>

        

        <TouchableOpacity style={[styles.navItem, activeTab === 'results' && styles.activeNavItem]} onPress={async () => {
          setActiveTab('results');
          // Auto-refresh data when switching to results tab to get latest completion stats
          if (activeClasses.length > 0) {
            await loadAssignedExercises(); // Load assigned exercises to get quarter data
            await loadAssignments(activeClasses.map(c => c.id));
            await loadClassAnalytics(activeClasses.map(c => c.id));
          }
        }}>

          <MaterialIcons name="assessment" size={24} color={activeTab === 'results' ? '#000000' : '#9ca3af'} />

          <Text style={[styles.navText, activeTab === 'results' && styles.activeNavText]}>Results</Text>

        </TouchableOpacity>

        

        <TouchableOpacity style={[styles.navItem, activeTab === 'exercises' && styles.activeNavItem]} onPress={() => setActiveTab('exercises')}>

          <MaterialCommunityIcons name="abacus" size={24} color={activeTab === 'exercises' ? '#000000' : '#9ca3af'} />

          <Text style={[styles.navText, activeTab === 'exercises' && styles.activeNavText]}>Exercises</Text>

        </TouchableOpacity>

      </View>



      {/* Profile Modal */}

      <Modal visible={showProfileModal} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <View style={styles.profileModal}>

            <View style={styles.modalHeader}>

              <Text style={styles.modalTitle}>Teacher Profile</Text>

              <TouchableOpacity 

                onPress={() => setShowProfileModal(false)}

                style={styles.closeButton}

              >

                <AntDesign name="close" size={24} color="#1e293b" />

              </TouchableOpacity>

            </View>

            

            <ScrollView 

              style={styles.profileContent}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

              showsVerticalScrollIndicator={false}

            >

              {/* Profile Picture Section */}

              <View style={styles.profilePictureSection}>

                {editData?.profilePictureUrl ? (

                  <Image 

                    source={{ uri: editData.profilePictureUrl }} 

                    style={styles.profilePicture}

                  />

                ) : (

                  <View style={styles.profilePicturePlaceholder}>

                    <MaterialIcons name="person" size={60} color="#4a5568" />

                  </View>

                )}

                {editing && (

                  <TouchableOpacity style={styles.changePhotoButton} onPress={handleChangePhoto}>

                    <AntDesign name="camera" size={16} color="#fff" />

                    <Text style={styles.changePhotoText}>Change Photo</Text>

                  </TouchableOpacity>

                )}

              </View>



              {/* Teacher Information */}

              <View style={styles.infoSection}>

                <View style={styles.infoRow}>

                  <Text style={styles.infoLabel}>First Name:</Text>

                  {editing ? (

                    <TextInput

                      style={styles.infoInput}

                      value={editData?.firstName || ''}

                      onChangeText={(value) => handleInputChange('firstName', value)}

                    />

                  ) : (

                    <Text style={styles.infoValue}>{teacherData?.firstName}</Text>

                  )}

                </View>



                <View style={styles.infoRow}>

                  <Text style={styles.infoLabel}>Last Name:</Text>

                  {editing ? (

                    <TextInput

                      style={styles.infoInput}

                      value={editData?.lastName || ''}

                      onChangeText={(value) => handleInputChange('lastName', value)}

                    />

                  ) : (

                    <Text style={styles.infoValue}>{teacherData?.lastName}</Text>

                  )}

                </View>



                <View style={styles.infoRow}>

                  <Text style={styles.infoLabel}>Email:</Text>

                  {editing ? (

                    <TextInput

                      style={styles.infoInput}

                      value={editData?.email || ''}

                      onChangeText={(value) => handleInputChange('email', value)}

                      keyboardType="email-address"

                    />

                  ) : (

                    <Text style={styles.infoValue}>{teacherData?.email}</Text>

                  )}

                </View>



                <View style={styles.infoRow}>

                  <Text style={styles.infoLabel}>Phone:</Text>

                  {editing ? (

                    <TextInput

                      style={styles.infoInput}

                      value={editData?.phone || ''}

                      onChangeText={(value) => handleInputChange('phone', value)}

                      keyboardType="phone-pad"

                    />

                  ) : (

                    <Text style={styles.infoValue}>{teacherData?.phone}</Text>

                  )}

                </View>



                <View style={styles.infoRow}>

                  <Text style={styles.infoLabel}>School:</Text>

                  {editing ? (

                    <TextInput

                      style={styles.infoInput}

                      value={editData?.school || ''}

                      onChangeText={(value) => handleInputChange('school', value)}

                    />

                  ) : (

                    <Text style={styles.infoValue}>{teacherData?.school}</Text>

                  )}

                </View>

              </View>

            </ScrollView>



            {/* Modal Actions */}

            <View style={styles.modalActions}>

              {editing ? (

                <>

                  <TouchableOpacity 

                    style={styles.cancelButton} 

                    onPress={handleCancel}

                    disabled={uploading}

                  >

                    <Text style={styles.cancelButtonText}>Cancel</Text>

                  </TouchableOpacity>

                  <TouchableOpacity 

                    style={styles.saveButton} 

                    onPress={handleSave}

                    disabled={uploading}

                  >

                    <Text style={styles.saveButtonText}>

                      {uploading ? 'Saving...' : 'Save Changes'}

                    </Text>

                  </TouchableOpacity>

                </>

              ) : (

                <>

                  <TouchableOpacity 

                    style={styles.editProfileButton} 

                    onPress={handleEdit}

                  >

                    <Text style={styles.editProfileButtonText}>Edit Profile</Text>

                  </TouchableOpacity>

                  <TouchableOpacity 

                    style={styles.cancelButton} 

                    onPress={handleLogout}

                  >

                    <Text style={styles.cancelButtonText}>Logout</Text>

                  </TouchableOpacity>

                </>

              )}

            </View>

          </View>

        </View>

      </Modal>



      {/* Add Class Modal */}
      <Modal visible={showAddClassModal} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <View style={styles.profileModal}>

            <View style={styles.modalHeader}>

              <Text style={styles.modalTitle}>Add Class / Section</Text>

              <TouchableOpacity 

                onPress={() => setShowAddClassModal(false)}

                style={styles.closeButton}

              >

                <AntDesign name="close" size={24} color="#1e293b" />

              </TouchableOpacity>

            </View>

            <ScrollView 

              style={styles.profileContent}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

              showsVerticalScrollIndicator={false}

            >

              <View style={styles.infoSection}>

                {/* Name field */}

                <View style={styles.field}>

                  <Text style={styles.fieldLabel}>Name</Text>

                  <TextInput

                    style={styles.fieldInput}

                    value={className}

                    onChangeText={setClassName}

                    placeholder="e.g., Section Mabait"

                    placeholderTextColor="#6b7280"

                  />

                </View>



                {/* School selector */}

                <View style={styles.field}>

                  <Text style={styles.fieldLabel}>School</Text>

                  <View style={styles.segmentWrap}>

                    <TouchableOpacity

                      style={[styles.segmentButton, schoolOption === 'profile' && styles.segmentActive]}

                      onPress={() => setSchoolOption('profile')}

                    >

                      <Text style={[styles.segmentText, schoolOption === 'profile' && styles.segmentTextActive]}>Use Profile</Text>

                    </TouchableOpacity>

                    <TouchableOpacity

                      style={[styles.segmentButton, schoolOption === 'other' && styles.segmentActive]}

                      onPress={() => setSchoolOption('other')}

                    >

                      <Text style={[styles.segmentText, schoolOption === 'other' && styles.segmentTextActive]}>Other</Text>

                    </TouchableOpacity>

                  </View>

                  {schoolOption === 'other' ? (

                    <TextInput

                      style={[styles.fieldInput, { marginTop: 10 }]}

                      value={schoolOther}

                      onChangeText={setSchoolOther}

                      placeholder="Enter school name"

                      placeholderTextColor="#6b7280"

                    />

                  ) : (

                    <View style={styles.readonlyBox}>

                      <Text style={styles.readonlyText}>{teacherData?.school || '—'}</Text>

                    </View>

                  )}

                </View>



                {/* School year dropdown */}

                <View style={styles.field}>

                  <Text style={styles.fieldLabel}>School Year</Text>

                  <TouchableOpacity style={styles.yearButton} onPress={() => setShowYearPicker((v) => !v)}>

                    <Text style={styles.yearButtonText}>{schoolYear || 'Select (e.g., 22-23)'}</Text>

                    <AntDesign name={showYearPicker ? 'up' : 'down'} size={14} color="#1e293b" />

                  </TouchableOpacity>

                  {showYearPicker && (

                    <View style={styles.yearMenu}>

                      <ScrollView

                        nestedScrollEnabled={true}

                        showsVerticalScrollIndicator={true}

                        keyboardShouldPersistTaps="handled"

                        bounces={false}

                      >

                        {generateYearOptions().map((opt) => (

                          <TouchableOpacity

                            key={opt.value}

                            style={[

                              styles.yearOption,

                              schoolYear === opt.label && styles.yearOptionSelected,

                            ]}

                            onPress={() => {

                              setSchoolYear(opt.label);

                              setShowYearPicker(false);

                            }}

                          >

                            <Text style={styles.yearOptionText}>{opt.label}</Text>

                          </TouchableOpacity>

                        ))}

                      </ScrollView>

                    </View>

                  )}

                </View>

              </View>

            </ScrollView>

            <View style={styles.modalActions}>

              <TouchableOpacity 

                style={styles.cancelButton} 

                onPress={() => setShowAddClassModal(false)}

                disabled={savingClass}

              >

                <Text style={styles.cancelButtonText}>Cancel</Text>

              </TouchableOpacity>

              <TouchableOpacity 

                style={styles.saveButton} 

                onPress={async () => {

                  if (!currentUserId) {

                    showAlert('Error', 'Not authenticated.', undefined, 'error');

                    return;

                  }

                  if (!className.trim()) {

                    showAlert('Error', 'Please enter class/section name.', undefined, 'error');

                    return;

                  }

                  const resolvedSchool = schoolOption === 'other' ? schoolOther.trim() : (teacherData?.school || '').trim();

                  if (!resolvedSchool) {

                    showAlert('Error', 'Please select or enter a school name.', undefined, 'error');

                    return;

                  }

                  if (!schoolYear.trim()) {

                    showAlert('Error', 'Please enter school year (e.g., 2025-2026).', undefined, 'error');

                    return;

                  }

                  try {

                    setSavingClass(true);

                    const syValue = schoolYear.replace('-', ''); // store as 2223

                    // Create class with readable ID (CLASS-SECTION-0001, etc.)
                    const result = await createClass({
                      name: className.trim(),
                      section: className.trim(), // Use class name as section identifier
                      teacherId: currentUserId || '',
                      gradeLevel: '1', // Default grade level
                      schoolYear: syValue
                    });

                    if (!result.success || !result.classId) {

                      showAlert('Error', result.error || 'Failed to create section.', undefined, 'error');

                    } else {

                      const classId = result.classId;
                      console.log(`[CreateClass] Created class with ID: ${classId}`);

                      // Update with additional fields for sections table
                      const updateResult = await updateData(`/sections/${classId}`, {
                        schoolName: resolvedSchool,
                        status: 'active'
                      });

                      if (updateResult.error) {
                        console.error('[CreateClass] Error updating class data:', updateResult.error);
                      }

                      console.log('[CreateClass] Class data saved, refreshing class list...');

                      // Small delay to ensure Firebase has persisted the data
                      await new Promise(resolve => setTimeout(resolve, 500));

                      // Refresh the classes list before closing modal
                      if (currentUserId) {
                        await loadTeacherClasses(currentUserId);
                      }

                      setShowAddClassModal(false);

                      setClassName('');

                      setSchoolOption('profile');

                      setSchoolOther('');

                      setSchoolYear('');

                      

                      // Show alert after modal is closed

                      setTimeout(() => {

                        showAlert('Success', 'Class/Section created successfully.', undefined, 'success');

                      }, 300);

                    }

                  } catch (e) {

                    showAlert('Error', 'Failed to create section.', undefined, 'error');

                  } finally {

                    setSavingClass(false);

                  }

                }}

                disabled={savingClass}

              >

                <Text style={styles.saveButtonText}>{savingClass ? 'Creating...' : 'Create'}</Text>

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>



      {/* Announcement Modal */}

      <Modal visible={showAnnModal} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <View style={styles.announcementModal}>

            <View style={styles.announcementModalHeader}>

              <View style={styles.announcementModalTitleContainer}>

                <MaterialCommunityIcons name="bullhorn" size={24} color="#3b82f6" />

                <Text style={styles.announcementModalTitle}>Create New Announcement</Text>

              </View>

              <TouchableOpacity onPress={() => setShowAnnModal(false)} style={styles.closeButton}>

                <AntDesign name="close" size={24} color="#64748b" />

              </TouchableOpacity>

            </View>

            <ScrollView 

              style={styles.announcementModalContent} 

              showsVerticalScrollIndicator={false}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

            >

              <View style={styles.announcementForm}>

                <View style={styles.announcementField}>

                  <Text style={styles.announcementFieldLabel}>Title</Text>

                  <TextInput

                    style={styles.announcementFieldInput}

                    value={annTitle}

                    onChangeText={setAnnTitle}

                    placeholder="e.g., Exam Schedule, Important Update"

                    placeholderTextColor="#94a3b8"

                  />

                </View>

                <View style={styles.announcementField}>

                  <Text style={styles.announcementFieldLabel}>Message</Text>

                  <TextInput

                    style={[styles.announcementFieldInput, styles.announcementMessageInput]}

                    value={annMessage}

                    onChangeText={setAnnMessage}

                    placeholder="Write your announcement message here..."

                    placeholderTextColor="#94a3b8"

                    multiline

                    textAlignVertical="top"

                  />

                </View>

                <View style={styles.announcementField}>

                  <Text style={styles.announcementFieldLabel}>Select Classes</Text>

                  <View style={styles.announcementClassList}>

                      <Text style={styles.announcementClassListTitle}>Select Classes:</Text>

                      {teacherClasses.map((c) => {

                        const checked = annSelectedClassIds.includes(c.id);

                        return (

                          <TouchableOpacity

                            key={c.id}

                            style={styles.announcementClassItem}

                            onPress={() => {

                              setAnnSelectedClassIds((prev) => (

                                checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]

                              ));

                            }}

                          >

                            <View style={styles.announcementClassInfo}>

                              <Text style={styles.announcementClassName}>{c.name}</Text>

                              {c.schoolYear && (

                                <Text style={styles.announcementClassYear}>{c.schoolYear}</Text>

                              )}

                            </View>

                            <View style={[styles.announcementCheckbox, checked && styles.announcementCheckboxActive]}>

                              {checked && <AntDesign name="check" size={14} color="#ffffff" />}

                            </View>

                          </TouchableOpacity>

                        );

                      })}

                    </View>

                </View>

              </View>

            </ScrollView>

            <View style={styles.announcementModalFooter}>

              <TouchableOpacity

                style={styles.announcementCancelButton}

                onPress={() => setShowAnnModal(false)}

              >

                <Text style={styles.announcementCancelButtonText}>Cancel</Text>

              </TouchableOpacity>

              <TouchableOpacity

                style={[styles.announcementSendButton, (!annTitle.trim() || !annMessage.trim() || annSelectedClassIds.length === 0) && styles.announcementSendButtonDisabled]}

                disabled={sendingAnn || !annTitle.trim() || !annMessage.trim() || annSelectedClassIds.length === 0}

                onPress={async () => {

                  if (!currentUserId) { showAlert('Error', 'Not authenticated.', undefined, 'error'); return; }

                  if (!annTitle.trim() || !annMessage.trim()) { showAlert('Error', 'Title and message are required.', undefined, 'error'); return; }

                  const targetIds = annSelectedClassIds;

                  if (!targetIds.length) { showAlert('Error', 'Select at least one class.', undefined, 'error'); return; }

                  try {

                    setSendingAnn(true);

                    // Create announcement with readable ID (ANNOUNCEMENT-0001, etc.)
                    const result = await createAnnouncement({
                      title: annTitle.trim(),
                      message: annMessage.trim(),
                      teacherId: currentUserId || '',
                      classIds: targetIds
                    });

                    if (!result.success) {

                      showAlert('Error', result.error || 'Failed to send', undefined, 'error');

                    } else {

                      console.log(`[CreateAnnouncement] Created announcement: ${result.announcementId}`);

                      setShowAnnModal(false);

                      setAnnTitle('');

                      setAnnMessage('');

                      setAnnSelectedClassIds([]);

                      

                      // Show alert after modal is closed

                      setTimeout(() => {

                        showAlert('Success', 'Announcement sent successfully!', undefined, 'success');

                      }, 300);

                    }

                  } catch (e) {

                    showAlert('Error', 'Failed to send announcement. Please try again.', undefined, 'error');

                  } finally {

                    setSendingAnn(false);

                  }

                }}

              >

                {sendingAnn ? (

                  <View style={styles.announcementLoadingContainer}>

                    <ActivityIndicator size="small" color="#ffffff" />

                    <Text style={styles.announcementSendButtonText}>Sending...</Text>

                  </View>

                ) : (

                  <View style={styles.announcementSendContainer}>

                    <MaterialCommunityIcons name="send" size={18} color="#ffffff" />

                    <Text style={styles.announcementSendButtonText}>Send</Text>

                  </View>

                )}

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>



      {/* Add Student Modal */}

      <Modal visible={showAddStudentModal} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <View style={styles.profileModal}>

            <View style={styles.modalHeader}>

              <Text style={styles.modalTitle}>
                {selectedStudentForEdit ? 'Edit Student' : 'Add Student'}
                {selectedClassForStudent ? ` — ${selectedClassForStudent.name}` : ''}
              </Text>

              <TouchableOpacity onPress={() => setShowAddStudentModal(false)} style={styles.closeButton}>

                <AntDesign name="close" size={24} color="#1e293b" />

              </TouchableOpacity>

            </View>

            <ScrollView 

              style={styles.profileContent}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

              showsVerticalScrollIndicator={false}

            >

              <View style={styles.infoSection}>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Last Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={studentLastName}
                    onChangeText={setStudentLastName}
                    placeholder="e.g., Dela Cruz"
                    placeholderTextColor="#6b7280"
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>First Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={studentFirstName}
                    onChangeText={setStudentFirstName}
                    placeholder="e.g., Juan"
                    placeholderTextColor="#6b7280"
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Middle Initial</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={studentMiddleInitial}
                    onChangeText={setStudentMiddleInitial}
                    placeholder="e.g., R"
                    placeholderTextColor="#6b7280"
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>

                {(studentLastName.trim() || studentFirstName.trim() || studentMiddleInitial.trim()) && (
                  <View style={{ 
                    backgroundColor: '#f1f5f9', 
                    padding: 12, 
                    borderRadius: 8, 
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: '#e2e8f0'
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 }}>
                      Preview:
                    </Text>
                    <Text style={{ fontSize: 14, color: '#1e293b' }}>
                      {`${studentLastName.trim()}${studentLastName.trim() && studentFirstName.trim() ? ', ' : ''}${studentFirstName.trim()}${studentMiddleInitial.trim() ? ` ${studentMiddleInitial.trim().toUpperCase().replace(/\.$/, '') + '.'}` : ''}` || '—'}
                    </Text>
                  </View>
                )}

                <View style={styles.field}>

                  <Text style={styles.fieldLabel}>Gender</Text>

                  <View style={styles.segmentWrap}>

                    <TouchableOpacity

                      style={[styles.segmentButton, studentGender === 'male' && styles.segmentActive]}

                      onPress={() => setStudentGender('male')}

                    >

                      <Text style={[styles.segmentText, studentGender === 'male' && styles.segmentTextActive]}>Male</Text>

                    </TouchableOpacity>

                    <TouchableOpacity

                      style={[styles.segmentButton, studentGender === 'female' && styles.segmentActive]}

                      onPress={() => setStudentGender('female')}

                    >

                      <Text style={[styles.segmentText, studentGender === 'female' && styles.segmentTextActive]}>Female</Text>

                    </TouchableOpacity>

                  </View>

                </View>

                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                  Note: Name will be saved and shown as "Lastname, Firstname MI". Parent details will be collected when they first log in.
                </Text>

              </View>

            </ScrollView>

            <View style={styles.modalActions}>

              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowAddStudentModal(false); setSelectedStudentForEdit(null); }} disabled={savingStudent}>

                <Text style={styles.cancelButtonText}>Cancel</Text>

              </TouchableOpacity>

              <TouchableOpacity style={styles.saveButton} onPress={selectedStudentForEdit ? handleUpdateStudent : handleCreateStudent} disabled={savingStudent}>

                <Text style={styles.saveButtonText}>{savingStudent ? (selectedStudentForEdit ? 'Saving...' : 'Creating...') : (selectedStudentForEdit ? 'Save Changes' : 'Create')}</Text>

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>



      {/* Class List Modal */}
      <Modal visible={showListModal} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <View style={styles.profileModal}>

            <View style={styles.modalHeader}>

              <Text style={styles.modalTitle}>Class Lists</Text>

              <TouchableOpacity onPress={() => setShowListModal(false)} style={styles.closeButton}>

                <AntDesign name="close" size={24} color="#1e293b" />

              </TouchableOpacity>

            </View>

            <ScrollView 

              style={styles.profileContent}

              contentContainerStyle={{ paddingBottom: 20 }}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

              showsVerticalScrollIndicator={false}

            >

              {activeClasses.map((cls) => (

                <View key={cls.id} style={{ marginBottom: 18 }}>

                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>{cls.name}</Text>

                  {(studentsByClass[cls.id] || []).length === 0 ? (

                    <Text style={{ color: '#64748b' }}>No students yet.</Text>

                  ) : (

                    (studentsByClass[cls.id] || []).map((s) => {

                      const p = s.parentId ? parentsById[s.parentId] : undefined;

                      return (

                        <View key={s.studentId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>

                          <Text style={{ color: '#111827' }}>{formatStudentName(s)}</Text>

                          <Text style={{ color: '#2563eb', fontWeight: '600' }}>{p?.loginCode || '—'}</Text>

                        </View>

                      );

                    })

                  )}

                </View>

              ))}

            </ScrollView>

            <View style={styles.modalActions}>

              <TouchableOpacity style={styles.saveButton} onPress={() => setShowListModal(false)}>

                <Text style={styles.saveButtonText}>Close</Text>

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>

      {/* Parents List Modal */}
      <Modal visible={showParentsListModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Parents List</Text>
              <TouchableOpacity onPress={() => setShowParentsListModal(false)} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.profileContent}
              contentContainerStyle={{ paddingBottom: 20 }}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {selectedClassForParentsList && studentsByClass[selectedClassForParentsList] && (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 16 }}>
                    {activeClasses.find(c => c.id === selectedClassForParentsList)?.name || 'Class'}
                  </Text>
                  {(studentsByClass[selectedClassForParentsList] || []).length === 0 ? (
                    <Text style={{ color: '#64748b' }}>No students in this class.</Text>
                  ) : (
                    (studentsByClass[selectedClassForParentsList] || []).map((s) => {
                      const p = s.parentId ? parentsById[s.parentId] : undefined;
                      const parentStatus = getParentStatus(p);
                      const isRegistered = p && p.infoStatus === 'completed';
                      const parentName = isRegistered ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : null;
                      
                      return (
                        <View key={s.studentId} style={styles.parentListCard}>
                          <View style={styles.parentCardLeft}>
                            {/* Student Avatar/Initials */}
                            <View style={styles.parentCardAvatar}>
                              <Text style={styles.parentCardAvatarText}>{getStudentInitials(s)}</Text>
                            </View>
                            
                            <View style={styles.parentCardInfo}>
                              {/* Student Name */}
                              <View style={styles.parentCardNameRow}>
                                <MaterialCommunityIcons name="account" size={16} color="#64748b" style={{ marginRight: 4 }} />
                                <Text style={styles.parentCardStudentName}>{formatStudentName(s)}</Text>
                              </View>
                              
                              {/* Parent Name (if registered) */}
                              {parentName && (
                                <View style={styles.parentCardParentRow}>
                                  <MaterialCommunityIcons name="account-heart" size={14} color="#8b5cf6" style={{ marginRight: 4 }} />
                                  <Text style={styles.parentCardParentName}>Parent: {parentName}</Text>
                                </View>
                              )}
                              
                              {/* Access Code */}
                              <View style={styles.parentCardCodeRow}>
                                <MaterialCommunityIcons name="key-variant" size={14} color="#64748b" style={{ marginRight: 4 }} />
                                {p ? (
                                  <TouchableOpacity onPress={() => handleShowParentInfo(s, p)}>
                                    <Text style={styles.parentCardCodeClickable}>Code: {p.loginCode || '—'}</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <Text style={styles.parentCardCode}>Code: —</Text>
                                )}
                              </View>
                            </View>
                          </View>
                          
                          {/* Status Badge */}
                          <View style={styles.parentCardRight}>
                            <View style={[styles.parentCardStatusBadge, { backgroundColor: parentStatus.color }]}>
                              <MaterialCommunityIcons 
                                name={isRegistered ? "check-circle" : p ? "clock-outline" : "account-off"} 
                                size={14} 
                                color="#ffffff" 
                                style={{ marginRight: 4 }}
                              />
                              <Text style={styles.parentCardStatusText}>{parentStatus.text}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveButton} onPress={() => setShowParentsListModal(false)}>
                <Text style={styles.saveButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Parent Information Modal */}
      <Modal visible={showParentInfoModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Parent Information</Text>
              <TouchableOpacity onPress={() => setShowParentInfoModal(false)} style={styles.closeButton}>
                <AntDesign name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.profileContent}
              contentContainerStyle={{ paddingBottom: 20 }}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {selectedParentForInfo && (
                <>
                  {/* Student Information */}
                  <View style={styles.parentDetailsSection}>
                    <Text style={styles.parentDetailsSectionTitle}>Student Information</Text>
                    <View style={styles.parentDetailsRow}>
                      <Text style={styles.parentDetailsLabel}>Name:</Text>
                      <Text style={styles.parentDetailsValue}>{formatStudentName(selectedParentForInfo.student)}</Text>
                    </View>
                    <View style={styles.parentDetailsRow}>
                      <Text style={styles.parentDetailsLabel}>Gender:</Text>
                      <Text style={styles.parentDetailsValue}>{selectedParentForInfo.student?.gender || 'N/A'}</Text>
                    </View>
                    <View style={styles.parentDetailsRow}>
                      <Text style={styles.parentDetailsLabel}>Student ID:</Text>
                      <Text style={styles.parentDetailsValue}>{selectedParentForInfo.student?.studentId || 'N/A'}</Text>
                    </View>
                  </View>

                  {/* Parent Information */}
                  <View style={styles.parentDetailsSection}>
                    <Text style={styles.parentDetailsSectionTitle}>Parent Information</Text>
                    
                    {selectedParentForInfo.parent ? (
                      <>
                        <View style={styles.parentDetailsRow}>
                          <Text style={styles.parentDetailsLabel}>Access Code:</Text>
                          <Text style={styles.parentDetailsValue}>{selectedParentForInfo.parent?.loginCode || 'N/A'}</Text>
                        </View>
                        
                        <View style={styles.parentDetailsRow}>
                          <Text style={styles.parentDetailsLabel}>Registration Status:</Text>
                          <View style={styles.parentInfoValueContainer}>
                            <View style={[styles.parentStatusBadge, { backgroundColor: getParentStatus(selectedParentForInfo.parent).color }]}>
                              <Text style={styles.parentStatusText}>{getParentStatus(selectedParentForInfo.parent).text}</Text>
                            </View>
                          </View>
                        </View>

                        {selectedParentForInfo.parent?.infoStatus === 'completed' && (
                          <>
                            <View style={styles.parentDetailsRow}>
                              <Text style={styles.parentDetailsLabel}>First Name:</Text>
                              <Text style={styles.parentDetailsValue}>{selectedParentForInfo.parent?.firstName || 'N/A'}</Text>
                            </View>
                            <View style={styles.parentDetailsRow}>
                              <Text style={styles.parentDetailsLabel}>Last Name:</Text>
                              <Text style={styles.parentDetailsValue}>{selectedParentForInfo.parent?.lastName || 'N/A'}</Text>
                            </View>
                            <View style={styles.parentDetailsRow}>
                              <Text style={styles.parentDetailsLabel}>Email:</Text>
                              <Text style={styles.parentDetailsValue}>{selectedParentForInfo.parent?.email || 'N/A'}</Text>
                            </View>
                            <View style={styles.parentDetailsRow}>
                              <Text style={styles.parentDetailsLabel}>Mobile:</Text>
                              <Text style={styles.parentDetailsValue}>{selectedParentForInfo.parent?.mobile || 'N/A'}</Text>
                            </View>
                            <View style={styles.parentDetailsRow}>
                              <Text style={styles.parentDetailsLabel}>Registration Date:</Text>
                              <Text style={styles.parentDetailsValue}>
                                {selectedParentForInfo.parent?.createdAt 
                                  ? new Date(selectedParentForInfo.parent.createdAt).toLocaleDateString() 
                                  : 'N/A'}
                              </Text>
                            </View>
                          </>
                        )}

                        {selectedParentForInfo.parent?.infoStatus === 'pending' && (
                          <View style={styles.parentDetailsRow}>
                            <Text style={styles.parentDetailsLabel}>Status:</Text>
                            <Text style={styles.parentDetailsValue}>Parent registration is pending. They have not completed their registration yet.</Text>
                          </View>
                        )}

                        {!selectedParentForInfo.parent?.infoStatus && (
                          <View style={styles.parentDetailsRow}>
                            <Text style={styles.parentDetailsLabel}>Status:</Text>
                            <Text style={styles.parentDetailsValue}>Parent registration is pending. They have not used their access code yet.</Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.parentDetailsRow}>
                        <Text style={styles.parentDetailsLabel}>Status:</Text>
                        <Text style={styles.parentDetailsValue}>No parent account assigned to this student.</Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveButton} onPress={() => setShowParentInfoModal(false)}>
                <Text style={styles.saveButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Exercise Form */}

      <AssignExerciseForm

        visible={showAssignForm}

        onClose={() => {

          setShowAssignForm(false);

          setSelectedExerciseForAssign(null);

        }}

        onAssign={handleAssignExercise}

        exerciseTitle={selectedExerciseForAssign?.title || ''}

        currentUserId={currentUserId}

      />



      {/* Edit Assignment Modal */}

      <Modal

        visible={showEditAssignmentModal}

        animationType="slide"

        presentationStyle="pageSheet"

        onRequestClose={() => setShowEditAssignmentModal(false)}

      >

        <View style={styles.assignmentModalContainer}>

          <View style={styles.assignmentModalHeader}>

            <TouchableOpacity

              onPress={() => setShowEditAssignmentModal(false)}

              style={styles.assignmentModalCloseButton}

            >

              <MaterialIcons name="close" size={24} color="#1e293b" />

            </TouchableOpacity>

            <Text style={styles.assignmentModalTitle}>Edit Assignment</Text>

            <View style={styles.assignmentModalPlaceholder} />

          </View>



          {editingAssignment && (

            <ScrollView 

              style={styles.assignmentModalContent} 

              showsVerticalScrollIndicator={false}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

            >

              <View style={styles.editAssignmentForm}>

                <Text style={styles.editAssignmentTitle}>

                  {editingAssignment.exercise?.title || 'Unknown Exercise'}

                </Text>

                

                <View style={styles.editInputGroup}>

                  <Text style={styles.editInputLabel}>Assigned Class</Text>

                  <Text style={styles.classDisplay}>

                    {editingAssignment.className || 'Unknown Class'}

                  </Text>

                  <Text style={styles.inputNote}>Class cannot be changed after assignment</Text>

                </View>



                <View style={styles.editInputGroup}>

                  <Text style={styles.editInputLabel}>Deadline</Text>

                  

                  {/* Simple Date/Time Input */}

                  <View style={styles.simpleDateTimeContainer}>

                    <Text style={styles.simpleDateTimeLabel}>Select New Deadline:</Text>

                    

                    <View style={styles.simpleDateTimeRow}>

                      <Text style={styles.simpleDateTimeText}>Date:</Text>

                      <TextInput

                        style={styles.simpleDateTimeInput}

                        placeholder="MM/DD/YYYY"

                        value={selectedDate.toLocaleDateString('en-US')}

                        onChangeText={(text) => {

                          // Simple date parsing

                          const parts = text.split('/');

                          if (parts.length === 3) {

                            const month = parseInt(parts[0]) - 1;

                            const day = parseInt(parts[1]);

                            const year = parseInt(parts[2]);

                            if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {

                              const newDate = new Date(year, month, day);

                              if (!isNaN(newDate.getTime())) {

                                setSelectedDate(newDate);

                                updateDeadline(newDate, selectedTime);

                              }

                            }

                          }

                        }}

                      />

                    </View>



                    <View style={styles.simpleDateTimeRow}>

                      <Text style={styles.simpleDateTimeText}>Time:</Text>

                      <TextInput

                        style={styles.simpleDateTimeInput}

                        placeholder="HH:MM AM/PM"

                        value={selectedTime.toLocaleTimeString('en-US', { hour12: true })}

                        onChangeText={(text) => {

                          // Simple time parsing

                          const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);

                          if (timeMatch) {

                            let hours = parseInt(timeMatch[1]);

                            const minutes = parseInt(timeMatch[2]);

                            const ampm = timeMatch[3].toUpperCase();

                            

                            if (ampm === 'PM' && hours !== 12) hours += 12;

                            if (ampm === 'AM' && hours === 12) hours = 0;

                            

                            const newTime = new Date();

                            newTime.setHours(hours, minutes, 0, 0);

                            setSelectedTime(newTime);

                            updateDeadline(selectedDate, newTime);

                          }

                        }}

                      />

                    </View>

                  </View>



                  {/* Current Deadline Display */}

                  {newDeadline && (

                    <View style={styles.currentDeadlineDisplay}>

                      <Text style={styles.currentDeadlineLabel}>New Deadline:</Text>

                      <Text style={styles.currentDeadlineText}>

                        {new Date(newDeadline).toLocaleString('en-US', {

                          weekday: 'short',

                          year: 'numeric',

                          month: 'long',

                          day: 'numeric',

                          hour: 'numeric',

                          minute: '2-digit',

                          hour12: true

                        })}

                      </Text>

                    </View>

                  )}

                </View>



                {/* Accept Late Submissions Toggle */}

                <View style={styles.editInputGroup}>

                  <Text style={styles.editInputLabel}>Submission Settings</Text>

                  <TouchableOpacity 

                    style={styles.editSettingItem}

                    onPress={() => setEditAcceptLateSubmissions(!editAcceptLateSubmissions)}

                  >

                    <View style={styles.editSettingInfo}>

                      <Text style={styles.editSettingTitle}>Accept Late Submissions</Text>

                      <Text style={styles.editSettingDescription}>

                        Allow students to submit after the deadline

                      </Text>

                    </View>

                    <View style={[

                      styles.editToggle,

                      editAcceptLateSubmissions && styles.editToggleActive

                    ]}>

                      <View style={[

                        styles.editToggleThumb,

                        editAcceptLateSubmissions && styles.editToggleThumbActive

                      ]} />

                    </View>

                  </TouchableOpacity>

                </View>



                <View style={styles.editAssignmentInfo}>

                  <Text style={styles.editInfoLabel}>Assignment Details</Text>

                  <View style={styles.editInfoRow}>

                    <Text style={styles.editInfoLabel}>Created:</Text>

                    <Text style={styles.editInfoValue}>

                      {new Date(editingAssignment.createdAt).toLocaleDateString()}

                    </Text>

                  </View>

                  <View style={styles.editInfoRow}>

                    <Text style={styles.editInfoLabel}>Questions:</Text>

                    <Text style={styles.editInfoValue}>

                      {editingAssignment.exercise?.questionCount || 0} questions

                    </Text>

                  </View>

                </View>

              </View>

            </ScrollView>

          )}



          <View style={styles.assignmentModalActions}>

            <TouchableOpacity

              style={styles.editCancelButton}

              onPress={() => setShowEditAssignmentModal(false)}

            >

              <Text style={styles.editCancelButtonText}>Cancel</Text>

            </TouchableOpacity>

            <TouchableOpacity

              style={[styles.editSaveButton, editAssignmentLoading && styles.buttonDisabled]}

              onPress={saveEditAssignment}

              disabled={editAssignmentLoading}

            >

              <Text style={styles.editSaveButtonText}>

                {editAssignmentLoading ? 'Saving...' : 'Save Changes'}

              </Text>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>



      {/* Delete Assignment Modal */}

      <Modal

        visible={showDeleteAssignmentModal}

        animationType="fade"

        transparent

        onRequestClose={() => setShowDeleteAssignmentModal(false)}

      >

        <View style={styles.deleteModalOverlay}>

          <View style={styles.deleteModal}>

            <View style={styles.deleteModalHeader}>

              <MaterialIcons name="warning" size={24} color="#ef4444" />

              <Text style={styles.deleteModalTitle}>Delete Assignment</Text>

            </View>

            

            {deletingAssignment && (

              <View style={styles.deleteModalContent}>

                <Text style={styles.deleteModalText}>

                  Are you sure you want to delete this assignment?

                </Text>

                <View style={styles.deleteAssignmentInfo}>

                  <Text style={styles.deleteAssignmentTitle}>

                    {deletingAssignment.exercise?.title || 'Unknown Exercise'}

                  </Text>

                  <Text style={styles.deleteAssignmentClass}>

                    {deletingAssignment.className || 'Unknown Class'}

                  </Text>

                  <Text style={styles.deleteAssignmentDeadline}>

                    Due: {deletingAssignment.deadline ? 

                      new Date(deletingAssignment.deadline).toLocaleDateString() : 'No deadline'

                    }

                  </Text>

                </View>

                <Text style={styles.deleteWarningText}>

                  This action cannot be undone. Students will no longer have access to this assignment.

                </Text>

              </View>

            )}



            <View style={styles.deleteModalActions}>

              <TouchableOpacity

                style={styles.deleteCancelButton}

                onPress={() => setShowDeleteAssignmentModal(false)}

              >

                <Text style={styles.deleteCancelButtonText}>Cancel</Text>

              </TouchableOpacity>

              <TouchableOpacity

                style={[styles.deleteConfirmButton, deleteAssignmentLoading && styles.buttonDisabled]}

                onPress={confirmDeleteAssignment}

                disabled={deleteAssignmentLoading}

              >

                <Text style={styles.deleteConfirmButtonText}>

                  {deleteAssignmentLoading ? 'Deleting...' : 'Delete Assignment'}

                </Text>

              </TouchableOpacity>

            </View>

          </View>

        </View>
      </Modal>



      {/* Student Status Modal */}

      <Modal

        visible={showStudentStatusModal}

        animationType="slide"

        presentationStyle="pageSheet"

        onRequestClose={() => setShowStudentStatusModal(false)}

      >

        <View style={styles.studentStatusModalContainer}>

          <View style={styles.studentStatusModalHeader}>

            <TouchableOpacity

              onPress={() => setShowStudentStatusModal(false)}

              style={styles.studentStatusModalCloseButton}

            >

              <MaterialIcons name="close" size={24} color="#1e293b" />

            </TouchableOpacity>

            <Text style={styles.studentStatusModalTitle}>Student Progress</Text>

            <View style={styles.studentStatusModalPlaceholder} />

          </View>



          {selectedAssignmentForStatus && (

            <ScrollView 

              style={styles.studentStatusModalContent} 

              showsVerticalScrollIndicator={false}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

            >

              <View style={styles.studentStatusHeader}>

                <Text style={styles.studentStatusAssignmentTitle}>

                  {selectedAssignmentForStatus.exercise?.title || 'Unknown Exercise'}

                </Text>

                <Text style={styles.studentStatusClass}>

                  {selectedAssignmentForStatus.className || 'Unknown Class'}

                </Text>

                <Text style={styles.studentStatusDeadline}>

                  Due: {new Date(selectedAssignmentForStatus.deadline).toLocaleString('en-US', {

                    weekday: 'short',

                    year: 'numeric',

                    month: 'long',

                    day: 'numeric',

                    hour: 'numeric',

                    minute: '2-digit',

                    hour12: true

                  })}

                </Text>

              </View>



              <View style={styles.studentListContainer}>

                {(() => {
                  // Filter students based on assignment targets
                  const allClassStudents = studentsByClass[selectedAssignmentForStatus.classId] || [];
                  const targetStudentIds = selectedAssignmentForStatus.targetStudentIds;
                  
                  // If targetStudentIds is provided and not empty, filter to only those students
                  // Otherwise, show all students in the class
                  const assignedStudents = targetStudentIds && targetStudentIds.length > 0 
                    ? allClassStudents.filter((student: any) => targetStudentIds.includes(student.studentId))
                    : allClassStudents;
                  
                  return (
                    <>
                      <Text style={styles.studentListTitle}>Students ({assignedStudents.length})</Text>

                      <Text style={styles.studentListSubtitle}>Tap status badges to toggle completion</Text>

                      {assignedStudents.map((student: any, index: number) => {

                  const status = getStudentStatus(student.studentId, selectedAssignmentForStatus);

                  return (

                    <View key={student.studentId} style={styles.studentStatusItem}>

                      <View style={styles.studentInfo}>

                        <View style={styles.studentAvatar}>

                          <Text style={styles.studentAvatarText}>

                            {getStudentInitials(student)}

                          </Text>

                        </View>

                        <View style={styles.studentDetails}>

                          <Text style={styles.studentStatusName}>{formatStudentName(student)}</Text>

                          <Text style={styles.studentId}>ID: {student.studentId}</Text>

                        </View>

                      </View>

                      

                      <TouchableOpacity 

                        style={[styles.statusBadge, {

                          backgroundColor: status === 'completed' ? '#10b981' : '#ef4444'

                        }]}

                        onPress={() => {

                          if (status === 'completed') {

                            markStudentPending(student.studentId, selectedAssignmentForStatus.id);

                          } else {

                            markStudentCompleted(student.studentId, selectedAssignmentForStatus.id);

                          }

                        }}

                        activeOpacity={0.7}

                      >

                        <MaterialCommunityIcons 

                          name={status === 'completed' ? 'check-circle' : 'alert-circle'} 

                          size={16} 

                          color="#ffffff" 

                        />

                        <Text style={styles.studentStatusText}>

                          {status === 'completed' ? 'Completed' : 'Pending'}

                        </Text>

                      </TouchableOpacity>

                    </View>

                  );

                      })}
                    </>
                  );
                })()}

              </View>

            </ScrollView>

          )}



          <View style={styles.studentStatusModalActions}>

            <TouchableOpacity

              style={styles.studentStatusCloseButton}

              onPress={() => setShowStudentStatusModal(false)}

            >

              <Text style={styles.studentStatusCloseButtonText}>Close</Text>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>


      {/* Student Performance Modal */}

      <Modal visible={showStudentPerformanceModal} animationType="slide" transparent={false}>

        <View style={styles.studentPerformanceFullScreenContainer}>

          <View style={styles.studentPerformanceFullScreenHeader}>

            <View style={styles.studentPerformanceHeaderContent}>

              <Text style={styles.studentPerformanceFullScreenTitle}>Student Performance Analysis</Text>

              {selectedStudentPerformance && (

                <Text style={styles.studentPerformanceStudentName}>

                  {formatStudentName(selectedStudentPerformance)}

                </Text>

              )}

            </View>

            <TouchableOpacity

              onPress={() => setShowStudentPerformanceModal(false)}

              style={styles.studentPerformanceCloseButton}

            >

              <MaterialIcons name="close" size={24} color="#1e293b" />

            </TouchableOpacity>

          </View>



          {loadingStudentPerformance ? (

            <View style={styles.studentPerformanceFullScreenLoading}>

              <Text style={styles.studentPerformanceLoadingText}>Loading performance data...</Text>

            </View>

          ) : studentPerformanceData ? (

            <ScrollView 

              style={styles.studentPerformanceFullScreenContent} 

              showsVerticalScrollIndicator={true}

              nestedScrollEnabled={true}

              keyboardShouldPersistTaps="handled"

            >

                {/* Student Info */}

                <View style={styles.studentPerformanceSection}>

                  <Text style={styles.studentPerformanceSectionTitle}>Student Information</Text>

                  <View style={styles.studentPerformanceInfo}>

                    <Text style={styles.studentPerformanceName}>

                      {selectedStudentPerformance ? formatStudentName(selectedStudentPerformance) : 'Unknown Student'}

                    </Text>

                    <Text style={styles.studentPerformanceExercise}>

                      {studentPerformanceData.exerciseData?.title || 'Unknown Exercise'}

                    </Text>

                  </View>

                </View>



                {/* Performance Overview */}

                <View style={styles.studentPerformanceCard}>

                  <Text style={styles.studentPerformanceCardTitle}>Performance Overview</Text>

                  <View style={styles.studentPerformanceScoreContainer}>

                    <Text style={styles.studentPerformanceScoreText}>

                      {Math.round(studentPerformanceData.performanceMetrics.overallScore)}

                    </Text>

                    <Text style={styles.studentPerformanceScoreLabel}>Performance Score</Text>

                    <Text style={styles.studentPerformanceScoreNote}>

                      Based on efficiency, consistency & mastery

                    </Text>

                  </View>

                  <View style={styles.studentPerformanceStatsRow}>

                    <View style={styles.studentPerformanceStatItem}>

                      <Text style={styles.studentPerformanceStatValue}>

                        {studentPerformanceData.studentResult.questionResults?.length || 0}

                      </Text>

                      <Text style={styles.studentPerformanceStatLabel}>Questions</Text>

                    </View>

                    <View style={styles.studentPerformanceStatItem}>

                      <Text style={styles.studentPerformanceStatValue}>

                        {Math.round((studentPerformanceData.studentResult.totalTimeSpent || 0) / 1000)}s

                      </Text>

                      <Text style={styles.studentPerformanceStatLabel}>Time Spent</Text>

                    </View>

                    <View style={styles.studentPerformanceStatItem}>

                      <Text style={styles.studentPerformanceStatValue}>

                        {studentPerformanceData.performanceMetrics.totalAttempts}

                      </Text>

                      <Text style={styles.studentPerformanceStatLabel}>Total Attempts</Text>

                    </View>

                  </View>

                </View>



                {/* Performance Metrics */}

                {studentPerformanceData.classStats && (

                  <View style={styles.studentPerformanceRankingCard}>

                    <Text style={styles.studentPerformanceCardTitle}>Performance Metrics</Text>

                    <View style={styles.studentPerformanceMetrics}>

                      <View style={styles.studentPerformanceMetricItem}>

                        <Text style={styles.studentPerformanceMetricLabel}>Efficiency</Text>

                        <Text style={styles.studentPerformanceMetricValue}>

                          {Math.round(studentPerformanceData.performanceMetrics.efficiencyScore)}/100

                        </Text>

                        <Text style={styles.studentPerformanceMetricComparison}>

                          vs {Math.round(studentPerformanceData.classStats.averageEfficiency)} class avg

                        </Text>

                      </View>

                      <View style={styles.studentPerformanceMetricItem}>

                        <Text style={styles.studentPerformanceMetricLabel}>Consistency</Text>

                        <Text style={styles.studentPerformanceMetricValue}>

                          {Math.round(studentPerformanceData.performanceMetrics.consistencyScore)}/100

                        </Text>

                        <Text style={styles.studentPerformanceMetricComparison}>

                          vs {Math.round(studentPerformanceData.classStats.averageConsistency)} class avg

                        </Text>

                      </View>

                      <View style={styles.studentPerformanceMetricItem}>

                        <Text style={styles.studentPerformanceMetricLabel}>Mastery</Text>

                        <Text style={styles.studentPerformanceMetricValue}>

                          {Math.round(studentPerformanceData.performanceMetrics.masteryScore)}/100

                        </Text>

                        <Text style={styles.studentPerformanceMetricComparison}>

                          vs {Math.round(studentPerformanceData.classStats.averageMastery)} class avg

                        </Text>

                      </View>

                    </View>

                    <View style={styles.studentPerformanceOverallScore}>

                      <Text style={styles.studentPerformanceOverallScoreLabel}>Overall Performance</Text>

                      <Text style={styles.studentPerformanceOverallScoreValue}>

                        {Math.round(studentPerformanceData.performanceMetrics.overallScore)}/100

                      </Text>

                      <Text style={[styles.studentPerformanceLevelText, { 

                        color: studentPerformanceData.performanceLevel === 'excellent' ? '#10b981' :

                               studentPerformanceData.performanceLevel === 'good' ? '#3b82f6' :

                               studentPerformanceData.performanceLevel === 'fair' ? '#f59e0b' : '#ef4444'

                      }]}>

                        {studentPerformanceData.performanceLevel ? 

                          studentPerformanceData.performanceLevel.charAt(0).toUpperCase() + 

                          studentPerformanceData.performanceLevel.slice(1).replace('_', ' ') : 

                          'Unknown'

                        }

                      </Text>

                    </View>

                  </View>

                )}



                {/* Gemini Analysis Sections */}

                {geminiAnalysis && (

                  <>

                    {/* Strengths */}

                    <View style={styles.studentPerformanceAnalysisCard}>

                      <Text style={styles.studentPerformanceCardTitle}>Strengths</Text>

                      {geminiAnalysis.strengths.map((strength: string, index: number) => (

                        <View key={index} style={styles.studentPerformanceAnalysisItem}>

                          <MaterialCommunityIcons name="check-circle" size={16} color="#10b981" />

                          <Text style={styles.studentPerformanceAnalysisText}>{strength}</Text>

                        </View>

                      ))}

                    </View>



                    {/* Areas for Improvement */}

                    <View style={styles.studentPerformanceAnalysisCard}>

                      <Text style={styles.studentPerformanceCardTitle}>Areas for Improvement</Text>

                      {geminiAnalysis.weaknesses.map((weakness: string, index: number) => (

                        <View key={index} style={styles.studentPerformanceAnalysisItem}>

                          <MaterialCommunityIcons name="alert-circle" size={16} color="#f59e0b" />

                          <Text style={styles.studentPerformanceAnalysisText}>{weakness}</Text>

                        </View>

                      ))}

                    </View>



                    {/* Question Analysis */}

                    {geminiAnalysis.questionAnalysis && Array.isArray(geminiAnalysis.questionAnalysis) && geminiAnalysis.questionAnalysis.length > 0 && (

                      <View style={styles.studentPerformanceAnalysisCard}>

                        <Text style={styles.studentPerformanceCardTitle}>Question Analysis</Text>

                        {geminiAnalysis.questionAnalysis.map((analysis: any, index: number) => (

                          <View key={index} style={styles.studentPerformanceAnalysisItem}>

                            <MaterialCommunityIcons name="help-circle" size={16} color="#3b82f6" />

                            <Text style={styles.studentPerformanceAnalysisText}>

                              {typeof analysis === 'string' ? analysis : 

                               typeof analysis === 'object' && analysis.analysis ? analysis.analysis :

                               typeof analysis === 'object' && analysis.questionNumber ? 

                                 `Question ${analysis.questionNumber}: ${analysis.analysis || analysis.concept || JSON.stringify(analysis)}` :

                               JSON.stringify(analysis)}

                            </Text>

                          </View>

                        ))}

                      </View>

                    )}



                    {/* Time Analysis */}

                    {geminiAnalysis.timeAnalysis && (

                      <View style={styles.studentPerformanceAnalysisCard}>

                        <Text style={styles.studentPerformanceCardTitle}>Time Analysis</Text>

                        <Text style={styles.studentPerformanceTimeAnalysisText}>

                          {geminiAnalysis.timeAnalysis.description}

                        </Text>

                        <View style={styles.studentPerformanceTimeComparison}>

                          <Text style={styles.studentPerformanceTimeComparisonText}>

                            Student: {geminiAnalysis.timeAnalysis.studentTime}s | 

                            Class: {geminiAnalysis.timeAnalysis.classAverage}s

                          </Text>

                        </View>

                      </View>

                    )}



                    {/* Recommendations */}

                    <View style={styles.studentPerformanceAnalysisCard}>

                      <Text style={styles.studentPerformanceCardTitle}>Recommendations</Text>

                      {geminiAnalysis.recommendations.map((recommendation: string, index: number) => (

                        <View key={index} style={styles.studentPerformanceAnalysisItem}>

                          <MaterialCommunityIcons name="lightbulb" size={16} color="#3b82f6" />

                          <Text style={styles.studentPerformanceAnalysisText}>{recommendation}</Text>

                        </View>

                      ))}

                    </View>



                    {/* Encouragement */}

                    <View style={styles.studentPerformanceEncouragementCard}>

                      <MaterialCommunityIcons name="heart" size={24} color="#ef4444" />

                      <Text style={styles.studentPerformanceEncouragementText}>

                        {geminiAnalysis.encouragement}

                      </Text>

                    </View>

                  </>

                )}



                {/* Question Details */}
                {studentPerformanceData?.studentResult?.questionResults && studentPerformanceData.studentResult.questionResults.length > 0 && (

                  <View style={styles.studentPerformanceQuestionDetailsCard}>

                    <Text style={styles.studentPerformanceCardTitle}>Question Details</Text>

                    {studentPerformanceData.studentResult.questionResults.map((question: any, index: number) => (

                      <View key={question.questionId} style={styles.studentPerformanceQuestionDetailItem}>

                        <View style={styles.studentPerformanceQuestionDetailHeader}>

                          <Text style={styles.studentPerformanceQuestionNumber}>Question {question.questionNumber}</Text>

                          <View style={[

                            styles.studentPerformanceQuestionStatus,

                            { backgroundColor: '#10b981' } // All questions are correct since student completed

                          ]}>

                            <Text style={styles.studentPerformanceQuestionStatusText}>

                              CORRECT

                            </Text>

                          </View>

                        </View>

                        

                        {/* Show question text */}

                        {question.questionText && (

                          <View style={styles.studentPerformanceQuestionInfo}>

                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Question:</Text>

                            <Text style={styles.studentPerformanceQuestionInfoValue}>"{question.questionText}"</Text>

                          </View>

                        )}

                        

                        {/* Show question image if available */}

                        {question.questionImage && (

                          <View style={styles.studentPerformanceQuestionInfo}>

                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Image:</Text>

                            <Text style={styles.studentPerformanceQuestionInfoValue}>Contains image</Text>

                          </View>

                        )}

                        

                        {/* Show question type */}

                        {question.questionType && (

                          <View style={styles.studentPerformanceQuestionInfo}>

                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Question Type:</Text>

                            <Text style={styles.studentPerformanceQuestionInfoValue}>{question.questionType}</Text>

                          </View>

                        )}

                        

                        {/* Show options if available */}

                        {question.options && question.options.length > 0 && (

                          <View style={styles.studentPerformanceQuestionInfo}>

                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Options:</Text>

                            <Text style={styles.studentPerformanceQuestionInfoValue}>{question.options.join(', ')}</Text>

                          </View>

                        )}

                        

                        {/* Show attempted answers history */}

                        {question.attemptHistory && question.attemptHistory.length > 0 && (

                          <View style={styles.studentPerformanceQuestionInfo}>

                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Attempt History:</Text>

                            <Text style={styles.studentPerformanceQuestionInfoValue}>

                              {question.attemptHistory.map((attempt: any, idx: number) => {

                                const timeSpent = attempt.timeSpent || 0;

                                const timeInSeconds = Math.round(timeSpent / 1000);

                                return `"${attempt.answer || 'blank'}" (${timeInSeconds}s)`;

                              }).join(', ')}

                            </Text>

                          </View>

                        )}

                        

                        {question.studentAnswer && (

                          <View style={styles.studentPerformanceQuestionInfo}>

                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Final Answer:</Text>

                            <Text style={styles.studentPerformanceQuestionInfoValue}>"{question.studentAnswer}"</Text>

                          </View>

                        )}

                        

                        {question.correctAnswer && (

                          <View style={styles.studentPerformanceQuestionInfo}>

                            <Text style={styles.studentPerformanceQuestionInfoLabel}>Correct Answer:</Text>

                            <Text style={styles.studentPerformanceQuestionInfoValue}>"{question.correctAnswer}"</Text>

                          </View>

                        )}

                        

                        <View style={styles.studentPerformanceQuestionDetailStats}>

                          <Text style={styles.studentPerformanceQuestionDetailStat}>

                            Attempts: {question.attempts || 1}

                          </Text>

                          <Text style={styles.studentPerformanceQuestionDetailStat}>

                            Time: {Math.round((question.timeSpent || 0) / 1000)}s

                          </Text>

                        </View>

                        

                        {/* Show enhanced performance data if available */}

                        {question.metadata && (

                          <View style={styles.studentPerformanceQuestionMetadata}>

                            <Text style={styles.studentPerformanceQuestionMetadataTitle}>Performance Data:</Text>

                            <View style={styles.studentPerformanceQuestionMetadataRow}>

                              <Text style={styles.studentPerformanceQuestionMetadataText}>

                                Difficulty: {question.metadata.difficulty || 'medium'}

                              </Text>

                              <Text style={styles.studentPerformanceQuestionMetadataText}>

                                Complexity: {question.metadata.questionComplexity || 'medium'}

                              </Text>

                            </View>

                            {question.metadata.topicTags && question.metadata.topicTags.length > 0 && (

                              <Text style={styles.studentPerformanceQuestionMetadataText}>

                                Topics: {question.metadata.topicTags.join(', ')}

                              </Text>

                            )}

                          </View>

                        )}

                        

                        {/* Show time breakdown if available */}

                        {question.timeBreakdown && (

                          <View style={styles.studentPerformanceQuestionTimeBreakdown}>

                            <Text style={styles.studentPerformanceQuestionTimeBreakdownTitle}>Time Breakdown:</Text>

                            <View style={styles.studentPerformanceQuestionTimeBreakdownRow}>

                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>

                                Reading: {Math.round((question.timeBreakdown.readingTime || 0) / 1000)}s

                              </Text>

                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>

                                Thinking: {Math.round((question.timeBreakdown.thinkingTime || 0) / 1000)}s

                              </Text>

                            </View>

                            <View style={styles.studentPerformanceQuestionTimeBreakdownRow}>

                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>

                                Answering: {Math.round((question.timeBreakdown.answeringTime || 0) / 1000)}s

                              </Text>

                              <Text style={styles.studentPerformanceQuestionTimeBreakdownText}>

                                Reviewing: {Math.round((question.timeBreakdown.reviewingTime || 0) / 1000)}s

                              </Text>

                            </View>

                          </View>

                        )}

                        

                        {/* Show class averages for this question */}

                        {classAverages?.questionAverages?.[question.questionId] && (

                          <View style={styles.studentPerformanceQuestionClassAverages}>

                            <Text style={styles.studentPerformanceQuestionClassAveragesTitle}>Class Average:</Text>

                            <View style={styles.studentPerformanceQuestionClassAveragesRow}>

                              <Text style={styles.studentPerformanceQuestionClassAveragesText}>

                                Time: {Math.round(classAverages.questionAverages[question.questionId].averageTime / 1000)}s

                              </Text>

                              <Text style={styles.studentPerformanceQuestionClassAveragesText}>

                                Attempts: {Math.round(classAverages.questionAverages[question.questionId].averageAttempts)}

                              </Text>

                            </View>

                          </View>

                        )}

                      </View>

                    ))}

                  </View>

                )}



                {/* Class Comparison */}

                {classAverages && (

                  <View style={styles.studentPerformanceComparisonCard}>

                    <Text style={styles.studentPerformanceCardTitle}>Class Comparison</Text>

                    <View style={styles.studentPerformanceDisclaimerContainer}>

                      <MaterialCommunityIcons name="information" size={14} color="#6b7280" />

                      <Text style={styles.studentPerformanceDisclaimerText}>

                        Averages update as more students complete this activity

                      </Text>

                    </View>

                    <View style={styles.studentPerformanceComparisonRow}>

                      <View style={styles.studentPerformanceComparisonItem}>

                        <Text style={styles.studentPerformanceComparisonLabel}>Student Score</Text>

                        <Text style={styles.studentPerformanceComparisonValue}>

                          {studentPerformanceData?.studentResult?.scorePercentage || 0}%

                        </Text>

                      </View>

                      <View style={styles.studentPerformanceComparisonItem}>

                        <Text style={styles.studentPerformanceComparisonLabel}>Class Average</Text>

                        <Text style={styles.studentPerformanceComparisonValue}>

                          {Math.round(classAverages.averageScore)}%

                        </Text>

                      </View>

                    </View>

                    <View style={styles.studentPerformanceComparisonRow}>

                      <View style={styles.studentPerformanceComparisonItem}>

                        <Text style={styles.studentPerformanceComparisonLabel}>Student Time</Text>

                        <Text style={styles.studentPerformanceComparisonValue}>

                          {Math.round((studentPerformanceData?.studentResult?.totalTimeSpent || 0) / 1000)}s

                        </Text>

                      </View>

                      <View style={styles.studentPerformanceComparisonItem}>

                        <Text style={styles.studentPerformanceComparisonLabel}>Class Average</Text>

                        <Text style={styles.studentPerformanceComparisonValue}>

                          {Math.round(classAverages.averageTime / 1000)}s

                        </Text>

                      </View>

                    </View>

                  </View>

                )}

            </ScrollView>

          ) : (

            <View style={styles.studentPerformanceFullScreenNoData}>

              <Text style={styles.studentPerformanceNoDataText}>No performance data available</Text>

            </View>

          )}

        </View>

      </Modal>


      {/* Exercise Result Modal */}

      <Modal visible={showExerciseResultModal} animationType="slide" transparent={false}>

        <View style={styles.studentPerformanceFullScreenContainer}>

          <View style={styles.exerciseResultHeader}>
            <View style={styles.exerciseResultHeaderContent}>
              <Text style={styles.exerciseResultTitle}>Exercise Result</Text>
              {selectedExerciseResultId && (
                <View style={styles.exerciseResultIdBadge}>
                  <MaterialCommunityIcons name="tag" size={12} color="#3b82f6" />
                  <Text style={styles.exerciseResultIdText}>{selectedExerciseResultId}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setShowExerciseResultModal(false)}
              style={styles.exerciseResultCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#1e293b" />
            </TouchableOpacity>
          </View>

          {loadingExerciseResult ? (
            <View style={styles.studentPerformanceFullScreenLoading}>
              <Text style={styles.studentPerformanceLoadingText}>Loading result...</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.studentPerformanceFullScreenContent} 
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Student and Exercise Details */}
              <View style={styles.exerciseResultInfoCard}>
                <View style={styles.exerciseResultInfoRow}>
                  <Text style={styles.exerciseResultInfoLabel}>Student Name:</Text>
                  <Text style={styles.exerciseResultInfoValue}>
                    {selectedExerciseResultData?.studentInfo?.name || 'Unknown Student'}
                  </Text>
                </View>
                <View style={styles.exerciseResultInfoRow}>
                  <Text style={styles.exerciseResultInfoLabel}>Exercise:</Text>
                  <Text style={styles.exerciseResultInfoValue}>
                    {selectedExerciseResultData?.exerciseInfo?.title || selectedExerciseResultData?.exerciseTitle || 'Unknown Exercise'}
                  </Text>
                </View>
                <View style={styles.exerciseResultInfoRow}>
                  <Text style={styles.exerciseResultInfoLabel}>Submitted:</Text>
                  <View style={styles.exerciseResultSubmittedContainer}>
                    <Text style={styles.exerciseResultInfoValue}>
                      {selectedExerciseResultData?.submittedAt ? 
                        new Date(selectedExerciseResultData.submittedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }) : 
                        selectedExerciseResultData?.exerciseSession?.completedAt ?
                        new Date(selectedExerciseResultData.exerciseSession.completedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }) : 'Not submitted'
                      }
                    </Text>
                    {(selectedExerciseResultData?.submittedAt || selectedExerciseResultData?.exerciseSession?.completedAt) && (
                      <View style={styles.exerciseResultOnTimeTag}>
                        <Text style={styles.exerciseResultOnTimeText}>On-Time</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.exerciseResultInfoRow}>
                  <Text style={styles.exerciseResultInfoLabel}>Student Status:</Text>
                  <View style={[
                    styles.exerciseResultStatusTag,
                    { backgroundColor: (editableSummary?.meanPercentageScore ?? 0) >= 75 ? '#dcfce7' : '#fee2e2' }
                  ]}>
                    <Text style={[
                      styles.exerciseResultStatusText,
                      { color: (editableSummary?.meanPercentageScore ?? 0) >= 75 ? '#16a34a' : '#dc2626' }
                    ]}>
                      {(editableSummary?.meanPercentageScore ?? 0) >= 75 ? 'Passing' : 'For Intervention'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Summary Statistics Cards */}
              <View style={styles.exerciseResultSummaryCards}>
                <View style={styles.exerciseResultSummaryCard}>
                  <Text style={styles.exerciseResultSummaryValue}>
                    {editableSummary?.totalTimeSpentSeconds ? 
                      `${Math.floor(editableSummary.totalTimeSpentSeconds / 60)}:${String(Math.floor(editableSummary.totalTimeSpentSeconds % 60)).padStart(2, '0')}` : 
                      '0:00'
                    }
                  </Text>
                  <Text style={styles.exerciseResultSummaryLabel}>TIME</Text>
                  <Text style={styles.exerciseResultSummarySubtext}>
                    {editableSummary?.meanTimePerItemSeconds ? `${Math.round(editableSummary.meanTimePerItemSeconds)}s per item` : '0s per item'}
                  </Text>
                </View>
                
                <View style={styles.exerciseResultSummaryCard}>
                  <Text style={styles.exerciseResultSummaryValue}>{editableSummary?.meanPercentageScore ?? 0}</Text>
                  <Text style={styles.exerciseResultSummaryLabel}>SCORE</Text>
                  <Text style={styles.exerciseResultSummarySubtext}>
                    {editableSummary?.totalCorrect ?? 0}/{editableSummary?.totalItems ?? 0}
                  </Text>
                </View>
                
                <View style={styles.exerciseResultSummaryCard}>
                  <Text style={styles.exerciseResultSummaryValue}>{editableSummary?.totalAttempts ?? 0}</Text>
                  <Text style={styles.exerciseResultSummaryLabel}>ATTEMPTS</Text>
                  <Text style={styles.exerciseResultSummarySubtext}>
                    {editableSummary?.meanAttemptsPerItem ? `${editableSummary.meanAttemptsPerItem.toFixed(1)} per item` : '0 per item'}
                  </Text>
                </View>
              </View>

              {/* History Section */}
              <View style={styles.exerciseResultHistorySection}>
                <Text style={styles.exerciseResultHistoryTitle}>History</Text>
                {editableQuestionResults
                  .filter((qr: any) => filterMode === 'all' ? true : filterMode === 'correct' ? qr.isCorrect : !qr.isCorrect)
                  .sort((a: any, b: any) => {
                    if (sortMode === 'attempts') return (b.attempts || 0) - (a.attempts || 0);
                    if (sortMode === 'time') return (b.timeSpentSeconds || 0) - (a.timeSpentSeconds || 0);
                    if (sortMode === 'type') return String(a.questionType).localeCompare(String(b.questionType));
                    return 0;
                  })
                  .map((qr: any, index: number) => (
                  <View key={qr.questionId || index} style={styles.exerciseResultQuestionCard}>
                    <View style={styles.exerciseResultQuestionHeader}>
                      <View style={styles.exerciseResultQuestionNumber}>
                        <Text style={styles.exerciseResultQuestionNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.exerciseResultQuestionType}>
                        {qr.questionType ? qr.questionType.charAt(0).toUpperCase() + qr.questionType.slice(1).replace('-', ' ') + ' Type' : 'Unknown Type'}
                      </Text>
                      <View style={styles.exerciseResultQuestionStats}>
                        <View style={styles.exerciseResultQuestionStat}>
                          <MaterialCommunityIcons name="eye" size={14} color="#64748b" />
                          <Text style={styles.exerciseResultQuestionStatText}>{qr.attempts || 0}</Text>
                        </View>
                        <View style={styles.exerciseResultQuestionStat}>
                          <MaterialCommunityIcons name="clock" size={14} color="#64748b" />
                          <Text style={styles.exerciseResultQuestionStatText}>{qr.timeSpentSeconds || 0}s</Text>
                        </View>
                        <View style={styles.exerciseResultQuestionStat}>
                          {qr.isCorrect ? (
                            <MaterialCommunityIcons name="check" size={14} color="#16a34a" />
                          ) : (
                            <MaterialCommunityIcons name="close" size={14} color="#dc2626" />
                          )}
                          <Text style={[
                            styles.exerciseResultQuestionStatText,
                            { color: qr.isCorrect ? '#16a34a' : '#dc2626' }
                          ]}>
                            {qr.isCorrect ? 'Correct' : 'Wrong'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    <Text style={styles.exerciseResultQuestionText}>
                      {qr.questionText || 'No question text available'}
                    </Text>
                    
                    {/* Attempt History */}
                    {(qr.attemptHistory || []).map((attempt: any, attemptIndex: number) => (
                      <View key={attemptIndex} style={styles.exerciseResultAttemptRow}>
                        <View style={styles.exerciseResultAttemptIcon}>
                          {attempt.isCorrect ? (
                            <MaterialCommunityIcons name="check" size={16} color="#16a34a" />
                          ) : (
                            <MaterialCommunityIcons name="close" size={16} color="#dc2626" />
                          )}
                        </View>
                        <Text style={styles.exerciseResultAttemptText}>
                          {attemptIndex + 1}: {toFriendlyText(attempt.selectedAnswer, 50)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}

                {/* Delete button */}
                <View style={styles.exerciseResultBottomActions}>
                  <TouchableOpacity
                    style={styles.exerciseResultDeleteButton}
                    onPress={() => {
                      if (!selectedExerciseResultId) return;
                      showAlert('Delete Result?', 'This cannot be undone.', [
                        { text: 'Cancel', style: 'cancel', onPress: () => {} },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          const { success, error } = await deleteData(`/ExerciseResults/${selectedExerciseResultId}`);
                          if (!success) {
                            showAlert('Delete Failed', error || 'Unable to delete result', undefined, 'error');
                            return;
                          }
                          showAlert('Deleted', 'Exercise result removed.', undefined, 'success');
                          setShowExerciseResultModal(false);
                          setSelectedExerciseResultId(null);
                          setSelectedExerciseResultData(null);
                          try {
                            if (activeClasses.length > 0) {
                              await loadAssignments(activeClasses.map(c => c.id));
                            }
                          } catch {}
                        } }
                      ], 'warning');
                    }}
                  >
                    <Text style={styles.exerciseResultDeleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>


      {/* Floating Customer Service Button */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.floatingReportButton,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
            opacity: opacity,
          },
        ]}
      >
        <TouchableOpacity 
          style={styles.floatingReportButtonInner}
          onPress={() => {
            console.log('📞 FAB button pressed - opening tech report modal');
            resetInactivityTimer();
            setShowTechReportModal(true);
          }}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="headset" size={26} color="#ffffff" />

      </TouchableOpacity>

      </Animated.View>


      {/* Technical Report Modal */}
      <Modal visible={showTechReportModal} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <View style={styles.techReportModal}>

            <View style={styles.techReportModalHeader}>

              <View style={styles.techReportModalTitleContainer}>

                <MaterialCommunityIcons name="bug-outline" size={24} color="#ef4444" />

                <Text style={styles.techReportModalTitle}>Report Technical Problem</Text>

              </View>

              <TouchableOpacity 

                onPress={() => {

                  setShowTechReportModal(false);

                  setReportDescription('');

                  setReportScreenshots([]);

                }} 

                style={styles.closeButton}

                disabled={submittingReport}

              >

                <AntDesign name="close" size={24} color="#64748b" />

              </TouchableOpacity>

            </View>

            

            <ScrollView 

              style={styles.techReportModalContent} 

              showsVerticalScrollIndicator={false} 

              keyboardShouldPersistTaps="handled"

              nestedScrollEnabled={true}

            >

              <View style={styles.techReportForm}>

                <Text style={styles.techReportHint}>

                  Help us improve! Please describe any bugs or errors you encountered. Be as detailed as possible and attach screenshots if available.

                </Text>



                <View style={styles.techReportField}>

                  <Text style={styles.techReportFieldLabel}>Problem Description *</Text>

                  <TextInput

                    style={[styles.techReportFieldInput, styles.techReportMessageInput]}

                    value={reportDescription}

                    onChangeText={setReportDescription}

                    placeholder="Describe the bug or error you encountered..."

                    placeholderTextColor="#94a3b8"

                    multiline

                    textAlignVertical="top"

                    editable={!submittingReport}

                  />

                </View>



                <View style={styles.techReportField}>

                  <Text style={styles.techReportFieldLabel}>Screenshots (Optional)</Text>

                  <Text style={styles.techReportFieldHint}>

                    You can attach up to 5 screenshots to help us understand the issue

                  </Text>

                  

                  {reportScreenshots.length > 0 && (

                    <ScrollView 

                      horizontal 

                      showsHorizontalScrollIndicator={false} 

                      style={styles.screenshotsPreviewContainer}

                      nestedScrollEnabled={true}

                    >

                      {reportScreenshots.map((uri, idx) => (

                        <View key={idx} style={styles.screenshotPreviewWrapper}>

                          <Image source={{ uri }} style={styles.screenshotPreview} />

                          <TouchableOpacity

                            style={styles.removeScreenshotButton}

                            onPress={() => removeReportScreenshot(uri)}

                            disabled={submittingReport}

                          >

                            <AntDesign name="close" size={16} color="#ffffff" />

                          </TouchableOpacity>

                        </View>

                      ))}

                    </ScrollView>

                  )}



                  <View style={styles.screenshotButtons}>

                    <TouchableOpacity

                      style={styles.screenshotButton}

                      onPress={takeReportPhoto}

                      disabled={submittingReport || reportScreenshots.length >= 5}

                    >

                      <MaterialIcons name="photo-camera" size={20} color="#3b82f6" />

                      <Text style={styles.screenshotButtonText}>Take Photo</Text>

                    </TouchableOpacity>

                    <TouchableOpacity

                      style={styles.screenshotButton}

                      onPress={pickReportImage}

                      disabled={submittingReport || reportScreenshots.length >= 5}

                    >

                      <MaterialIcons name="photo-library" size={20} color="#3b82f6" />

                      <Text style={styles.screenshotButtonText}>Choose from Gallery</Text>

                    </TouchableOpacity>

                  </View>

                </View>

              </View>

            </ScrollView>



            <View style={styles.techReportModalFooter}>

              <TouchableOpacity 

                style={styles.techReportCancelButton} 

                onPress={() => {

                  setShowTechReportModal(false);

                  setReportDescription('');

                  setReportScreenshots([]);

                }} 

                disabled={submittingReport}

              >

                <Text style={styles.techReportCancelButtonText}>Cancel</Text>

              </TouchableOpacity>

              <TouchableOpacity

                style={[

                  styles.techReportSubmitButton,

                  (!reportDescription.trim() || submittingReport) && styles.techReportSubmitButtonDisabled

                ]}

                disabled={submittingReport || !reportDescription.trim()}

                onPress={submitTechnicalReport}

              >

                {submittingReport ? (

                  <View style={styles.techReportLoadingContainer}>

                    <ActivityIndicator size="small" color="#ffffff" />

                    <Text style={styles.techReportSubmitButtonText}>Submitting...</Text>

                  </View>

                ) : (

                  <View style={styles.techReportSubmitContainer}>

                    <MaterialIcons name="send" size={18} color="#ffffff" />

                    <Text style={styles.techReportSubmitButtonText}>Submit Report</Text>

                  </View>

                )}

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>

      {/* Detailed Statistics Modal */}
      <Modal visible={showDetailedStatsModal} animationType="fade" transparent={true}>
        <TouchableWithoutFeedback onPress={handleCloseDetailedStats}>
          <View style={styles.detailedStatsModalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[styles.detailedStatsModalPanelContainer]}>
                <View style={[styles.detailedStatsModalPanel]}>
                  {/* Header */}
                  <View style={styles.detailedStatsModalHeader}>
                    <View style={styles.detailedStatsModalTitleContainer}>
                      <MaterialCommunityIcons name="chart-box" size={24} color="#8b5cf6" />
                      <Text style={styles.detailedStatsModalTitle}>Class Statistics</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={handleCloseDetailedStats} 
                      style={styles.detailedStatsCloseButton}
                    >
                      <AntDesign name="close" size={24} color="#64748b" />
                    </TouchableOpacity>
                  </View>

          {/* Exercise ID Badge and Export Button */}
          {selectedExerciseForStats && (
            <View style={styles.detailedStatsTopSection}>
              <View style={styles.detailedStatsExerciseIdContainer}>
                <Text style={styles.detailedStatsExerciseIdText}>
                  {selectedExerciseForStats.exerciseId}
                </Text>
              </View>
              
              <TouchableOpacity 
                onPress={handleExportClassStatsToExcel} 
                style={styles.detailedStatsExportButtonMain}
              >
                <MaterialCommunityIcons name="microsoft-excel" size={18} color="#ffffff" />
                <Text style={styles.detailedStatsExportButtonMainText}>Excel</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {/* Loading State */}
          {detailedStatsLoading && (
            <View style={styles.detailedStatsLoadingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.detailedStatsLoadingText}>Preparing statistics...</Text>
            </View>
          )}

          {/* Content - Only show when not loading */}
          {!detailedStatsLoading && (
          <ScrollView style={styles.detailedStatsModalContent} showsVerticalScrollIndicator={false}>
            {/* Class Statistics Section */}
            {selectedExerciseForStats && (() => {
              try {
              const { exerciseResults } = selectedExerciseForStats;
              
              if (!exerciseResults || !Array.isArray(exerciseResults) || exerciseResults.length === 0) {
                return (
                  <View style={styles.detailedStatsErrorContainer}>
                    <MaterialCommunityIcons name="alert-circle" size={48} color="#ef4444" />
                    <Text style={styles.detailedStatsErrorText}>No data available</Text>
                    <Text style={styles.detailedStatsErrorSubtext}>There are no submissions for this exercise yet.</Text>
                  </View>
                );
              }

              const scores = exerciseResults.map((r: any) => r.scorePercentage || 0).filter((s: number) => !isNaN(s) && isFinite(s));
              
              if (scores.length === 0) {
                return (
                  <View style={styles.detailedStatsErrorContainer}>
                    <MaterialCommunityIcons name="alert-circle" size={48} color="#ef4444" />
                    <Text style={styles.detailedStatsErrorText}>Invalid data</Text>
                    <Text style={styles.detailedStatsErrorSubtext}>Unable to calculate statistics from the available data.</Text>
                  </View>
                );
              }
              
              // Calculate statistics
              const mps = scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length;
              const sortedScores = [...scores].sort((a: number, b: number) => a - b);
              const median = sortedScores.length % 2 === 0 
                ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
                : sortedScores[Math.floor(sortedScores.length / 2)];
              
              // Calculate mode (most frequent score)
              const scoreCounts: { [key: number]: number } = {};
              scores.forEach((score: number) => {
                const roundedScore = Math.round(score);
                scoreCounts[roundedScore] = (scoreCounts[roundedScore] || 0) + 1;
              });
              const mode = Object.keys(scoreCounts).reduce((a, b) => 
                scoreCounts[parseInt(a)] > scoreCounts[parseInt(b)] ? a : b
              );
              
              // Calculate standard deviation
              const variance = scores.reduce((sum: number, score: number) => sum + Math.pow(score - mps, 2), 0) / scores.length;
              const stdDev = Math.sqrt(variance);
              
              const highestScore = Math.max(...scores);
              const lowestScore = Math.min(...scores);
              const range = highestScore - lowestScore;
              
              // Find top and bottom students
              const topStudent = exerciseResults.find((r: any) => r.scorePercentage === highestScore);
              const bottomStudent = exerciseResults.find((r: any) => r.scorePercentage === lowestScore);
              
              // Calculate efficiency metrics
              const totalAttempts = exerciseResults.reduce((sum: number, result: any) => {
                return sum + (result.questionResults?.reduce((qSum: number, q: any) => qSum + (q.attempts || 1), 0) || 0);
              }, 0);
              const avgAttemptsPerItem = totalAttempts / (exerciseResults[0]?.questionResults?.length || 1) / exerciseResults.length;
              
              const totalTime = exerciseResults.reduce((sum: number, result: any) => sum + (result.totalTimeSpent || 0), 0);
              const avgTimePerItem = totalTime / (exerciseResults[0]?.questionResults?.length || 1) / exerciseResults.length;
              
              // Performance distribution
              const highlyProficientCount = scores.filter((s: number) => s >= 85).length;
              const proficientCount = scores.filter((s: number) => s >= 75 && s < 85).length;
              const nearlyProficientCount = scores.filter((s: number) => s >= 50 && s < 75).length;
              const lowProficientCount = scores.filter((s: number) => s >= 25 && s < 50).length;
              const notProficientCount = scores.filter((s: number) => s < 25).length;
              
              // Calculate pass rate (students with score >= 75%)
              const passCount = scores.filter((s: number) => s >= 75).length;
              const passRate = scores.length > 0 ? (passCount / scores.length) * 100 : 0;

              return (
                <View style={styles.detailedStatsClassStatsSection}>
                  {/* Top Row - MPS and Pass Rate */}
                  <View style={styles.detailedStatsTopRow}>
                    <View style={styles.detailedStatsTopCard}>
                      <MaterialCommunityIcons name="percent" size={16} color="#64748b" />
                      <Text style={styles.detailedStatsTopLabel}>MPS</Text>
                      <Text style={styles.detailedStatsTopValue}>{mps.toFixed(1)}%</Text>
                    </View>
                    
                    <View style={styles.detailedStatsTopCard}>
                      <MaterialCommunityIcons name="chart-line" size={16} color="#64748b" />
                      <Text style={styles.detailedStatsTopLabel}>Pass Rate</Text>
                      <Text style={[styles.detailedStatsTopValue, { color: '#ef4444' }]}>{passRate.toFixed(1)}%</Text>
                      <Text style={styles.detailedStatsTopSubtext}>{passCount}/{scores.length}</Text>
                    </View>
                  </View>

                  {/* Central Tendency */}
                  <View style={styles.detailedStatsSubsection}>
                    <Text style={styles.detailedStatsSubtitle}>Central Tendency</Text>
                    <View style={styles.detailedStatsGrid}>
                      <View style={styles.detailedStatsCard}>
                        <MaterialCommunityIcons name="chart-line-variant" size={16} color="#64748b" />
                        <Text style={styles.detailedStatsLabel}>Mean</Text>
                        <Text style={styles.detailedStatsValue}>{mps.toFixed(1)}%</Text>
                      </View>
                      
                      <View style={styles.detailedStatsCard}>
                        <MaterialCommunityIcons name="chart-line-variant" size={16} color="#64748b" />
                        <Text style={styles.detailedStatsLabel}>Median</Text>
                        <Text style={styles.detailedStatsValue}>{median.toFixed(1)}%</Text>
                      </View>
                    </View>
                    
                    <View style={styles.detailedStatsModeCard}>
                        <MaterialCommunityIcons name="chart-line" size={16} color="#64748b" />
                      <Text style={styles.detailedStatsLabel}>Mode</Text>
                      <Text style={styles.detailedStatsValue}>{mode}%</Text>
                    </View>
                  </View>
                  
                  {/* Dispersion */}
                  <View style={styles.detailedStatsSubsection}>
                    <Text style={styles.detailedStatsSubtitle}>Dispersion</Text>
                    <View style={styles.detailedStatsGrid}>
                      <View style={styles.detailedStatsCard}>
                        <MaterialCommunityIcons name="sigma" size={16} color="#64748b" />
                        <Text style={styles.detailedStatsLabel}>Std Dev</Text>
                        <Text style={styles.detailedStatsValue}>{stdDev.toFixed(1)}</Text>
                        <Text style={styles.detailedStatsSubtext}>
                          {stdDev < 10 ? 'Low' : stdDev < 20 ? 'Moderate' : 'High'}
                        </Text>
                      </View>
                      
                      <View style={styles.detailedStatsCard}>
                        <MaterialCommunityIcons name="arrow-expand-horizontal" size={16} color="#64748b" />
                        <Text style={styles.detailedStatsLabel}>Range</Text>
                        <Text style={styles.detailedStatsValue}>{range.toFixed(1)}%</Text>
                        <Text style={styles.detailedStatsSubtext}>{lowestScore.toFixed(0)}-{highestScore.toFixed(0)}%</Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* Top & Bottom */}
                  <View style={styles.detailedStatsSubsection}>
                    <Text style={styles.detailedStatsSubtitle}>Top & Bottom</Text>
                    <View style={styles.detailedStatsGrid}>
                      <View style={[styles.detailedStatsCard, { backgroundColor: '#f0fdf4' }]}>
                        <MaterialCommunityIcons name="trophy" size={16} color="#10b981" />
                        <Text style={[styles.detailedStatsLabel, { color: '#10b981' }]}>Highest</Text>
                        <Text style={[styles.detailedStatsValue, { color: '#10b981' }]}>{highestScore.toFixed(1)}%</Text>
                        <Text style={[styles.detailedStatsSubtext, { fontSize: 10, color: '#10b981' }]} numberOfLines={1}>
                          {topStudent ? (topStudent.studentInfo?.name || 'Unknown') : '—'}
                        </Text>
                      </View>
                      
                      <View style={[styles.detailedStatsCard, { backgroundColor: '#fef2f2' }]}>
                        <MaterialCommunityIcons name="trophy" size={16} color="#ef4444" />
                        <Text style={[styles.detailedStatsLabel, { color: '#ef4444' }]}>Lowest</Text>
                        <Text style={[styles.detailedStatsValue, { color: '#ef4444' }]}>{lowestScore.toFixed(1)}%</Text>
                        <Text style={[styles.detailedStatsSubtext, { fontSize: 10, color: '#ef4444' }]} numberOfLines={1}>
                          {bottomStudent ? (bottomStudent.studentInfo?.name || 'Unknown') : '—'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* Efficiency */}
                  <View style={styles.detailedStatsSubsection}>
                    <Text style={styles.detailedStatsSubtitle}>Efficiency</Text>
                    <View style={styles.detailedStatsGrid}>
                      <View style={styles.detailedStatsCard}>
                        <MaterialCommunityIcons name="format-list-checks" size={16} color="#64748b" />
                        <Text style={styles.detailedStatsLabel}>Avg Attempts</Text>
                        <Text style={styles.detailedStatsValue}>{avgAttemptsPerItem.toFixed(1)}</Text>
                        <Text style={styles.detailedStatsSubtext}>
                          {avgAttemptsPerItem < 1.5 ? 'Excellent' : avgAttemptsPerItem < 2.5 ? 'Good' : 'Fair'}
                        </Text>
                      </View>
                      
                      <View style={styles.detailedStatsCard}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#64748b" />
                        <Text style={styles.detailedStatsLabel}>Avg Time</Text>
                        <Text style={styles.detailedStatsValue}>
                          {avgTimePerItem > 60000 
                            ? `${Math.floor(avgTimePerItem / 60000)}m ${Math.floor((avgTimePerItem % 60000) / 1000)}s`
                            : `${Math.floor(avgTimePerItem / 1000)}s`}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* Performance Distribution */}
                  <View style={styles.detailedStatsSubsection}>
                    <Text style={styles.detailedStatsSubtitle}>Performance Distribution</Text>
                    <View style={styles.detailedStatsDistribution}>
                      <View style={styles.detailedStatsDistItem}>
                        <View style={[styles.detailedStatsDistBar, { width: scores.length > 0 ? `${(highlyProficientCount / scores.length) * 100}%` : '0%', backgroundColor: '#10b981' }]} />
                        <View style={styles.detailedStatsDistLabel}>
                          <View style={styles.detailedStatsDistLabelRow}>
                            <View style={[styles.detailedStatsDistDot, { backgroundColor: '#10b981' }]} />
                            <Text style={styles.detailedStatsDistText}>Highly Proficient (85-100%)</Text>
                          </View>
                          <Text style={styles.detailedStatsDistCount}>{highlyProficientCount} ({scores.length > 0 ? ((highlyProficientCount / scores.length) * 100).toFixed(0) : 0}%)</Text>
                        </View>
                      </View>
                      
                      <View style={styles.detailedStatsDistItem}>
                        <View style={[styles.detailedStatsDistBar, { width: scores.length > 0 ? `${(proficientCount / scores.length) * 100}%` : '0%', backgroundColor: '#3b82f6' }]} />
                        <View style={styles.detailedStatsDistLabel}>
                          <View style={styles.detailedStatsDistLabelRow}>
                            <View style={[styles.detailedStatsDistDot, { backgroundColor: '#3b82f6' }]} />
                            <Text style={styles.detailedStatsDistText}>Proficient (75-84%)</Text>
                          </View>
                          <Text style={styles.detailedStatsDistCount}>{proficientCount} ({scores.length > 0 ? ((proficientCount / scores.length) * 100).toFixed(0) : 0}%)</Text>
                        </View>
                      </View>
                      
                      <View style={styles.detailedStatsDistItem}>
                        <View style={[styles.detailedStatsDistBar, { width: scores.length > 0 ? `${(nearlyProficientCount / scores.length) * 100}%` : '0%', backgroundColor: '#f59e0b' }]} />
                        <View style={styles.detailedStatsDistLabel}>
                          <View style={styles.detailedStatsDistLabelRow}>
                            <View style={[styles.detailedStatsDistDot, { backgroundColor: '#f59e0b' }]} />
                            <Text style={styles.detailedStatsDistText}>Nearly Proficient (50-74%)</Text>
                          </View>
                          <Text style={styles.detailedStatsDistCount}>{nearlyProficientCount} ({scores.length > 0 ? ((nearlyProficientCount / scores.length) * 100).toFixed(0) : 0}%)</Text>
                        </View>
                      </View>
                      
                      <View style={styles.detailedStatsDistItem}>
                        <View style={[styles.detailedStatsDistBar, { width: scores.length > 0 ? `${(lowProficientCount / scores.length) * 100}%` : '0%', backgroundColor: '#f97316' }]} />
                        <View style={styles.detailedStatsDistLabel}>
                          <View style={styles.detailedStatsDistLabelRow}>
                            <View style={[styles.detailedStatsDistDot, { backgroundColor: '#f97316' }]} />
                            <Text style={styles.detailedStatsDistText}>Low Proficient (25-49%)</Text>
                          </View>
                          <Text style={styles.detailedStatsDistCount}>{lowProficientCount} ({scores.length > 0 ? ((lowProficientCount / scores.length) * 100).toFixed(0) : 0}%)</Text>
                        </View>
                      </View>
                      
                      <View style={styles.detailedStatsDistItem}>
                        <View style={[styles.detailedStatsDistBar, { width: scores.length > 0 ? `${(notProficientCount / scores.length) * 100}%` : '0%', backgroundColor: '#ef4444' }]} />
                        <View style={styles.detailedStatsDistLabel}>
                          <View style={styles.detailedStatsDistLabelRow}>
                            <View style={[styles.detailedStatsDistDot, { backgroundColor: '#ef4444' }]} />
                            <Text style={styles.detailedStatsDistText}>Not Proficient (&lt;25%)</Text>
                          </View>
                          <Text style={styles.detailedStatsDistCount}>{notProficientCount} ({scores.length > 0 ? ((notProficientCount / scores.length) * 100).toFixed(0) : 0}%)</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  
                  {/* Time vs Score Per Item Chart */}
                  <View style={styles.detailedStatsSubsection}>
                    <Text style={styles.detailedStatsSubtitle}>Time vs Score Per Item</Text>
                    {selectedExerciseForStats && (() => {
                      const { exerciseResults } = selectedExerciseForStats;
                      const firstResult = exerciseResults[0];
                      
                      if (!firstResult?.questionResults?.length) {
                        return (
                          <View style={styles.noDataContainer}>
                            <Text style={styles.noDataText}>No data available</Text>
                          </View>
                        );
                      }

                      // Calculate average time and score per item
                      const chartData = firstResult.questionResults.map((question: any, index: number) => {
                        const questionNumber = question.questionNumber || index + 1;
                        
                        // Get all student results for this question
                        const questionResults = exerciseResults.map((result: any) => {
                          return result.questionResults?.find((q: any) => q.questionId === question.questionId);
                        }).filter(Boolean);
                        
                        // Calculate average time
                        const timeSpentArray = questionResults
                          .map((q: any) => q.timeSpentSeconds || 0)
                          .filter(time => time > 0);
                        
                        const avgTime = timeSpentArray.length > 0 
                          ? timeSpentArray.reduce((sum: number, time: number) => sum + time, 0) / timeSpentArray.length 
                          : 0;
                        
                        // Calculate average score (percentage of students who got it correct)
                        const correctCount = questionResults.filter((q: any) => q.isCorrect).length;
                        const avgScore = questionResults.length > 0 
                          ? (correctCount / questionResults.length) * 100 
                          : 0;
                        
                        return {
                          itemNumber: questionNumber,
                          avgTime: avgTime,
                          avgScore: avgScore,
                        };
                      });

                      // Find max time for scaling
                      const maxTime = Math.max(...chartData.map((d: { itemNumber: number; avgTime: number; avgScore: number }) => d.avgTime), 1);
                      const chartHeight = 200;
                      
                      // SVG Chart dimensions
                      const svgWidth = 320;
                      const svgHeight = chartHeight + 60; // Extra space for labels
                      const padding = 50;
                      const chartWidth = svgWidth - (padding * 2);
                      const chartHeightInner = svgHeight - (padding * 2) - 40; // Space for X-axis labels
                      
                      // Convert data to SVG coordinates
                      const svgData = chartData.map((data: { itemNumber: number; avgTime: number; avgScore: number }, index: number) => {
                        const x = padding + (index / (chartData.length - 1 || 1)) * chartWidth;
                        const timeY = padding + chartHeightInner - (data.avgTime / maxTime) * chartHeightInner;
                        const scoreY = padding + chartHeightInner - (data.avgScore / 100) * chartHeightInner;
                        
                        return {
                          x,
                          timeY,
                          scoreY,
                          itemNumber: data.itemNumber,
                          avgTime: data.avgTime,
                          avgScore: data.avgScore,
                        };
                      });
                      
                      // Create path strings for lines
                      const timePath = svgData.map((point: any, index: number) => 
                        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.timeY}`
                      ).join(' ');
                      
                      const scorePath = svgData.map((point: any, index: number) => 
                        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.scoreY}`
                      ).join(' ');
                      
                      return (
                        <View style={styles.timeChartContainer}>
                          {/* Legend */}
                          <View style={styles.lineChartLegend}>
                            <View style={styles.lineChartLegendItem}>
                              <View style={[styles.lineChartLegendDot, { backgroundColor: '#3b82f6' }]} />
                              <Text style={styles.lineChartLegendText}>Avg Time (sec)</Text>
                            </View>
                            <View style={styles.lineChartLegendItem}>
                              <View style={[styles.lineChartLegendDot, { backgroundColor: '#10b981' }]} />
                              <Text style={styles.lineChartLegendText}>Avg Score (%)</Text>
                            </View>
                          </View>
                          
                          <View style={styles.lineChartMainContainer}>
                            {/* SVG Chart */}
                            <View style={styles.lineChartContent}>
                              <Svg width={svgWidth} height={svgHeight}>
                                {/* Chart frame */}
                                <Line
                                  x1={padding}
                                  y1={padding}
                                  x2={padding}
                                  y2={padding + chartHeightInner}
                                  stroke="#cbd5e1"
                                  strokeWidth="2"
                                />
                                <Line
                                  x1={padding}
                                  y1={padding + chartHeightInner}
                                  x2={padding + chartWidth}
                                  y2={padding + chartHeightInner}
                                  stroke="#cbd5e1"
                                  strokeWidth="2"
                                />
                                <Line
                                  x1={padding + chartWidth}
                                  y1={padding}
                                  x2={padding + chartWidth}
                                  y2={padding + chartHeightInner}
                                  stroke="#cbd5e1"
                                  strokeWidth="2"
                                />
                                <Line
                                  x1={padding}
                                  y1={padding}
                                  x2={padding + chartWidth}
                                  y2={padding}
                                  stroke="#cbd5e1"
                                  strokeWidth="2"
                                />
                                
                                {/* Grid lines */}
                                <Line
                                  x1={padding}
                                  y1={padding + chartHeightInner * 0.25}
                                  x2={padding + chartWidth}
                                  y2={padding + chartHeightInner * 0.25}
                                  stroke="#f1f5f9"
                                  strokeWidth="1"
                                />
                                <Line
                                  x1={padding}
                                  y1={padding + chartHeightInner * 0.5}
                                  x2={padding + chartWidth}
                                  y2={padding + chartHeightInner * 0.5}
                                  stroke="#f1f5f9"
                                  strokeWidth="1"
                                />
                                <Line
                                  x1={padding}
                                  y1={padding + chartHeightInner * 0.75}
                                  x2={padding + chartWidth}
                                  y2={padding + chartHeightInner * 0.75}
                                  stroke="#f1f5f9"
                                  strokeWidth="1"
                                />
                                
                                {/* Vertical grid lines */}
                                <Line
                                  x1={padding + chartWidth * 0.25}
                                  y1={padding}
                                  x2={padding + chartWidth * 0.25}
                                  y2={padding + chartHeightInner}
                                  stroke="#f1f5f9"
                                  strokeWidth="1"
                                />
                                <Line
                                  x1={padding + chartWidth * 0.5}
                                  y1={padding}
                                  x2={padding + chartWidth * 0.5}
                                  y2={padding + chartHeightInner}
                                  stroke="#f1f5f9"
                                  strokeWidth="1"
                                />
                                <Line
                                  x1={padding + chartWidth * 0.75}
                                  y1={padding}
                                  x2={padding + chartWidth * 0.75}
                                  y2={padding + chartHeightInner}
                                  stroke="#f1f5f9"
                                  strokeWidth="1"
                                />
                                
                                {/* Time line (blue) */}
                                <Path
                                  d={timePath}
                                  stroke="#3b82f6"
                                  strokeWidth="3"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                
                                {/* Score line (green) */}
                                <Path
                                  d={scorePath}
                                  stroke="#10b981"
                                  strokeWidth="3"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                
                                {/* Time data points */}
                                {svgData.map((point: any, index: number) => (
                                  <Circle
                                    key={`time-point-${index}`}
                                    cx={point.x}
                                    cy={point.timeY}
                                    r="5"
                                    fill="#3b82f6"
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                  />
                                ))}
                                
                                {/* Score data points */}
                                {svgData.map((point: any, index: number) => (
                                  <Circle
                                    key={`score-point-${index}`}
                                    cx={point.x}
                                    cy={point.scoreY}
                                    r="5"
                                    fill="#10b981"
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                  />
                                ))}
                                
                                {/* X-axis labels */}
                                {svgData.map((point: any, index: number) => (
                                  <SvgText
                                    key={`label-${index}`}
                                    x={point.x}
                                    y={svgHeight - 8}
                                    fontSize="10"
                                    fill="#475569"
                                    fontWeight="600"
                                    textAnchor="middle"
                                  >
                                    {point.itemNumber}
                                  </SvgText>
                                ))}
                                
                                {/* Y-axis labels for Time (left side) */}
                                <SvgText
                                  x={padding - 10}
                                  y={padding + 5}
                                  fontSize="9"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="end"
                                >
                                  {Math.round(maxTime)}
                                </SvgText>
                                <SvgText
                                  x={padding - 10}
                                  y={padding + chartHeightInner * 0.5 + 5}
                                  fontSize="9"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="end"
                                >
                                  {Math.round(maxTime / 2)}
                                </SvgText>
                                <SvgText
                                  x={padding - 10}
                                  y={padding + chartHeightInner + 5}
                                  fontSize="9"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="end"
                                >
                                  0
                                </SvgText>
                                
                                {/* Y-axis labels for Score (right side) */}
                                <SvgText
                                  x={padding + chartWidth + 10}
                                  y={padding + 5}
                                  fontSize="9"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="start"
                                >
                                  100
                                </SvgText>
                                <SvgText
                                  x={padding + chartWidth + 10}
                                  y={padding + chartHeightInner * 0.5 + 5}
                                  fontSize="9"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="start"
                                >
                                  50
                                </SvgText>
                                <SvgText
                                  x={padding + chartWidth + 10}
                                  y={padding + chartHeightInner + 5}
                                  fontSize="9"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="start"
                                >
                                  0
                                </SvgText>
                                
                                {/* Axis titles */}
                                <SvgText
                                  x={padding - 25}
                                  y={padding + chartHeightInner * 0.5}
                                  fontSize="10"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="middle"
                                  transform={`rotate(-90, ${padding - 25}, ${padding + chartHeightInner * 0.5})`}
                                >
                                  Time (sec)
                                </SvgText>
                                <SvgText
                                  x={padding + chartWidth + 25}
                                  y={padding + chartHeightInner * 0.5}
                                  fontSize="10"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="middle"
                                  transform={`rotate(90, ${padding + chartWidth + 25}, ${padding + chartHeightInner * 0.5})`}
                                >
                                  Score (%)
                                </SvgText>
                                <SvgText
                                  x={padding + chartWidth * 0.5}
                                  y={svgHeight - 2}
                                  fontSize="10"
                                  fill="#64748b"
                                  fontWeight="600"
                                  textAnchor="middle"
                                >
                                  Item Number
                                </SvgText>
                              </Svg>
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                </View>
              );
              } catch (error: any) {
                console.error('Error rendering detailed statistics:', error);
                return (
                  <View style={styles.detailedStatsErrorContainer}>
                    <MaterialCommunityIcons name="alert-circle" size={48} color="#ef4444" />
                    <Text style={styles.detailedStatsErrorText}>Error Loading Statistics</Text>
                    <Text style={styles.detailedStatsErrorSubtext}>
                      An error occurred while processing the statistics. Please try again.
                    </Text>
                    <TouchableOpacity 
                      style={styles.detailedStatsRetryButton}
                      onPress={handleRetryDetailedStats}
                    >
                      <MaterialCommunityIcons name="refresh" size={18} color="#ffffff" />
                      <Text style={styles.detailedStatsRetryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
            })()}
            {/* Item Analysis Section */}
            <View style={styles.detailedStatsItemAnalysisSection}>
              <Text style={styles.detailedStatsSectionTitle}>Item Analysis</Text>
              
              {selectedExerciseForStats && (() => {
                const { exerciseResults } = selectedExerciseForStats;
                const firstResult = exerciseResults[0];
                
                if (!firstResult?.questionResults?.length) {
                  return (
                    <View style={styles.noDataContainer}>
                      <Text style={styles.noDataText}>No question data available</Text>
                    </View>
                  );
                }

                // Filter to only show questions that have been answered by students
                const answeredQuestions = firstResult.questionResults.filter((question: any) => {
                  const hasAnswers = exerciseResults.some((result: any) => {
                    const qResult = result.questionResults?.find((q: any) => q.questionId === question.questionId);
                    return qResult && (qResult.studentAnswer || qResult.answer);
                  });
                  return hasAnswers;
                });

                return answeredQuestions.map((question: any, questionIndex: number) => {
                  // More accurate question number calculation
                  const questionNumber = question.questionNumber || questionIndex + 1;
                  const questionText = question.questionText || `Question ${questionNumber}`;
                  
                  // More accurate question type calculation
                  let questionType = question.questionType || 'Unknown';
                  if (questionType.includes('multiple-choice')) {
                    questionType = 'Multiple Choice';
                  } else if (questionType.includes('identification')) {
                    questionType = 'Identification';
                  } else if (questionType.includes('re-order')) {
                    questionType = 'Re-order';
                  } else if (questionType.includes('matching')) {
                    questionType = 'Matching';
                  }
                  
                  // Calculate metrics based on actual student results for this specific question
                  const questionResults = exerciseResults.map((result: any) => {
                    return result.questionResults?.find((q: any) => q.questionId === question.questionId);
                  }).filter(Boolean);
                  
                  // Only proceed if we have actual responses for this question
                  if (questionResults.length === 0) return null;
                  
                  // Calculate accurate time metrics based on actual student performance
                  const timeSpentArray = questionResults
                    .map((q: any) => q.timeSpentSeconds || 0)
                    .filter(time => time > 0);
                  
                  const avgTimeSpent = timeSpentArray.length > 0 
                    ? timeSpentArray.reduce((sum, time) => sum + time, 0) / timeSpentArray.length 
                    : 0;
                  
                  // Calculate actual time spent in seconds (already in seconds)
                  const avgTimeInSeconds = Math.round(avgTimeSpent);
                  
                  // Calculate average attempts by students
                  const attemptsArray = questionResults.map((q: any) => q.attempts || 1);
                  const avgAttempts = attemptsArray.length > 0 
                    ? attemptsArray.reduce((sum, attempts) => sum + attempts, 0) / attemptsArray.length 
                    : 1;
                  
                  // Get the correct answer from the question data
                  const correctAnswer = question.correctAnswer || question.answer;
                  
                  // Analyze answer distribution for this question
                  const answerDistribution: { [key: string]: { count: number, isCorrect: boolean } } = {};
                  let totalStudentsAnswered = 0;
                  let correctResponses = 0;
                  
                  let noAnswerCount = 0;
                  
                  exerciseResults.forEach((result: any) => {
                    const qResult = result.questionResults?.find((q: any) => q.questionId === question.questionId);
                    if (qResult && (qResult.studentAnswer || qResult.answer)) {
                      totalStudentsAnswered++;
                      const rawAnswer = qResult.studentAnswer || qResult.answer;
                      const formattedAnswer = formatAnswerForDisplay(rawAnswer, questionType);
                      
                      // Determine if this answer is correct
                      let isCorrect = false;
                      if (correctAnswer) {
                        const formattedCorrectAnswer = formatAnswerForDisplay(correctAnswer, questionType);
                        isCorrect = formattedAnswer === formattedCorrectAnswer;
                      } else {
                        // Fallback to the isCorrect flag from the result
                        isCorrect = qResult.isCorrect || false;
                      }
                      
                      if (isCorrect) {
                        correctResponses++;
                      }
                      
                      if (!answerDistribution[formattedAnswer]) {
                        answerDistribution[formattedAnswer] = { count: 0, isCorrect };
                      }
                      answerDistribution[formattedAnswer].count++;
                    } else {
                      // Student didn't answer this question
                      noAnswerCount++;
                    }
                  });
                  
                  // Add "No Answer" entry if there are students who didn't respond
                  if (noAnswerCount > 0) {
                    answerDistribution['No Answer'] = { count: noAnswerCount, isCorrect: false };
                  }

                  // Sort answers by frequency (most common first)
                  const sortedAnswers = Object.entries(answerDistribution)
                    .sort(([,a], [,b]) => b.count - a.count);

                  // Calculate difficulty index (percentage who got it correct out of those who answered)
                  const difficultyIndex = totalStudentsAnswered > 0 ? (correctResponses / totalStudentsAnswered) * 100 : 0;
                  
                  // Calculate discrimination index (difference between top and bottom performers)
                  const topPerformers = exerciseResults
                    .sort((a: any, b: any) => (b.scorePercentage || 0) - (a.scorePercentage || 0))
                    .slice(0, Math.ceil(exerciseResults.length * 0.27));
                  const bottomPerformers = exerciseResults
                    .sort((a: any, b: any) => (a.scorePercentage || 0) - (b.scorePercentage || 0))
                    .slice(0, Math.ceil(exerciseResults.length * 0.27));
                  
                  const topCorrect = topPerformers.filter((result: any) => {
                    const qResult = result.questionResults?.find((q: any) => q.questionId === question.questionId);
                    return qResult?.isCorrect || false;
                  }).length;
                  
                  const bottomCorrect = bottomPerformers.filter((result: any) => {
                    const qResult = result.questionResults?.find((q: any) => q.questionId === question.questionId);
                    return qResult?.isCorrect || false;
                  }).length;
                  
                  const discriminationIndex = topPerformers.length > 0 && bottomPerformers.length > 0 
                    ? ((topCorrect / topPerformers.length) - (bottomCorrect / bottomPerformers.length)) * 100
                    : 0;

                  return (
                    <View key={question.questionId || questionIndex} style={styles.itemAnalysisCard}>
                      <View style={styles.itemAnalysisHeader}>
                        <View style={styles.itemAnalysisTitleRow}>
                          <View style={styles.itemAnalysisNumberBadge}>
                            <Text style={styles.itemAnalysisNumberText}>{questionNumber}</Text>
                          </View>
                          <View style={styles.itemAnalysisTypeBadge}>
                            <Text style={styles.itemAnalysisTypeText}>{questionType}</Text>
                          </View>
                          <View style={styles.itemAnalysisAttemptsBadge}>
                            <MaterialCommunityIcons name="repeat" size={12} color="#64748b" />
                            <Text style={styles.itemAnalysisAttemptsText}>{avgAttempts.toFixed(1)}</Text>
                          </View>
                          <View style={styles.itemAnalysisTimeBadge}>
                            <MaterialCommunityIcons name="clock" size={12} color="#64748b" />
                            <Text style={styles.itemAnalysisTimeText}>{avgTimeInSeconds}s</Text>
                          </View>
                        </View>
                        <Text style={styles.itemAnalysisQuestionText}>
                          {questionText}
                        </Text>
                      </View>
                      
                      <View style={styles.itemAnalysisTable}>
                        <View style={styles.itemAnalysisTableHeader}>
                          <View style={styles.itemAnalysisAnswerCell}>
                            <Text style={styles.itemAnalysisTableHeaderText}>Answer</Text>
                          </View>
                          <View style={{
                            flex: 1,
                            alignItems: 'center',
                          }}>
                            <Text style={styles.itemAnalysisTableHeaderText}>Frequency</Text>
                          </View>
                          <View style={{
                            flex: 1,
                            alignItems: 'center',
                          }}>
                            <Text style={styles.itemAnalysisTableHeaderText}>Percent</Text>
                          </View>
                        </View>
                        
                        {sortedAnswers.map(([answer, data], answerIndex) => (
                          <View 
                            key={answerIndex} 
                            style={[
                              styles.itemAnalysisTableRow,
                              data.isCorrect && styles.itemAnalysisCorrectRow
                            ]}
                          >
                            <View style={styles.itemAnalysisAnswerCell}>
                              <View style={styles.itemAnalysisAnswerContent}>
                                {data.isCorrect && (
                                  <MaterialCommunityIcons name="check" size={16} color="#10b981" style={styles.itemAnalysisCheckIcon} />
                                )}
                                <Text 
                                  style={[
                                    styles.itemAnalysisAnswerText,
                                    data.isCorrect && styles.itemAnalysisCorrectText
                                  ]}
                                  numberOfLines={3}
                                  ellipsizeMode="tail"
                                >
                                  {answer}
                                </Text>
                              </View>
                            </View>
                            <View style={{
                              flex: 1,
                              alignItems: 'center',
                            }}>
                              <Text style={styles.itemAnalysisFrequencyText}>{data.count}</Text>
                            </View>
                            <View style={{
                              flex: 1,
                              alignItems: 'center',
                            }}>
                              <Text style={styles.itemAnalysisPercentageText}>
                                {exerciseResults.length > 0 ? Math.round((data.count / exerciseResults.length) * 100) : 0}%
                              </Text>
                            </View>
                          </View>
                        ))}
                        
                        {/* Total Row */}
                        <View style={{
                          flexDirection: 'row',
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          backgroundColor: '#f1f5f9',
                          borderTopWidth: 2,
                          borderTopColor: '#e2e8f0',
                          alignItems: 'center',
                        }}>
                          <View style={styles.itemAnalysisAnswerCell}>
                            <Text style={{
                              fontSize: 13,
                              color: '#1e293b',
                              fontWeight: '700',
                              textAlign: 'center',
                            }}>Total</Text>
                          </View>
                          <View style={{
                            flex: 1,
                            alignItems: 'center',
                          }}>
                            <Text style={{
                              fontSize: 13,
                              color: '#1e293b',
                              fontWeight: '700',
                              textAlign: 'center',
                            }}>
                              {exerciseResults.length}
                            </Text>
                          </View>
                          <View style={{
                            flex: 1,
                            alignItems: 'center',
                          }}>
                            <Text style={{
                              fontSize: 13,
                              color: '#1e293b',
                              fontWeight: '700',
                              textAlign: 'center',
                            }}>100%</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          </ScrollView>
          )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Custom Alert */}

      <CustomAlert

        visible={alertVisible}

        title={alertTitle}

        message={alertMessage}

        buttons={alertButtons}

        icon={alertIcon}

        onClose={() => {

          setAlertVisible(false);

          // Process next alert in queue after a short delay

          setTimeout(() => {

            processNextAlert();

          }, 200);

        }}

      />

    </View>

  );

}
const styles = StyleSheet.create({

  container: {

    flex: 1,

    backgroundColor: '#ffffff',

    minHeight: '100%',

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

    paddingHorizontal: Math.min(12, staticWidth * 0.03),

    paddingTop: Math.min(20, staticHeight * 0.025),

    paddingBottom: Math.min(100, staticHeight * 0.12),

  },

  

  // Header Styles

  header: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: Math.min(16, staticHeight * 0.02),

    paddingHorizontal: 0,

    paddingVertical: Math.min(8, staticHeight * 0.01),

  },

  avatarContainer: {

    marginRight: 16,

  },

  avatar: {

    width: Math.min(48, staticWidth * 0.12),

    height: Math.min(48, staticWidth * 0.12),

    borderRadius: Math.min(24, staticWidth * 0.06),

    backgroundColor: '#f1f5f9',

    justifyContent: 'center',

    alignItems: 'center',

    borderWidth: 2,

    borderColor: '#e2e8f0',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.08,

    shadowRadius: 2,

    elevation: 2,

  },

  welcomeText: {

    flex: 1,

  },

  welcomeLabel: {

    fontSize: Math.min(12, staticWidth * 0.03),

    color: '#64748b',

    marginBottom: 2,

    fontWeight: '500',

  },

  welcomeTitle: {

    fontSize: Math.min(18, staticWidth * 0.045),

    fontWeight: '700',

    color: '#1e293b',

  },

  nameRow: {

    flexDirection: 'row',

    alignItems: 'center',

  },

  

  // Announcement Card Styles

  announcementCard: {

    borderRadius: Math.min(16, staticWidth * 0.04),

    marginBottom: Math.min(16, staticHeight * 0.02),

    marginHorizontal: 2,

    shadowColor: '#3b82f6',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.08,

    shadowRadius: 8,

    elevation: 3,

    overflow: 'hidden',

    borderWidth: 1,

    borderColor: '#dbeafe',

  },

  announcementGradient: {

    backgroundColor: '#EFF6FF',

    padding: Math.min(16, staticWidth * 0.04),

    position: 'relative',

  },

  announcementHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: Math.min(12, staticHeight * 0.015),

  },

  megaphoneIcon: {

    marginRight: Math.min(10, staticWidth * 0.025),

    padding: Math.min(10, staticWidth * 0.025),

    borderRadius: Math.min(12, staticWidth * 0.03),

    backgroundColor: '#DBEAFE',

    shadowColor: '#3b82f6',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.1,

    shadowRadius: 2,

    elevation: 2,

  },

  announcementTitleContainer: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

  },

  announcementTitle: {

    fontSize: Math.min(18, staticWidth * 0.045),

    fontWeight: '800',

    color: '#1e293b',

    flex: 1,

    letterSpacing: -0.3,

  },

  announcementBadge: {

    backgroundColor: '#10B981',

    paddingHorizontal: Math.min(10, staticWidth * 0.025),

    paddingVertical: Math.min(5, staticHeight * 0.006),

    borderRadius: Math.min(16, staticWidth * 0.04),

    marginLeft: Math.min(8, staticWidth * 0.02),

    shadowColor: '#10B981',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.2,

    shadowRadius: 2,

    elevation: 2,

  },

  announcementBadgeText: {

    fontSize: Math.min(9, staticWidth * 0.022),

    fontWeight: '800',

    color: '#ffffff',

    textTransform: 'uppercase',

    letterSpacing: 0.5,

  },

  announcementText: {

    fontSize: Math.min(13, staticWidth * 0.032),

    color: '#64748b',

    lineHeight: Math.min(18, staticWidth * 0.045),

    marginBottom: Math.min(12, staticHeight * 0.015),

    fontWeight: '500',

  },

  announcementFeatures: {

    flexDirection: 'row',

    marginBottom: Math.min(12, staticHeight * 0.015),

    gap: Math.min(10, staticWidth * 0.025),

    flexWrap: 'wrap',

  },

  featureItem: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

    backgroundColor: '#ffffff',

    paddingHorizontal: 12,

    paddingVertical: 8,

    borderRadius: 12,

    borderWidth: 1,

    borderColor: '#E0E7FF',

  },

  featureText: {

    fontSize: 13,

    color: '#475569',

    fontWeight: '600',

  },

  announcementButton: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    backgroundColor: '#3b82f6',

    paddingVertical: Math.min(12, staticHeight * 0.015),

    paddingHorizontal: Math.min(20, staticWidth * 0.05),

    borderRadius: Math.min(10, staticWidth * 0.025),

    shadowColor: '#3b82f6',

    shadowOffset: { width: 0, height: 3 },

    shadowOpacity: 0.25,

    shadowRadius: 6,

    elevation: 4,

    gap: Math.min(6, staticWidth * 0.015),

  },

  announcementButtonText: {

    fontSize: Math.min(14, staticWidth * 0.035),

    fontWeight: '700',

    color: '#ffffff',

    letterSpacing: 0.3,

  },



  // Announcement Modal Styles

  announcementModal: {

    backgroundColor: '#ffffff',

    borderRadius: 24,

    margin: 20,

    maxHeight: staticHeight * 0.85,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 10 },

    shadowOpacity: 0.25,

    shadowRadius: 20,

    elevation: 10,

  },

  announcementModalHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingHorizontal: 24,

    paddingVertical: 20,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  announcementModalTitleContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 12,

  },

  announcementModalTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

  },

  announcementModalContent: {

    flex: 1,

    paddingHorizontal: 24,

  },

  announcementForm: {

    paddingVertical: 20,

  },

  announcementField: {

    marginBottom: 24,

  },

  announcementFieldLabel: {

    fontSize: 14,

    fontWeight: '600',

    color: '#374151',

    marginBottom: 8,

  },

  announcementFieldInput: {

    borderWidth: 1,

    borderColor: '#d1d5db',

    borderRadius: 12,

    paddingHorizontal: 16,

    paddingVertical: 12,

    fontSize: 14,

    color: '#1f2937',

    backgroundColor: '#ffffff',

  },

  announcementMessageInput: {

    height: 120,

    textAlignVertical: 'top',

  },

  announcementSegmentWrap: {

    flexDirection: 'row',

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 4,

    gap: 4,

  },

  announcementSegmentButton: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 12,

    paddingHorizontal: 16,

    borderRadius: 8,

    gap: 8,

  },

  announcementSegmentActive: {

    backgroundColor: '#3b82f6',

    shadowColor: '#3b82f6',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.2,

    shadowRadius: 4,

    elevation: 3,

  },

  announcementSegmentText: {

    fontSize: 14,

    fontWeight: '600',

    color: '#64748b',

  },

  announcementSegmentTextActive: {

    color: '#ffffff',

  },

  announcementClassList: {

    marginTop: 16,

    borderWidth: 1,

    borderColor: '#e5e7eb',

    borderRadius: 12,

    backgroundColor: '#ffffff',

    overflow: 'hidden',

  },

  announcementClassListTitle: {

    fontSize: 14,

    fontWeight: '600',

    color: '#6b7280',

    paddingHorizontal: 16,

    paddingVertical: 12,

    backgroundColor: '#f9fafb',

    borderBottomWidth: 1,

    borderBottomColor: '#f3f4f6',

  },

  announcementClassItem: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingHorizontal: 16,

    paddingVertical: 14,

    borderBottomWidth: 1,

    borderBottomColor: '#f3f4f6',

  },

  announcementClassInfo: {

    flex: 1,

  },

  announcementClassName: {

    fontSize: 15,

    fontWeight: '600',

    color: '#1f2937',

    marginBottom: 2,

  },

  announcementClassYear: {

    fontSize: 14,

    color: '#6b7280',

  },

  announcementCheckbox: {

    width: 20,

    height: 20,

    borderRadius: 4,

    borderWidth: 2,

    borderColor: '#d1d5db',

    backgroundColor: 'transparent',

    justifyContent: 'center',

    alignItems: 'center',

  },

  announcementCheckboxActive: {

    backgroundColor: '#3b82f6',

    borderColor: '#3b82f6',

  },

  announcementModalFooter: {

    flexDirection: 'row',

    paddingHorizontal: 24,

    paddingVertical: 20,

    borderTopWidth: 1,

    borderTopColor: '#f1f5f9',

    gap: 12,

  },

  announcementCancelButton: {

    flex: 1,

    paddingVertical: 14,

    paddingHorizontal: 20,

    borderRadius: 12,

    borderWidth: 1,

    borderColor: '#d1d5db',

    backgroundColor: '#ffffff',

    alignItems: 'center',

    justifyContent: 'center',

  },

  announcementCancelButtonText: {

    fontSize: 14,

    fontWeight: '600',

    color: '#6b7280',

  },

  announcementSendButton: {

    flex: 2,

    paddingVertical: 14,

    paddingHorizontal: 20,

    borderRadius: 12,

    backgroundColor: '#3b82f6',

    alignItems: 'center',

    justifyContent: 'center',

    shadowColor: '#3b82f6',

    shadowOffset: { width: 0, height: 4 },

    shadowOpacity: 0.3,

    shadowRadius: 8,

    elevation: 6,

  },

  announcementSendButtonDisabled: {

    backgroundColor: '#9ca3af',

    shadowOpacity: 0,

    elevation: 0,

  },

  announcementLoadingContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  announcementSendContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  announcementSendButtonText: {

    fontSize: 14,

    fontWeight: '700',

    color: '#ffffff',

  },

  

  // Action Buttons Styles

  actionButtons: {

    marginBottom: Math.min(20, staticHeight * 0.025),
  },

  actionCard: {

    flex: 1,

    borderRadius: Math.min(16, staticWidth * 0.04),

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.06,

    shadowRadius: 8,

    elevation: 3,

    overflow: 'hidden',

  },

  actionGradient1: {

    backgroundColor: '#f0f9ff',

    padding: Math.min(16, staticWidth * 0.04),

    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',

  },

  actionGradient2: {

    backgroundColor: '#f8fafc',

    padding: Math.min(16, staticWidth * 0.04),

    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',

  },

  actionIcon: {

    marginBottom: Math.min(10, staticHeight * 0.012),

  },

  actionText: {

    fontSize: Math.min(13, staticWidth * 0.032),

    fontWeight: '700',

    color: '#1e293b',

  },

  

  

  // Classrooms Section Styles

  classroomsSection: {

    marginBottom: Math.min(100, staticHeight * 0.12), // Space for bottom nav

  },

  classroomsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.min(20, staticHeight * 0.025),
    paddingHorizontal: Math.min(16, staticWidth * 0.04),
  },

  sectionTitle: {
    fontSize: Math.min(16, staticWidth * 0.045),

    fontWeight: '800',

    color: '#1e293b',

  },

  sectionSubtitle: {
    fontSize: Math.min(14, staticWidth * 0.04),
    color: '#64748b',
    fontWeight: '500',
    marginTop: 4,
  },

  classroomBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  classroomBadgeText: {
    color: '#ffffff',
    fontSize: Math.min(14, staticWidth * 0.042),
    fontWeight: '700',
  },

  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Math.min(60, staticHeight * 0.08),
    paddingHorizontal: Math.min(32, staticWidth * 0.08),
  },

  emptyStateTitle: {
    fontSize: Math.min(16, staticWidth * 0.045),
    fontWeight: '700',
    color: '#1e293b',
    marginTop: Math.min(16, staticHeight * 0.02),
    marginBottom: Math.min(8, staticHeight * 0.01),
  },

  emptyStateText: {
    fontSize: Math.min(14, staticWidth * 0.04),
    color: '#64748b',
    textAlign: 'center',
  },

  classHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 8,

  },

  headerActions: {

    flexShrink: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'flex-end',

    gap: 8,

    maxWidth: '60%',

    flexWrap: 'wrap',

  },

  classroomCard: {

    backgroundColor: '#ffffff',

    borderRadius: Math.min(20, staticWidth * 0.05),

    marginHorizontal: Math.min(12, staticWidth * 0.03),

    marginBottom: Math.min(50, staticHeight * 0.050),

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 8 },

    shadowOpacity: 0.12,

    shadowRadius: 16,

    elevation: 8,

    overflow: 'hidden',

    width: staticWidth - Math.min(40, staticWidth * 0.1),

    alignSelf: 'center',

  },

  classroomCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Math.min(20, staticWidth * 0.05),
    paddingBottom: Math.min(16, staticHeight * 0.02),
  },

  classroomHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  classroomIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Math.min(16, staticWidth * 0.04),
  },

  classroomHeaderInfo: {
    flex: 1,
  },

  classroomTitle: {

    fontSize: Math.max(15, Math.min(16, staticWidth * 0.045)),

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: Math.min(2, staticHeight * 0.005),

  },

  classroomSubtitle: {

    fontSize: Math.max(12, Math.min(13, staticWidth * 0.032)),

    color: '#000000',

    fontWeight: '500',

  },

  classroomCardBody: {
    padding: Math.min(20, staticWidth * 0.05),
    paddingTop: Math.min(16, staticHeight * 0.02),
  },

  schoolYearBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    paddingHorizontal: Math.min(12, staticWidth * 0.03),
    paddingVertical: Math.min(6, staticHeight * 0.008),
    borderRadius: Math.min(20, staticWidth * 0.05),
    marginBottom: Math.min(16, staticHeight * 0.02),
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  schoolYearText: {
    fontSize: Math.max(12, Math.min(14, staticWidth * 0.035)),
    color: '#64748b',
    fontWeight: '600',
    marginLeft: Math.min(6, staticWidth * 0.015),
  },

  classroomYear: {

    fontSize: Math.max(11, Math.min(12, staticWidth * 0.03)),

    color: '#64748b',

    fontWeight: '500',

  },

  classMetricsContainer: {

    marginTop: 10,

    padding: 16,

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  classMetricItem: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: 8,

    gap: 8,

  },

  classMetricLabel: {

    fontSize: 13,

    color: '#64748b',

    fontWeight: '500',

    minWidth: 90,

  },

  classMetricValue: {

    fontSize: 13,

    color: '#1e293b',

    fontWeight: '600',

    flex: 1,

  },

  exerciseStatusContainer: {

    marginLeft: 'auto',

  },

  exerciseStatusBadge: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: 8,

    paddingVertical: 4,

    borderRadius: 12,

    gap: 4,

    shadowColor: '#000',

    shadowOffset: {

      width: 0,

      height: 2,

    },

    shadowOpacity: 0.15,

    shadowRadius: 4,

    elevation: 3,

  },

  exerciseStatusText: {

    fontSize: 10,

    color: '#ffffff',

    fontWeight: '700',

    textTransform: 'uppercase',

    letterSpacing: 0.3,

  },

  exerciseHeader: {

    backgroundColor: '#ffffff',

    padding: Math.min(12, staticWidth * 0.03),

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

    borderTopLeftRadius: 12,

    borderTopRightRadius: 12,

  },

  exerciseTitleRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    marginBottom: 0,

    paddingHorizontal: 0,

  },

  exerciseTitle: {

    fontSize: Math.max(14, Math.min(16, staticWidth * 0.045)),

    fontWeight: '700',

    color: '#1e293b',

    flex: 1,

    marginLeft: 0,

  },

  exerciseDetailsContainer: {

    flexDirection: 'row',

    flexWrap: 'wrap',

    marginTop: 8,

    gap: Math.min(6, staticWidth * 0.015),

  },

  exerciseDetailsGrid: {

    flexDirection: 'row',

    flexWrap: 'wrap',

    marginTop: 8,

    gap: Math.min(6, staticWidth * 0.015),

  },

  exerciseDetailItem: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#f8fafc',

    paddingHorizontal: Math.min(8, staticWidth * 0.02),

    paddingVertical: Math.min(4, staticHeight * 0.005),

    borderRadius: 6,

    borderWidth: 1,

    borderColor: '#e2e8f0',

    width: '48%',

    flex: 0,

  },

  exerciseDetailText: {

    fontSize: Math.max(9, Math.min(11, staticWidth * 0.025)),

    color: '#64748b',

    fontWeight: '600',

    marginLeft: 4,

    flex: 1,

  },

  performanceSummaryCard: {

    backgroundColor: '#f8fafc',

    borderRadius: 6,

    padding: Math.min(8, staticWidth * 0.02),

    borderWidth: 1,

    borderColor: '#e2e8f0',

    shadowColor: '#000',

    shadowOffset: {

      width: 0,

      height: 1,

    },

    shadowOpacity: 0.02,

    shadowRadius: 1,

    elevation: 1,

    marginTop: Math.min(4, staticHeight * 0.005),

    marginHorizontal: Math.min(8, staticWidth * 0.02),

    marginBottom: Math.min(4, staticHeight * 0.005),

  },

  performanceSummaryTitle: {

    fontSize: Math.max(11, Math.min(13, staticWidth * 0.03)),

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: Math.min(4, staticHeight * 0.005),

    textAlign: 'center',

  },

  performanceMetricsGrid: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    gap: Math.min(4, staticWidth * 0.01),

  },

  performanceMetric: {

    flex: 1,

    backgroundColor: '#ffffff',

    borderRadius: 6,

    padding: Math.min(6, staticWidth * 0.015),

    borderWidth: 1,

    borderColor: '#e2e8f0',

    alignItems: 'center',

    shadowColor: '#000',

    shadowOffset: {

      width: 0,

      height: 1,

    },

    shadowOpacity: 0.01,

    shadowRadius: 1,

    elevation: 1,

  },

  metricIconContainer: {

    width: 20,

    height: 20,

    borderRadius: 10,

    backgroundColor: '#f0f9ff',

    alignItems: 'center',

    justifyContent: 'center',

    marginBottom: 2,

  },

  oldMetricContent: {

    alignItems: 'center',

  },

  oldMetricLabel: {

    fontSize: Math.max(8, Math.min(10, staticWidth * 0.02)),

    color: '#64748b',

    fontWeight: '600',

    marginBottom: 1,

    textAlign: 'center',

  },

  oldMetricValue: {

    fontSize: Math.max(10, Math.min(11, staticWidth * 0.035)),

    color: '#1e293b',

    fontWeight: '700',

    textAlign: 'center',

  },

  completionProgressContainer: {

    marginBottom: 4,

  },

  completionProgressLabel: {

    fontSize: 10,

    color: '#64748b',

    fontWeight: '600',

    marginBottom: 2,

  },

  completionProgressBar: {

    height: 4,

    backgroundColor: '#e2e8f0',

    borderRadius: 2,

    overflow: 'hidden',

    marginBottom: 1,

  },

  completionProgressFill: {

    height: '100%',

    borderRadius: 4,

  },

  completionProgressText: {

    fontSize: 10,

    color: '#64748b',

    fontWeight: '600',

    textAlign: 'right',

  },

  studentResultsContainer: {

    backgroundColor: '#f8fafc',

    borderRadius: 6,

    padding: Math.min(8, staticWidth * 0.02),

    borderWidth: 1,

    borderColor: '#e2e8f0',

    marginHorizontal: Math.min(8, staticWidth * 0.02),

    marginBottom: Math.min(8, staticHeight * 0.01),

  },

  studentResultsHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 4,

  },

  studentResultsTitle: {

    fontSize: Math.max(11, Math.min(13, staticWidth * 0.03)),

    fontWeight: '700',

    color: '#1e293b',

  },

  exportButton: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#10b981',

    paddingHorizontal: Math.min(16, staticWidth * 0.04),

    paddingVertical: Math.min(8, staticHeight * 0.01),

    borderRadius: 8,

    gap: 6,

    shadowColor: '#000',

    shadowOffset: {

      width: 0,

      height: 2,

    },

    shadowOpacity: 0.1,

    shadowRadius: 4,

    elevation: 2,

  },

  exportButtonText: {

    color: '#ffffff',

    fontSize: Math.max(11, Math.min(13, staticWidth * 0.032)),

    fontWeight: '600',

  },

  moreButton: {

    padding: 8,

    borderRadius: 20,

    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },

  moreMenu: {

    position: 'absolute',

    top: 60,

    right: 16,

    backgroundColor: '#ffffff',

    borderRadius: 16,

    paddingVertical: 8,

    paddingHorizontal: 12,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 6 },

    shadowOpacity: 0.15,

    shadowRadius: 12,

    elevation: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

    zIndex: 10,

    minWidth: 160,

  },

  parentsListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: Math.min(12, staticWidth * 0.03),
    paddingVertical: Math.min(8, staticHeight * 0.01),
    borderRadius: Math.min(8, staticWidth * 0.02),
    marginTop: Math.min(8, staticHeight * 0.01),
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },

  parentsListButtonText: {
    fontSize: Math.max(12, Math.min(14, staticWidth * 0.035)),
    color: '#3b82f6',
    fontWeight: '600',
    marginLeft: Math.min(6, staticWidth * 0.015),
  },

  studentStatsContainer: {
    marginBottom: Math.min(16, staticHeight * 0.02),
  },

  studentStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.min(10, staticHeight * 0.012),
  },

  studentStatsTitle: {
    fontSize: Math.max(14, Math.min(16, staticWidth * 0.04)),
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: Math.min(6, staticWidth * 0.015),
  },

  studentStatsGrid: {
    flexDirection: 'row',
    gap: Math.min(8, staticWidth * 0.02),
  },

  studentStatCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: Math.min(12, staticWidth * 0.03),
    borderRadius: Math.min(12, staticWidth * 0.03),
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },

  studentStatCardTotal: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },

  studentStatCardMale: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },

  studentStatCardFemale: {
    borderColor: '#f59e0b',
    backgroundColor: '#fef3c7',
  },

  studentStatIconContainer: {
    marginBottom: Math.min(6, staticHeight * 0.008),
  },

  studentStatValue: {
    fontSize: Math.max(18, Math.min(22, staticWidth * 0.055)),
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: Math.min(4, staticHeight * 0.005),
    textAlign: 'center',
  },

  studentStatLabel: {
    fontSize: Math.max(10, Math.min(12, staticWidth * 0.03)),
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: Math.max(14, Math.min(16, staticWidth * 0.04)),
  },

  // Performance Metrics Styles
  performanceMetricsContainer: {
    marginBottom: Math.min(20, staticHeight * 0.025),
  },

  performanceMetricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.min(12, staticHeight * 0.015),
  },

  performanceMetricsTitle: {
    fontSize: Math.max(15, Math.min(17, staticWidth * 0.043)),
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: Math.min(8, staticWidth * 0.02),
  },

  metricsCardsContainer: {
    gap: Math.min(12, staticWidth * 0.03),
  },

  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: Math.min(16, staticWidth * 0.04),
    borderRadius: Math.min(16, staticWidth * 0.04),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  metricIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Math.min(12, staticWidth * 0.03),
  },

  metricInfo: {
    flex: 1,
  },

  metricLabel: {
    fontSize: Math.max(12, Math.min(14, staticWidth * 0.035)),
    color: '#64748b',
    fontWeight: '600',
    marginBottom: Math.min(4, staticHeight * 0.005),
  },

  metricValue: {
    fontSize: Math.max(20, Math.min(24, staticWidth * 0.06)),
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: Math.min(2, staticHeight * 0.003),
  },

  metricSubtext: {
    fontSize: Math.max(11, Math.min(13, staticWidth * 0.032)),
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Exercise Statistics Styles
  exerciseStatsContainer: {
    marginBottom: Math.min(20, staticHeight * 0.025),
    backgroundColor: '#f8fafc',
    borderRadius: Math.min(16, staticWidth * 0.04),
    padding: Math.min(20, staticWidth * 0.05),
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  exerciseStatsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: Math.min(8, staticWidth * 0.02),
  },

  exerciseStatItem: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: Math.min(4, staticWidth * 0.01),
  },

  exerciseStatIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Math.min(8, staticHeight * 0.01),
  },

  exerciseStatInfo: {
    alignItems: 'center',
    width: '100%',
  },

  exerciseStatValue: {
    fontSize: Math.max(18, Math.min(22, staticWidth * 0.055)),
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: Math.min(4, staticHeight * 0.005),
  },

  exerciseStatLabel: {
    fontSize: Math.max(10, Math.min(12, staticWidth * 0.03)),
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: Math.max(14, Math.min(16, staticWidth * 0.04)),
    maxWidth: '100%',
  },

  exerciseStatDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#cbd5e1',
    marginHorizontal: Math.min(4, staticWidth * 0.01),
  },

  // View Results Button
  viewResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: Math.min(14, staticHeight * 0.018),
    paddingHorizontal: Math.min(24, staticWidth * 0.06),
    borderRadius: Math.min(12, staticWidth * 0.03),
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  viewResultsButtonText: {
    color: '#ffffff',
    fontSize: Math.max(14, Math.min(16, staticWidth * 0.04)),
    fontWeight: '700',
    marginRight: Math.min(8, staticWidth * 0.02),
  },

  parentListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Math.min(12, staticHeight * 0.015),
    paddingHorizontal: Math.min(16, staticWidth * 0.04),
    backgroundColor: '#ffffff',
    borderRadius: Math.min(8, staticWidth * 0.02),
    marginBottom: Math.min(8, staticHeight * 0.01),
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  parentInfo: {
    flex: 1,
  },

  parentStudentName: {
    fontSize: Math.max(14, Math.min(16, staticWidth * 0.04)),
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: Math.min(4, staticHeight * 0.005),
  },

  parentCode: {
    fontSize: Math.max(12, Math.min(14, staticWidth * 0.035)),
    color: '#64748b',
  },

  clickableParentCode: {
    fontSize: Math.max(12, Math.min(14, staticWidth * 0.035)),
    color: '#3b82f6',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  parentStatusContainer: {
    marginLeft: Math.min(12, staticWidth * 0.03),
  },

  parentStatusBadge: {
    paddingHorizontal: Math.min(8, staticWidth * 0.02),
    paddingVertical: Math.min(4, staticHeight * 0.005),
    borderRadius: Math.min(12, staticWidth * 0.03),
  },

  parentStatusText: {
    fontSize: Math.max(11, Math.min(13, staticWidth * 0.032)),
    fontWeight: '600',
    color: '#ffffff',
  },

  clickableStudentName: {
    fontSize: Math.max(14, Math.min(16, staticWidth * 0.04)),
    fontWeight: '600',
    color: '#3b82f6',
    marginBottom: Math.min(4, staticHeight * 0.005),
    textDecorationLine: 'underline',
  },

  nonClickableStudentName: {
    fontSize: Math.max(14, Math.min(16, staticWidth * 0.04)),
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: Math.min(4, staticHeight * 0.005),
  },

  // Enhanced Parent List Card Styles
  parentListCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Math.min(16, staticWidth * 0.04),
    backgroundColor: '#ffffff',
    borderRadius: Math.min(12, staticWidth * 0.03),
    marginBottom: Math.min(12, staticHeight * 0.015),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  parentCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  parentCardAvatar: {
    width: Math.min(48, staticWidth * 0.12),
    height: Math.min(48, staticWidth * 0.12),
    borderRadius: Math.min(24, staticWidth * 0.06),
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Math.min(12, staticWidth * 0.03),
  },

  parentCardAvatarText: {
    fontSize: Math.max(16, Math.min(18, staticWidth * 0.045)),
    fontWeight: '700',
    color: '#ffffff',
  },

  parentCardInfo: {
    flex: 1,
  },

  parentCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.min(4, staticHeight * 0.005),
  },

  parentCardStudentName: {
    fontSize: Math.max(15, Math.min(16, staticWidth * 0.04)),
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },

  parentCardParentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.min(4, staticHeight * 0.005),
  },

  parentCardParentName: {
    fontSize: Math.max(13, Math.min(14, staticWidth * 0.035)),
    fontWeight: '500',
    color: '#8b5cf6',
    flex: 1,
  },

  parentCardCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  parentCardCode: {
    fontSize: Math.max(12, Math.min(13, staticWidth * 0.032)),
    color: '#64748b',
  },

  parentCardCodeClickable: {
    fontSize: Math.max(12, Math.min(13, staticWidth * 0.032)),
    color: '#3b82f6',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  parentCardRight: {
    marginLeft: Math.min(12, staticWidth * 0.03),
  },

  parentCardStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.min(10, staticWidth * 0.025),
    paddingVertical: Math.min(6, staticHeight * 0.008),
    borderRadius: Math.min(16, staticWidth * 0.04),
  },

  parentCardStatusText: {
    fontSize: Math.max(11, Math.min(12, staticWidth * 0.03)),
    fontWeight: '600',
    color: '#ffffff',
  },

  parentDetailsSection: {
    marginBottom: Math.min(20, staticHeight * 0.025),
    padding: Math.min(16, staticWidth * 0.04),
    backgroundColor: '#f8fafc',
    borderRadius: Math.min(12, staticWidth * 0.03),
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  parentDetailsSectionTitle: {
    fontSize: Math.max(16, Math.min(18, staticWidth * 0.045)),
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: Math.min(12, staticHeight * 0.015),
  },

  parentDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Math.min(8, staticHeight * 0.01),
    paddingVertical: Math.min(4, staticHeight * 0.005),
  },

  parentDetailsLabel: {
    fontSize: Math.max(14, Math.min(16, staticWidth * 0.04)),
    fontWeight: '600',
    color: '#64748b',
    flex: 1,
  },

  parentDetailsValue: {
    fontSize: Math.max(14, Math.min(16, staticWidth * 0.04)),
    fontWeight: '500',
    color: '#1e293b',
    flex: 2,
    textAlign: 'right',
  },

  parentInfoValueContainer: {
    flex: 2,
    alignItems: 'flex-end',
  },

  moreMenuItem: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingVertical: 12,

    paddingHorizontal: 12,

    gap: 12,

    borderRadius: 10,

    marginBottom: 4,

  },

  moreMenuText: {

    color: '#1e293b',

    fontSize: Math.max(13, Math.min(15, staticWidth * 0.038)),

    fontWeight: '600',

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

    marginBottom: 20,

  },

  addStudentBtn: {

    alignSelf: 'auto',

    backgroundColor: '#3b82f6',

    paddingHorizontal: 14,

    paddingVertical: 10,

    borderRadius: 10,

    flexDirection: 'row',

    alignItems: 'center',

  },

  addStudentBtnText: {

    color: '#ffffff',

    fontSize: 13,

    fontWeight: '700',

  },

  closeClassBtn: {

    alignSelf: 'flex-start',

    backgroundColor: '#ef4444',

    paddingHorizontal: 12,

    paddingVertical: 8,

    borderRadius: 8,

    marginBottom: 8,

  },

  closeClassBtnText: {

    color: '#ffffff',

    fontSize: 13,

    fontWeight: '700',

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

    borderRadius: 10,

    padding: 10,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.1,

    shadowRadius: 4,

    elevation: 3,

    borderWidth: 1,

    borderColor: '#f1f5f9',

    height: 80,

  },

  statItem: {

    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',

    paddingHorizontal: 2,

  },

  statValue: {

    fontSize: 16,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 2,

  },

  statLabel: {

    fontSize: 10,

    color: '#64748b',

    fontWeight: '500',

    textAlign: 'center',

    lineHeight: 12,
  },

  statDivider: {

    width: 1,

    backgroundColor: '#e2e8f0',

    marginHorizontal: 4,

  },

  statIconBg: {

    width: 24,

    height: 24,

    borderRadius: 12,

    alignItems: 'center',

    justifyContent: 'center',

    marginBottom: 6,

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

    paddingBottom: Platform.OS === 'ios' ? 32 : 16,

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

    // Active state styling handled by text and icon color

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

  studentTableWrapper: {

    width: '100%',

    marginTop: 8,

  },

  studentTableScrollContent: {

    paddingBottom: 4,

  },

  studentTableContent: {

    paddingRight: 0,

  },

  studentRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'flex-start',

    paddingVertical: 8,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  studentHeaderRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'flex-start',

    paddingVertical: 8,

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

  },

  studentIndex: {

    width: 28,

    color: '#64748b',

    fontWeight: '700',

    textAlign: 'left',

  },

  studentName: {

    flex: 1,

    color: '#111827',

    marginLeft: 6,

  },

  studentCode: {

    color: '#2563eb',

    fontWeight: '600',

  },

  studentActionsWrap: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'flex-end',

    gap: 10,

    width: 40,

    minWidth: 40,

  },

  studentActionsHeader: {

    width: 40,

    alignItems: 'flex-end',

    justifyContent: 'flex-end',

  },

  iconBtn: {

    padding: 6,

    borderRadius: 8,

  },

  statusPillActive: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 4,

    backgroundColor: '#dcfce7',

    paddingHorizontal: 8,

    paddingVertical: 4,

    borderRadius: 16,

    borderWidth: 1,

    borderColor: '#86efac',

  },

  statusPillInactive: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 4,

    backgroundColor: '#f1f5f9',

    paddingHorizontal: 8,

    paddingVertical: 4,

    borderRadius: 16,

    borderWidth: 1,

    borderColor: '#cbd5e1',

  },

  statusText: {

    color: '#111827',

    fontSize: 12,

    fontWeight: '700',

  },

  statusTextActive: {

    color: '#15803d',

    fontSize: 10,

    fontWeight: '700',

  },

  statusTextInactive: {

    color: '#64748b',

    fontSize: 10,

    fontWeight: '700',

  },

  

  // Class Tab Styles

  classTabHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 24,

    paddingHorizontal: 12,

    paddingVertical: 16,

    backgroundColor: '#f8fafc',

    borderRadius: 16,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  classTabTitle: {

    fontSize: 20,

    fontWeight: '800',

    color: '#1e293b',

    marginBottom: 4,

  },

  classTabSubtitle: {

    fontSize: 10,

    color: '#64748b',

    fontWeight: '500',

  },
  
  // Quarter filtering styles
  quarterFilterContainer: {
    marginBottom: 16,
    paddingVertical: 8,
  },
  
  quarterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  
  quarterPillActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  
  quarterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  
  quarterPillTextActive: {
    color: '#ffffff',
  },
  
  quarterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#faf5ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  
  quarterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  
  quarterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6b21a8',
  },
  
  exportQuarterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  
  exportQuarterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },

  emptyStateSubtext: {

    fontSize: 14,

    color: '#cbd5e1',

    fontWeight: '500',

  },

  classSectionHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: 12,

    paddingVertical: 12,

    marginBottom: 12,

    marginTop: 8,

  },

  classSectionBadge: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  classSectionTitle: {

    fontSize: 16,

    fontWeight: '700',

    color: '#1e293b',

  },

  classSectionCount: {

    fontSize: 16,

    fontWeight: '700',

    color: '#64748b',

    backgroundColor: '#f1f5f9',

    paddingHorizontal: 12,

    paddingVertical: 4,

    borderRadius: 12,

  },

  classTabCard: {

    backgroundColor: '#ffffff',

    borderRadius: 14,

    padding: 12,

    marginHorizontal: 8,

    marginBottom: 14,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.08,

    shadowRadius: 12,

    elevation: 4,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  classCardHeader: {

    flexDirection: 'row',

    alignItems: 'flex-start',

    marginBottom: 8,

    gap: 10,

  },

  classIconContainer: {

    width: 42,

    height: 42,

    borderRadius: 12,

    backgroundColor: '#eff6ff',

    justifyContent: 'center',

    alignItems: 'center',

    borderWidth: 1,

    borderColor: '#dbeafe',

  },

  classIconContainerInactive: {

    width: 42,

    height: 42,

    borderRadius: 12,

    backgroundColor: '#f8fafc',

    justifyContent: 'center',

    alignItems: 'center',

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  classStudentCount: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    paddingVertical: 6,

    paddingHorizontal: 10,

    backgroundColor: '#f8fafc',

    borderRadius: 8,

    marginBottom: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  studentCountText: {

    fontSize: 12,

    fontWeight: '600',

    color: '#475569',

  },

  createExerciseButtonHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

    backgroundColor: '#3b82f6',

    paddingHorizontal: 16,

    paddingVertical: 10,

    borderRadius: 12,

    shadowColor: '#3b82f6',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.25,

    shadowRadius: 4,

    elevation: 3,

  },

  exportBtn: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 4,

    backgroundColor: '#ef4444',

    paddingHorizontal: 10,

    paddingVertical: 6,

    borderRadius: 8,

  },

  exportBtnText: {

    color: '#ffffff',

    fontSize: 10,

    fontWeight: '700',

  },

  // Export Menu Styles

  exportMenuBtn: {

    padding: 8,

    borderRadius: 6,

    backgroundColor: '#f8fafc',

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  exportMenuDropdown: {

    position: 'absolute',

    top: 40,

    right: 0,

    backgroundColor: '#ffffff',

    borderRadius: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.1,

    shadowRadius: 8,

    elevation: 5,

    zIndex: 1000,

    minWidth: 140,

  },

  exportMenuItem: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

    paddingHorizontal: 12,

    paddingVertical: 10,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  exportMenuText: {

    fontSize: 14,

    fontWeight: '500',

    color: '#374151',

  },

  // Loading Styles

  loadingContainer: {

    flex: 1,

    justifyContent: 'center',

    alignItems: 'center',

    backgroundColor: '#ffffff',

  },

  loadingText: {

    fontSize: 18,

    color: '#64748b',

    fontWeight: '500',

  },

  // Avatar Image Styles

  avatarImage: {

    width: 64,

    height: 64,

    borderRadius: 32,

    borderWidth: 3,

    borderColor: '#e2e8f0',

  },

  // Modal Styles

  modalOverlay: {

    flex: 1,

    backgroundColor: 'rgba(0,0,0,0.5)',

    justifyContent: 'flex-end',

    alignItems: 'center',

    paddingHorizontal: 0,

  },

  profileModal: {

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

  modalHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: 20,

    paddingVertical: 15,

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

  },

  modalTitle: {

    fontSize: 20,

    fontWeight: 'bold',

    color: '#1e293b',
  },

  closeButton: {

    padding: 5,

  },

  profileContent: {

    maxHeight: 400,

    paddingHorizontal: 20,

  },

  // Profile Picture Section

  profilePictureSection: {

    alignItems: 'center',

    paddingVertical: 20,

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

    marginBottom: 20,

  },

  profilePicture: {

    width: 120,

    height: 120,

    borderRadius: 60,

    borderWidth: 3,

    borderColor: '#e2e8f0',

  },

  profilePicturePlaceholder: {

    width: 120,

    height: 120,

    borderRadius: 60,

    backgroundColor: '#f1f5f9',

    justifyContent: 'center',

    alignItems: 'center',

    borderWidth: 3,

    borderColor: '#e2e8f0',

  },

  changePhotoButton: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#3b82f6',

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 8,

    marginTop: 10,

  },

  changePhotoText: {

    color: '#ffffff',

    fontSize: 12,

    fontWeight: '600',

    marginLeft: 4,

  },

  // Info Section

  infoSection: {

    paddingBottom: 20,

  },

  infoRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingVertical: 12,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  infoLabel: {

    fontSize: 16,

    fontWeight: '600',

    color: '#374151',

    flex: 1,

  },

  infoValue: {

    fontSize: 16,

    color: '#1e293b',

    flex: 2,

    textAlign: 'right',

  },

  infoInput: {

    fontSize: 16,

    color: '#1e293b',

    flex: 2,

    textAlign: 'right',

    borderWidth: 1,

    borderColor: '#d1d5db',

    borderRadius: 6,

    paddingHorizontal: 8,

    paddingVertical: 4,

    backgroundColor: '#f9fafb',

  },

  // Elegant form styles (Add Class modal)

  field: {

    marginBottom: 16,

  },

  fieldLabel: {

    fontSize: 13,

    color: '#475569',

    fontWeight: '700',

    marginBottom: 8,

    textTransform: 'uppercase',

    letterSpacing: 0.5,

  },

  fieldInput: {

    borderWidth: 1,

    borderColor: '#e5e7eb',

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    paddingHorizontal: 14,

    paddingVertical: 12,

    color: '#111827',

    fontSize: 16,

  },

  segmentWrap: {

    flexDirection: 'row',

    backgroundColor: '#f1f5f9',

    borderRadius: 10,

    padding: 4,

    gap: 6,

  },

  segmentButton: {

    flex: 1,

    borderRadius: 8,

    alignItems: 'center',

    paddingVertical: 8,

  },

  segmentActive: {

    backgroundColor: '#2563eb',

  },

  segmentText: {

    color: '#64748b',

    fontSize: 14,

    fontWeight: '700',

  },

  segmentTextActive: {

    color: '#ffffff',

  },

  readonlyBox: {

    marginTop: 10,

    borderWidth: 1,

    borderColor: '#e5e7eb',

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    paddingHorizontal: 14,

    paddingVertical: 12,

    alignItems: 'flex-end',

  },

  readonlyText: {

    color: '#111827',

    fontSize: 16,

  },

  yearButton: {

    borderWidth: 1,

    borderColor: '#e5e7eb',

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    paddingHorizontal: 14,

    paddingVertical: 12,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

  },

  yearButtonText: {

    color: '#111827',

    fontSize: 16,

  },

  yearMenu: {

    marginTop: 8,

    borderWidth: 1,

    borderColor: '#e5e7eb',

    borderRadius: 12,

    backgroundColor: '#ffffff',

    shadowColor: '#000',

    shadowOpacity: 0.1,

    shadowRadius: 10,

    shadowOffset: { width: 0, height: 4 },

    maxHeight: 180,

  },

  yearOption: {

    paddingVertical: 12,

    paddingHorizontal: 14,

  },

  yearOptionSelected: {

    backgroundColor: '#eff6ff',

  },

  yearOptionText: {

    fontSize: 16,

    color: '#111827',

    textAlign: 'right',

  },

  // Modal Actions

  modalActions: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    paddingHorizontal: 20,

    paddingVertical: 15,

    borderTopWidth: 1,

    borderTopColor: '#e2e8f0',

  },

  editProfileButton: {

    flex: 1,

    backgroundColor: '#3b82f6',

    borderRadius: 12,

    paddingVertical: 12,

    alignItems: 'center',

    marginRight: 10,

  },

  editProfileButtonText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },

  closeModalButton: {

    flex: 1,

    backgroundColor: '#6b7280',

    borderRadius: 12,

    paddingVertical: 12,

    alignItems: 'center',

    marginLeft: 10,

  },

  closeModalButtonText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },

  cancelButton: {

    flex: 1,

    backgroundColor: '#ef4444',

    borderRadius: 12,

    paddingVertical: 12,

    alignItems: 'center',

    marginRight: 10,

  },

  cancelButtonText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },

  saveButton: {

    flex: 1,

    backgroundColor: '#10b981',

    borderRadius: 12,

    paddingVertical: 12,

    alignItems: 'center',

    marginLeft: 10,

  },

  saveButtonText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },

  

  // Exercises Library Styles

  exercisesSection: {

    paddingBottom: 140,

  },

  exercisesHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 20,

  },

  exercisesTitle: {

    fontSize: 22,

    fontWeight: '700',

    color: '#1e293b',

  },

  exercisesActions: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  createExerciseButton: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#3b82f6',

    borderRadius: 12,

    paddingVertical: 8,

    paddingHorizontal: 12,

    marginRight: 4,

  },

  createExerciseIcon: {

    width: 20,

    height: 20,

    borderRadius: 10,

    backgroundColor: 'rgba(255, 255, 255, 0.2)',

    justifyContent: 'center',

    alignItems: 'center',

    marginRight: 6,

  },

  createExerciseText: {

    fontSize: 12,

    fontWeight: '600',

    color: '#ffffff',

  },

  refreshButton: {

    padding: Math.min(8, staticWidth * 0.02),

    borderRadius: Math.min(8, staticWidth * 0.02),

    backgroundColor: '#ffffff',

    borderWidth: 1,

    borderColor: '#e2e8f0',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.05,

    shadowRadius: 2,

    elevation: 1,

  },

  searchButton: {

    padding: 8,

    borderRadius: 8,

  },

  moreOptionsButton: {

    padding: 8,

    borderRadius: 8,

  },

  exercisesTabs: {

    flexDirection: 'row',

    marginBottom: 24,

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 4,

  },

  exercisesTab: {

    flex: 1,

    paddingVertical: 10,

    paddingHorizontal: 16,

    borderRadius: 8,

    alignItems: 'center',

  },

  exercisesTabActive: {

    backgroundColor: '#ffffff',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.1,

    shadowRadius: 2,

    elevation: 2,

  },

  exercisesTabText: {

    fontSize: 12,

    color: '#64748b',

    fontWeight: '500',

  },

  exercisesTabTextActive: {

    color: '#1e293b',

    fontWeight: '600',

  },

  exerciseCardsContainer: {

    flex: 1,

    paddingBottom: 20,

  },

  exerciseCard: {

    position: 'relative',

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#ffffff',

    borderRadius: Math.min(12, staticWidth * 0.03),

    padding: Math.min(12, staticWidth * 0.03),

    marginBottom: Math.min(8, staticHeight * 0.01),

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.06,

    shadowRadius: 8,

    elevation: 2,

    borderWidth: 1,

    borderColor: '#f1f5f9',

  },

  exerciseIcon: {

    marginRight: 16,

  },

  exerciseIconBackground: {

    width: 48,

    height: 48,

    borderRadius: 12,

    backgroundColor: '#fef3c7',

    justifyContent: 'center',

    alignItems: 'center',

  },

  exerciseContent: {

    flex: 1,

  },

  exerciseDescription: {

    fontSize: Math.min(12, staticWidth * 0.03),

    color: '#64748b',

    marginBottom: 8,

  },

  exerciseStats: {

    flexDirection: 'row',

    alignItems: 'center',

  },

  exerciseStat: {

    fontSize: 12,

    color: '#64748b',

    fontWeight: '500',

  },

  exerciseStatSeparator: {

    fontSize: 12,

    color: '#64748b',

    marginHorizontal: 8,

  },

  exerciseOptions: {

    padding: 8,

    borderRadius: 8,

  },

  

  // Filter and Search Styles

  filterContainer: {

    marginBottom: 20,
  },

  searchContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    paddingHorizontal: 16,

    paddingVertical: 12,

    marginBottom: 12,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  searchInput: {

    flex: 1,

    fontSize: 16,

    color: '#1e293b',

    marginLeft: 8,

  },

  categoryFilterContainer: {

    marginBottom: 8,

  },

  categoryScrollView: {

    maxHeight: 50,

  },

  categoryScrollContent: {

    paddingHorizontal: 4,

    alignItems: 'center',

    paddingVertical: 4,

  },

  categoryFilterButton: {

    paddingHorizontal: 16,

    paddingVertical: 8,

    borderRadius: 20,

    backgroundColor: '#f1f5f9',

    marginRight: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

    minWidth: 80,

    alignItems: 'center',

  },

  categoryFilterButtonActive: {

    backgroundColor: '#7c3aed',

    borderColor: '#7c3aed',

  },

  categoryFilterText: {

    fontSize: 14,

    fontWeight: '500',

    color: '#64748b',

  },

  categoryFilterTextActive: {

    color: '#ffffff',

  },

  

  // Category Section Styles

  categorySection: {

    marginBottom: 24,

  },

  categoryHeader: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 12,

    paddingHorizontal: 4,

  },

  

  // Exercise Card Content Styles

  exerciseCardContent: {

    flexDirection: 'row',

    alignItems: 'flex-start',

  },

  // Top Right Category Badge

  categoryBadgeTopRight: {

    position: 'absolute',

    top: 12,

    right: 12,

    backgroundColor: '#7c3aed',

    paddingHorizontal: 8,

    paddingVertical: 4,

    borderRadius: 12,

    zIndex: 1,

  },

  // Exercise Title Row Styles (deprecated - keeping for compatibility)

  categoryBadgeText: {

    fontSize: 10,

    fontWeight: '600',

    color: '#ffffff',

  },

  ownerBadge: {

    position: 'absolute',

    top: 8,

    left: 8,

    backgroundColor: '#10b981',

    borderRadius: 12,

    paddingHorizontal: 8,

    paddingVertical: 4,

    zIndex: 1,

  },

  ownerBadgeText: {

    fontSize: 11,

    fontWeight: '600',

    color: '#ffffff',

  },

  

  // Empty State Styles

  emptyState: {

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 40,

    paddingHorizontal: 20,

  },

  

  // Exercise Meta Styles

  exerciseMeta: {

    marginTop: 8,

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

  },

  exerciseCreator: {

    fontSize: 10,

    color: '#6b7280',

    fontWeight: '500',

  },

  exerciseDate: {

    fontSize: 10,

    color: '#9ca3af',

    textAlign: 'right',

  },

  

  // Exercise Actions Styles

  exerciseActions: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  assignButton: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#10b981',

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 6,

  },

  // Bottom assign button styles

  exerciseBottomActions: {

    marginTop: 12,

    alignItems: 'flex-start',

  },

  assignButtonBottom: {

    backgroundColor: '#10b981',

    paddingHorizontal: 12,

    paddingVertical: 8,

    borderRadius: 8,

    flexDirection: 'row',

    alignItems: 'center',

  },

  assignButtonText: {

    color: '#ffffff',

    fontSize: 10,

    fontWeight: '600',

    marginLeft: 4,

  },

  copyButton: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#3b82f6',

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 6,

  },

  copyButtonText: {

    color: '#ffffff',

    fontSize: 12,

    fontWeight: '600',

    marginLeft: 4,

  },

  

  // Quarter Section Styles

  quarterSection: {

    marginBottom: 24,

  },

  oldQuarterHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: 16,

    paddingVertical: 12,

    backgroundColor: '#eff6ff',

    borderRadius: 12,

    marginBottom: 12,

    borderLeftWidth: 4,

    borderLeftColor: '#3b82f6',

  },

  quarterHeaderText: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e40af',

    marginLeft: 8,

    flex: 1,

  },

  quarterBadge: {

    backgroundColor: '#3b82f6',

    paddingHorizontal: 12,

    paddingVertical: 4,

    borderRadius: 12,

  },

  quarterBadgeText: {

    fontSize: 12,

    fontWeight: '600',

    color: '#ffffff',

  },

  

  // Assignment Card Styles

  assignmentCard: {

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

  assignmentHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'flex-start',

    marginBottom: 12,

  },

  assignmentInfo: {

    flex: 1,

  },

  assignmentTitle: {

    fontSize: 16,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 4,

  },

  assignmentClass: {

    fontSize: 14,

    color: '#64748b',

    fontWeight: '500',

  },

  assignmentOptions: {

    flexDirection: 'row',

    gap: 8,

  },

  assignmentActionButton: {

    padding: 8,

    borderRadius: 8,

    backgroundColor: '#f8fafc',

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  

  // Status Toggle Styles

  statusToggleButton: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingVertical: 6,

    paddingHorizontal: 10,

    borderRadius: 6,

    backgroundColor: '#f0fdf4',

    borderWidth: 1,

    borderColor: '#bbf7d0',

    marginRight: 8,

    gap: 4,

  },

  statusToggleButtonClosed: {

    backgroundColor: '#fef2f2',

    borderColor: '#fecaca',

  },

  statusToggleText: {

    fontSize: 12,

    fontWeight: '600',

    color: '#15803d',

  },

  statusToggleTextClosed: {

    color: '#dc2626',

  },

  assignmentDetails: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

  },

  assignmentDetail: {

    flexDirection: 'row',

    alignItems: 'center',

    flex: 1,

  },

  assignmentDetailText: {

    fontSize: 12,

    color: '#64748b',

    marginLeft: 6,

  },



  // Assignment Stats Styles

  assignmentStats: {

    marginVertical: 12,

    paddingVertical: 12,

    borderTopWidth: 1,

    borderBottomWidth: 1,

    borderColor: '#f1f5f9',

  },

  // Assignments Header Styles

  assignmentsHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: Math.min(16, staticWidth * 0.04),

    paddingVertical: Math.min(12, staticHeight * 0.015),

    marginBottom: Math.min(16, staticHeight * 0.02),

    backgroundColor: '#f8fafc',

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

  },

  assignmentsHeaderTitle: {

    fontSize: Math.max(18, Math.min(20, staticWidth * 0.05)),

    fontWeight: '700',

    color: '#1e293b',

  },

  completionStats: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: 8,

    paddingVertical: 8,

    paddingHorizontal: 4,

    borderRadius: 8,

    backgroundColor: '#f8fafc',

  },

  completionIcon: {

    marginRight: 8,

  },

  completionText: {

    fontSize: 14,

    fontWeight: '600',

    color: '#1e293b',

    flex: 1,

  },

  completionBadge: {

    paddingHorizontal: 8,

    paddingVertical: 4,

    borderRadius: 12,

    minWidth: 40,

    alignItems: 'center',

  },

  completionPercentage: {

    fontSize: 12,

    fontWeight: '700',

    color: '#ffffff',

  },

  progressBarContainer: {

    marginTop: 4,

  },

  progressBar: {

    height: 6,

    backgroundColor: '#e2e8f0',

    borderRadius: 3,

    overflow: 'hidden',

  },

  progressBarFill: {

    height: '100%',

    borderRadius: 3,

  },

  timeRemainingDetail: {

    marginTop: 4,

  },



  // Assignment Modal Styles

  assignmentModalContainer: {

    flex: 1,

    backgroundColor: '#ffffff',

  },

  assignmentModalHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  assignmentModalCloseButton: {

    padding: 4,

  },

  assignmentModalTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

  },

  assignmentModalPlaceholder: {

    width: 32,

  },

  assignmentModalContent: {

    flex: 1,

    paddingHorizontal: 20,
  },

  assignmentModalActions: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderTopWidth: 1,

    borderTopColor: '#f1f5f9',

    backgroundColor: '#ffffff',

  },



  // Edit Assignment Modal Styles

  editAssignmentForm: {

    paddingVertical: 20,

  },

  editAssignmentTitle: {

    fontSize: 20,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 24,

  },

  editInputGroup: {

    marginBottom: 20,

  },

  editInputLabel: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 8,

  },

  classDisplay: {

    fontSize: 16,

    color: '#64748b',

    paddingVertical: 12,

    paddingHorizontal: 16,

    backgroundColor: '#f8fafc',

    borderRadius: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  inputNote: {

    fontSize: 12,

    color: '#64748b',

    marginTop: 4,

    fontStyle: 'italic',

  },

  

  // Edit Modal Settings Styles

  editSettingItem: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingVertical: 16,

    paddingHorizontal: 16,

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  editSettingInfo: {

    flex: 1,

    marginRight: 16,

  },

  editSettingTitle: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 4,

  },

  editSettingDescription: {

    fontSize: 14,

    color: '#64748b',

    lineHeight: 20,

  },

  

  // Edit Modal Toggle Styles

  editToggle: {

    width: 48,

    height: 28,

    borderRadius: 14,

    backgroundColor: '#d1d5db',

    padding: 2,

    justifyContent: 'center',

  },

  editToggleActive: {

    backgroundColor: '#3b82f6',

  },

  editToggleThumb: {

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

  editToggleThumbActive: {

    transform: [{ translateX: 20 }],

  },

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

  editAssignmentInfo: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 16,

    marginTop: 8,

  },

  editInfoLabel: {

    fontSize: 14,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 8,

  },

  editInfoRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginBottom: 4,

  },

  editInfoValue: {

    fontSize: 14,

    color: '#64748b',

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



  // Simple Date/Time Input Styles

  simpleDateTimeContainer: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 16,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  simpleDateTimeLabel: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 12,

  },

  simpleDateTimeRow: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: 12,

  },

  simpleDateTimeText: {

    fontSize: 14,

    fontWeight: '500',

    color: '#64748b',

    width: 60,

  },

  simpleDateTimeInput: {

    flex: 1,

    backgroundColor: '#ffffff',

    borderWidth: 1,

    borderColor: '#d1d5db',

    borderRadius: 8,

    paddingHorizontal: 12,

    paddingVertical: 10,

    fontSize: 16,

    color: '#1e293b',

  },



  // Custom Date/Time Picker Modal Styles

  customDateTimeModalOverlay: {

    flex: 1,

    backgroundColor: 'rgba(0,0,0,0.5)',

    justifyContent: 'center',

    alignItems: 'center',

    paddingHorizontal: 20,

    paddingVertical: 40,

  },

  customDateTimeModal: {

    width: '100%',

    maxWidth: 400,

    backgroundColor: '#ffffff',

    borderRadius: 20,

    shadowColor: '#000',

    shadowOpacity: 0.25,

    shadowRadius: 20,

    shadowOffset: { width: 0, height: 10 },

    elevation: 25,

  },

  customDateTimeModalHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  customDateTimeModalTitle: {

    fontSize: 20,

    fontWeight: '700',

    color: '#1e293b',

  },

  customDateTimeModalCloseButton: {

    padding: 4,

  },

  customDateTimeModalContent: {

    paddingHorizontal: 20,

    paddingVertical: 16,

  },

  customDateTimeSection: {

    marginBottom: 24,

  },

  customDateTimeLabel: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 12,

  },

  customDateTimeInputs: {

    flexDirection: 'row',

    justifyContent: 'space-between',

  },

  customDateTimeInputGroup: {

    flex: 1,

    marginHorizontal: 4,

  },

  customDateTimeInputLabel: {

    fontSize: 12,

    fontWeight: '500',

    color: '#64748b',

    marginBottom: 6,

    textAlign: 'center',

  },

  customDateTimeInput: {

    backgroundColor: '#f8fafc',

    borderWidth: 1,

    borderColor: '#e2e8f0',

    borderRadius: 8,

    paddingHorizontal: 12,

    paddingVertical: 10,

    fontSize: 16,

    color: '#1e293b',

    textAlign: 'center',

    fontWeight: '600',

  },

  customDateTimeToggle: {

    backgroundColor: '#3b82f6',

    borderRadius: 8,

    paddingVertical: 10,

    paddingHorizontal: 12,

    alignItems: 'center',

  },

  customDateTimeToggleText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },

  customDateTimePreview: {

    backgroundColor: '#eff6ff',

    borderRadius: 8,

    padding: 12,

    borderLeftWidth: 4,

    borderLeftColor: '#3b82f6',

  },

  customDateTimePreviewLabel: {

    fontSize: 12,

    fontWeight: '600',

    color: '#1e40af',

    marginBottom: 4,

  },

  customDateTimePreviewText: {

    fontSize: 14,

    color: '#1e40af',

    fontWeight: '500',

  },

  customDateTimeModalActions: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderTopWidth: 1,

    borderTopColor: '#f1f5f9',

  },

  customDateTimeCancelButton: {

    flex: 1,

    backgroundColor: '#f1f5f9',

    borderRadius: 12,

    paddingVertical: 12,

    alignItems: 'center',

    marginRight: 8,

  },

  customDateTimeCancelButtonText: {

    color: '#64748b',

    fontSize: 16,

    fontWeight: '600',

  },

  customDateTimeConfirmButton: {

    flex: 1,

    backgroundColor: '#3b82f6',

    borderRadius: 12,

    paddingVertical: 12,

    alignItems: 'center',

    marginLeft: 8,

  },

  customDateTimeConfirmButtonText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },



  // Delete Assignment Modal Styles

  deleteModalOverlay: {

    flex: 1,

    backgroundColor: 'rgba(0,0,0,0.5)',

    justifyContent: 'center',

    alignItems: 'center',

    paddingHorizontal: 20,

  },

  deleteModal: {

    width: '100%',

    maxWidth: 400,

    backgroundColor: '#ffffff',

    borderRadius: 16,

    shadowColor: '#000',

    shadowOpacity: 0.25,

    shadowRadius: 20,

    shadowOffset: { width: 0, height: 10 },

    elevation: 25,

  },

  deleteModalHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  deleteModalTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

    marginLeft: 12,

  },

  deleteModalContent: {

    paddingHorizontal: 20,

    paddingVertical: 16,

  },

  deleteModalText: {

    fontSize: 16,

    color: '#1e293b',

    marginBottom: 16,

    lineHeight: 24,

  },

  deleteAssignmentInfo: {

    backgroundColor: '#f8fafc',

    borderRadius: 8,

    padding: 12,

    marginBottom: 16,

  },

  deleteAssignmentTitle: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 4,

  },

  deleteAssignmentClass: {

    fontSize: 14,

    color: '#64748b',

    marginBottom: 4,

  },

  deleteAssignmentDeadline: {

    fontSize: 14,

    color: '#64748b',
  },

  deleteWarningText: {

    fontSize: 14,

    color: '#ef4444',

    fontStyle: 'italic',

  },

  deleteModalActions: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderTopWidth: 1,

    borderTopColor: '#f1f5f9',

  },

  deleteCancelButton: {

    flex: 1,

    backgroundColor: '#f8fafc',

    borderRadius: 8,

    paddingVertical: 12,

    alignItems: 'center',

    marginRight: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  deleteCancelButtonText: {

    fontSize: 16,

    fontWeight: '600',

    color: '#64748b',

  },

  deleteConfirmButton: {

    flex: 1,

    backgroundColor: '#ef4444',

    borderRadius: 8,

    paddingVertical: 12,

    alignItems: 'center',

    marginLeft: 8,

  },

  deleteConfirmButtonText: {

    fontSize: 16,

    fontWeight: '600',

    color: '#ffffff',

  },

  editCancelButton: {

    flex: 1,

    backgroundColor: '#f8fafc',

    borderRadius: 8,

    paddingVertical: 12,

    alignItems: 'center',

    marginRight: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  editCancelButtonText: {

    fontSize: 16,

    fontWeight: '600',

    color: '#64748b',

  },

  editSaveButton: {

    flex: 1,

    backgroundColor: '#3b82f6',

    borderRadius: 8,

    paddingVertical: 12,

    alignItems: 'center',

    marginLeft: 8,

  },

  editSaveButtonText: {

    fontSize: 16,

    fontWeight: '600',

    color: '#ffffff',

  },

  buttonDisabled: {

    backgroundColor: '#9ca3af',

  },



  // Student Status Modal Styles

  studentStatusModalContainer: {

    flex: 1,

    backgroundColor: '#ffffff',

  },

  studentStatusModalHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  studentStatusModalCloseButton: {

    padding: 4,

  },

  studentStatusModalTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

  },

  studentStatusModalPlaceholder: {

    width: 32,

  },

  studentStatusModalContent: {

    flex: 1,

    paddingHorizontal: 20,

  },

  studentStatusModalActions: {

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderTopWidth: 1,

    borderTopColor: '#f1f5f9',

    backgroundColor: '#ffffff',

  },

  studentStatusCloseButton: {

    backgroundColor: '#3b82f6',

    borderRadius: 8,

    paddingVertical: 12,

    alignItems: 'center',

  },

  studentStatusCloseButtonText: {

    fontSize: 16,

    fontWeight: '600',

    color: '#ffffff',

  },



  // Student Status Content Styles

  studentStatusHeader: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 16,

    marginVertical: 16,

    borderLeftWidth: 4,

    borderLeftColor: '#3b82f6',

  },

  studentStatusAssignmentTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 4,

  },

  studentStatusClass: {

    fontSize: 14,

    color: '#64748b',

    marginBottom: 4,

  },

  studentStatusDeadline: {

    fontSize: 14,

    color: '#64748b',

    fontWeight: '500',

  },

  studentListContainer: {

    marginBottom: 20,

  },

  studentListTitle: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 4,

  },

  studentListSubtitle: {

    fontSize: 12,

    color: '#64748b',

    marginBottom: 12,

    fontStyle: 'italic',

  },

  studentStatusItem: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    backgroundColor: '#ffffff',

    borderRadius: 12,

    padding: 16,

    marginBottom: 8,

    borderWidth: 1,

    borderColor: '#e2e8f0',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.05,

    shadowRadius: 2,

    elevation: 1,

  },

  studentInfo: {

    flexDirection: 'row',

    alignItems: 'center',

    flex: 1,

  },

  studentAvatar: {

    width: 40,

    height: 40,

    borderRadius: 20,

    backgroundColor: '#3b82f6',

    justifyContent: 'center',

    alignItems: 'center',

    marginRight: 12,

  },

  studentAvatarText: {

    fontSize: 16,

    fontWeight: '700',

    color: '#ffffff',

  },

  studentDetails: {

    flex: 1,

  },

  studentStatusName: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 2,

  },

  studentId: {

    fontSize: 12,

    color: '#64748b',

  },

  statusBadge: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 16,

  },

  studentStatusText: {

    fontSize: 12,

    fontWeight: '600',

    color: '#ffffff',

    marginLeft: 4,

  },

  

  // Exercise Results Styles

  resultItem: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 16,

    marginBottom: 12,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  resultHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 8,

  },

  resultTitle: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    flex: 1,

    marginRight: 12,

  },

  resultScore: {

    fontSize: 18,

    fontWeight: '700',

    color: '#059669',

  },

  resultDetails: {

    marginBottom: 12,

  },

  resultDetailText: {

    fontSize: 14,

    color: '#64748b',

    marginBottom: 4,

  },

  resultProgress: {

    marginTop: 8,

  },

  resultProgressBar: {

    height: 6,

    backgroundColor: '#e2e8f0',

    borderRadius: 3,

    overflow: 'hidden',

  },

  resultProgressFill: {

    height: '100%',

    backgroundColor: '#059669',

    borderRadius: 3,

  },

  

  // Enhanced Results Visualization Styles

  resultsOverviewCard: {

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

  resultsOverviewTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 16,

  },

  resultsOverviewStats: {

    flexDirection: 'row',

    justifyContent: 'space-around',

  },

  resultsOverviewStat: {

    alignItems: 'center',

  },

  resultsOverviewStatValue: {

    fontSize: 24,

    fontWeight: '700',

    color: '#3b82f6',

    marginBottom: 4,

  },

  resultsOverviewStatLabel: {

    fontSize: 12,

    color: '#64748b',

    textAlign: 'center',

  },

  classPerformanceSummary: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 16,

    marginBottom: 16,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  classPerformanceItem: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: 8,

  },

  classPerformanceText: {

    fontSize: 14,

    color: '#475569',

    marginLeft: 8,

    fontWeight: '500',

  },

  emptyResultsCard: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 32,

    alignItems: 'center',

    borderWidth: 1,

    borderColor: '#e2e8f0',

    borderStyle: 'dashed',

  },

  emptyResultsText: {

    fontSize: 16,

    fontWeight: '600',

    color: '#64748b',

    marginTop: 12,

    marginBottom: 4,

  },

  emptyResultsSubtext: {

    fontSize: 14,

    color: '#94a3b8',

    textAlign: 'center',

  },

  resultsList: {

    marginTop: 12,

  },

  resultStudentInfo: {

    flex: 1,

  },

  resultStudentName: {

    fontSize: 16,

    fontWeight: '600',

    color: '#1e293b',

    marginBottom: 2,

  },

  resultExerciseTitle: {

    fontSize: 14,

    color: '#64748b',

  },

  resultScoreContainer: {

    alignItems: 'flex-end',

  },

  resultRank: {

    fontSize: 12,

    color: '#64748b',

    marginTop: 2,

    fontWeight: '500',

  },

  resultDetailRow: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: 6,

  },

  

  // Enhanced Results Table Styles

  exerciseResultsSection: {

    marginBottom: 16,

    backgroundColor: '#ffffff',

    borderRadius: 16,

    overflow: 'hidden',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 4 },

    shadowOpacity: 0.08,

    shadowRadius: 12,

    elevation: 4,

    borderWidth: 1,

    borderColor: '#e2e8f0',
  },

  exerciseTableHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#f0f9ff',

    paddingHorizontal: 16,

    paddingVertical: 12,

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

  },

  exerciseTableTitle: {

    fontSize: 16,

    fontWeight: '700',

    color: '#1e40af',

    marginLeft: 8,

    flex: 1,

  },

  resultsTableHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#ffffff',

    paddingHorizontal: Math.min(12, staticWidth * 0.03),

    paddingVertical: Math.min(10, staticHeight * 0.012),

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

    minWidth: staticWidth < 400 ? staticWidth * 1.6 : 'auto',

    borderRadius: 6,

    marginBottom: 4,

    shadowColor: '#000',

    shadowOffset: {

      width: 0,

      height: 1,

    },

    shadowOpacity: 0.05,

    shadowRadius: 2,

    elevation: 1,

  },

  tableHeaderText: {

    fontSize: Math.max(10, Math.min(11, staticWidth * 0.027)),

    fontWeight: '700',

    color: '#374151',

    textAlign: 'center',

  },

  

  sortableHeaderCell: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 4,

  },

  

  activeSort: {

    color: '#3b82f6',

    fontWeight: '700',

  },

  resultsTableRow: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: Math.min(12, staticWidth * 0.03),

    paddingVertical: Math.min(10, staticHeight * 0.012),

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

    minWidth: staticWidth < 400 ? staticWidth * 1.6 : 'auto',

    backgroundColor: '#ffffff',

    marginBottom: 1,

    borderRadius: 4,

    shadowColor: '#000',

    shadowOffset: {

      width: 0,

      height: 0.5,

    },

    shadowOpacity: 0.02,

    shadowRadius: 1,

    elevation: 0.5,

  },

  tableRowText: {

    fontSize: Math.max(10, Math.min(11, staticWidth * 0.027)),

    color: '#1e293b',

    textAlign: 'center',

  },

  studentNameCell: {

    textAlign: 'left',

    fontWeight: '600',

  },

  studentPerformanceBadge: {

    width: 8,

    height: 8,

    borderRadius: 4,

    marginLeft: 8,

  },

  tableScrollContainer: {
    // Removed maxHeight to prevent vertical scrolling
  },
  tableScrollContent: {
    flexGrow: 1,
  },

  resultsTableActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  resultsViewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },

  resultsViewAllBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  tableContainer: {

    minWidth: staticWidth < 400 ? staticWidth * 1.6 : 'auto',

  },

  scoreCell: {

    fontWeight: '700',

  },

  rankCell: {

    fontWeight: '600',

    color: '#64748b',

  },

  

  // Student menu dropdown styles

  studentMenuDropdown: {

    position: 'absolute',

    top: 30,

    right: 0,

    backgroundColor: '#ffffff',

    borderRadius: 8,

    paddingVertical: 4,

    minWidth: 160,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.1,

    shadowRadius: 8,

    elevation: 5,

    borderWidth: 1,

    borderColor: 'rgba(0,0,0,0.1)',

    zIndex: 1000,

  },

  studentMenuItem: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: 12,

    paddingVertical: 10,

  },

  studentMenuItemDanger: {

    borderTopWidth: 1,

    borderTopColor: 'rgba(239, 68, 68, 0.1)',

  },

  studentMenuText: {

    marginLeft: 8,

    fontSize: 14,

    color: '#374151',

    fontWeight: '500',

  },

  studentMenuTextDanger: {

    color: '#ef4444',

  },

  

  // Parent info modal styles

  parentInfoModal: {

    width: '90%',

    maxWidth: 500,

    maxHeight: '85%',

    backgroundColor: '#ffffff',

    borderRadius: 16,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 4 },

    shadowOpacity: 0.25,

    shadowRadius: 20,

    elevation: 25,

  },

  parentInfoHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderBottomWidth: 1,

    borderBottomColor: 'rgba(0,0,0,0.1)',

  },

  parentInfoCloseButton: {

    padding: 4,

  },

  parentInfoTitle: {

    fontSize: 18,

    fontWeight: 'bold',

    color: '#1e293b',

  },

  parentInfoPlaceholder: {

    width: 32,

  },

  parentInfoContent: {

    maxHeight: 400,

    paddingHorizontal: 20,

  },

  parentInfoSection: {

    marginVertical: 16,

  },

  parentInfoSectionTitle: {

    fontSize: 16,

    fontWeight: '600',

    color: '#374151',

    marginBottom: 12,

    borderBottomWidth: 1,

    borderBottomColor: 'rgba(0,0,0,0.1)',

    paddingBottom: 4,

  },

  parentInfoRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'flex-start',

    marginBottom: 8,

    paddingVertical: 4,

  },

  parentInfoLabel: {

    fontSize: 14,

    color: '#64748b',

    fontWeight: '500',

    flex: 1,

  },

  parentInfoValue: {

    fontSize: 14,

    color: '#374151',

    fontWeight: '400',

    flex: 2,

    textAlign: 'right',

  },

  parentInfoCodeValue: {

    fontFamily: 'monospace',

    fontSize: 16,

    fontWeight: 'bold',

    color: '#059669',

    backgroundColor: 'rgba(5, 150, 105, 0.1)',

    paddingHorizontal: 8,

    paddingVertical: 4,

    borderRadius: 4,

  },

  parentInfoStatusCompleted: {

    color: '#059669',

    fontWeight: '600',

  },

  parentInfoStatusPending: {

    color: '#f59e0b',

    fontWeight: '600',

  },

  parentInfoImageContainer: {

    flex: 2,

    alignItems: 'flex-end',

  },

  parentInfoImage: {

    width: 60,

    height: 60,

    borderRadius: 30,

    borderWidth: 2,

    borderColor: 'rgba(0,0,0,0.1)',

  },

  parentInfoPendingContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: 'rgba(245, 158, 11, 0.1)',

    padding: 16,

    borderRadius: 8,

    borderLeftWidth: 4,

    borderLeftColor: '#f59e0b',

  },

  parentInfoPendingText: {

    marginLeft: 12,

    fontSize: 14,

    color: '#92400e',

    lineHeight: 20,

    flex: 1,

  },

  parentInfoActions: {

    flexDirection: 'row',

    justifyContent: 'center',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderTopWidth: 1,

    borderTopColor: 'rgba(0,0,0,0.1)',

  },

  parentInfoCloseActionButton: {

    backgroundColor: '#3b82f6',

    borderRadius: 8,

    paddingHorizontal: 24,

    paddingVertical: 12,

    minWidth: 100,

    alignItems: 'center',

  },

  parentInfoCloseActionButtonText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },

  

  // Student Performance Modal Styles - Full Screen (Updated)

  studentPerformanceFullScreenContainer: {

    flex: 1,

    backgroundColor: '#ffffff',

  },

  studentPerformanceFullScreenHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingHorizontal: 20,

    paddingVertical: 16,

    paddingTop: 50, // Account for status bar

    borderBottomWidth: 1,

    borderBottomColor: '#e2e8f0',

    backgroundColor: '#f8fafc',

  },

  studentPerformanceHeaderContent: {

    flex: 1,

  },

  studentPerformanceFullScreenTitle: {

    fontSize: 20,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 4,

  },

  studentPerformanceStudentName: {

    fontSize: 16,

    fontWeight: '500',

    color: '#6b7280',

  },

  studentPerformanceCloseButton: {

    padding: 8,

    borderRadius: 8,

    backgroundColor: '#f1f5f9',

  },

  studentPerformanceFullScreenContent: {

    flex: 1,

    paddingHorizontal: 20,

    paddingTop: 20,

  },

  studentPerformanceFullScreenLoading: {

    flex: 1,

    justifyContent: 'center',

    alignItems: 'center',

    paddingVertical: 60,

  },

  studentPerformanceLoadingText: {

    fontSize: 16,

    color: '#6b7280',

  },

  studentPerformanceFullScreenNoData: {

    flex: 1,

    justifyContent: 'center',

    alignItems: 'center',

    paddingVertical: 60,

  },

  studentPerformanceNoDataText: {

    fontSize: 16,

    color: '#6b7280',

  },

  studentPerformanceSection: {

    marginBottom: 20,

  },

  studentPerformanceSectionTitle: {

    fontSize: 16,

    fontWeight: '600',

    color: '#374151',

    marginBottom: 12,

  },

  studentPerformanceInfo: {

    backgroundColor: '#f8fafc',

    borderRadius: 8,

    padding: 16,

  },

  studentPerformanceName: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 4,

  },

  studentPerformanceExercise: {

    fontSize: 14,

    color: '#64748b',

  },

  studentPerformanceCard: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 20,

    marginBottom: 20,

  },

  studentPerformanceCardTitle: {

    fontSize: 16,

    fontWeight: '600',

    color: '#374151',

    marginBottom: 16,

  },

  studentPerformanceScoreContainer: {

    alignItems: 'center',

    marginBottom: 20,

  },

  studentPerformanceScoreText: {

    fontSize: 48,

    fontWeight: '700',

    color: '#3b82f6',

    marginBottom: 4,

  },

  studentPerformanceScoreLabel: {

    fontSize: 16,

    fontWeight: '600',

    color: '#374151',

    marginBottom: 4,
  },

  studentPerformanceScoreNote: {

    fontSize: 12,

    color: '#64748b',

    textAlign: 'center',

  },

  studentPerformanceStatsRow: {

    flexDirection: 'row',

    justifyContent: 'space-around',

  },

  studentPerformanceStatItem: {

    alignItems: 'center',

  },

  studentPerformanceStatValue: {

    fontSize: 20,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 4,

  },

  studentPerformanceStatLabel: {

    fontSize: 12,

    color: '#64748b',

    textAlign: 'center',

  },

  studentPerformanceRankingCard: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 20,

    marginBottom: 20,

  },

  studentPerformanceMetrics: {

    marginBottom: 20,

  },

  studentPerformanceMetricItem: {

    marginBottom: 16,

  },

  studentPerformanceMetricLabel: {

    fontSize: 14,

    fontWeight: '600',

    color: '#374151',

    marginBottom: 4,

  },

  studentPerformanceMetricValue: {

    fontSize: 18,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 2,

  },

  studentPerformanceMetricComparison: {

    fontSize: 12,

    color: '#64748b',

  },

  studentPerformanceOverallScore: {

    alignItems: 'center',

    paddingTop: 16,

    borderTopWidth: 1,

    borderTopColor: '#e2e8f0',

  },

  studentPerformanceOverallScoreLabel: {

    fontSize: 14,

    fontWeight: '600',

    color: '#374151',

    marginBottom: 8,

  },

  studentPerformanceOverallScoreValue: {

    fontSize: 24,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 4,

  },

  studentPerformanceLevelText: {

    fontSize: 14,

    fontWeight: '600',

    textTransform: 'capitalize',

  },

  studentPerformanceActions: {

    flexDirection: 'row',

    justifyContent: 'center',

    paddingHorizontal: 20,

    paddingVertical: 16,

    borderTopWidth: 1,

    borderTopColor: '#e2e8f0',

  },

  studentPerformanceCloseActionButton: {

    backgroundColor: '#3b82f6',

    borderRadius: 8,

    paddingHorizontal: 24,

    paddingVertical: 12,

    minWidth: 100,

    alignItems: 'center',

  },

  studentPerformanceCloseActionButtonText: {

    color: '#ffffff',

    fontSize: 16,

    fontWeight: '600',

  },

  

  // Analysis Card Styles

  studentPerformanceAnalysisCard: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 20,

    marginBottom: 20,

  },

  studentPerformanceAnalysisItem: {

    flexDirection: 'row',

    alignItems: 'flex-start',

    marginBottom: 12,

  },

  studentPerformanceAnalysisText: {

    flex: 1,

    fontSize: 14,

    color: '#374151',

    marginLeft: 12,

    lineHeight: 20,

  },

  studentPerformanceTimeAnalysisText: {

    fontSize: 14,

    color: '#374151',

    marginBottom: 8,

    lineHeight: 20,

  },

  studentPerformanceTimeComparison: {

    backgroundColor: '#eff6ff',

    borderRadius: 8,

    padding: 12,

  },

  studentPerformanceTimeComparisonText: {

    fontSize: 12,

    color: '#1e40af',

    fontWeight: '600',

  },

  studentPerformanceEncouragementCard: {

    backgroundColor: '#fef2f2',

    borderRadius: 12,

    padding: 20,

    marginBottom: 20,

    flexDirection: 'row',

    alignItems: 'center',

  },

  studentPerformanceEncouragementText: {

    flex: 1,

    fontSize: 14,

    color: '#dc2626',

    marginLeft: 12,

    fontWeight: '500',

    lineHeight: 20,

  },

  

  // Class Comparison Styles

  studentPerformanceComparisonCard: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 20,

    marginBottom: 20,

  },

  studentPerformanceDisclaimerContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    marginBottom: 16,

    backgroundColor: '#f1f5f9',

    borderRadius: 8,

    padding: 8,

  },

  studentPerformanceDisclaimerText: {

    fontSize: 12,

    color: '#6b7280',

    marginLeft: 8,

    flex: 1,

  },

  studentPerformanceComparisonRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginBottom: 12,

  },

  studentPerformanceComparisonItem: {

    flex: 1,

    alignItems: 'center',

    backgroundColor: '#ffffff',

    borderRadius: 8,

    padding: 12,

    marginHorizontal: 4,

  },

  studentPerformanceComparisonLabel: {

    fontSize: 12,

    color: '#6b7280',

    marginBottom: 4,

    fontWeight: '500',

  },

  studentPerformanceComparisonValue: {

    fontSize: 16,

    color: '#1e293b',

    fontWeight: '700',

  },

  

  // Question Details Styles

  studentPerformanceQuestionDetailsCard: {

    backgroundColor: '#f8fafc',

    borderRadius: 12,

    padding: 20,

    marginBottom: 20,

  },

  studentPerformanceQuestionDetailItem: {

    backgroundColor: '#ffffff',

    borderRadius: 8,

    padding: 16,

    marginBottom: 16,

    borderWidth: 1,

    borderColor: '#e5e7eb',

  },

  studentPerformanceQuestionDetailHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    marginBottom: 12,

  },

  studentPerformanceQuestionNumber: {

    fontSize: 16,

    fontWeight: '700',

    color: '#1e293b',

  },

  studentPerformanceQuestionStatus: {

    paddingHorizontal: 8,

    paddingVertical: 4,

    borderRadius: 4,

  },

  studentPerformanceQuestionStatusText: {

    fontSize: 12,

    fontWeight: '600',

    color: '#ffffff',

  },

  studentPerformanceQuestionInfo: {

    marginBottom: 8,

  },

  studentPerformanceQuestionInfoLabel: {

    fontSize: 12,

    fontWeight: '600',

    color: '#6b7280',

    marginBottom: 2,

  },

  studentPerformanceQuestionInfoValue: {

    fontSize: 14,

    color: '#374151',

    lineHeight: 20,

  },

  studentPerformanceQuestionDetailStats: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginTop: 8,

    paddingTop: 8,

    borderTopWidth: 1,

    borderTopColor: '#e5e7eb',

  },

  studentPerformanceQuestionDetailStat: {

    fontSize: 12,

    fontWeight: '600',

    color: '#6b7280',

  },

  studentPerformanceQuestionMetadata: {

    marginTop: 12,

    paddingTop: 12,

    borderTopWidth: 1,

    borderTopColor: '#e5e7eb',

  },

  studentPerformanceQuestionMetadataTitle: {

    fontSize: 12,

    fontWeight: '600',

    color: '#6b7280',

    marginBottom: 8,

  },

  studentPerformanceQuestionMetadataRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginBottom: 4,

  },

  studentPerformanceQuestionMetadataText: {

    fontSize: 12,

    color: '#374151',

  },

  studentPerformanceQuestionTimeBreakdown: {

    marginTop: 12,

    paddingTop: 12,

    borderTopWidth: 1,

    borderTopColor: '#e5e7eb',

  },

  studentPerformanceQuestionTimeBreakdownTitle: {

    fontSize: 12,

    fontWeight: '600',

    color: '#6b7280',

    marginBottom: 8,

  },

  studentPerformanceQuestionTimeBreakdownRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginBottom: 4,

  },

  studentPerformanceQuestionTimeBreakdownText: {

    fontSize: 12,

    color: '#374151',

  },

  studentPerformanceQuestionClassAverages: {

    marginTop: 12,

    paddingTop: 12,

    borderTopWidth: 1,

    borderTopColor: '#e5e7eb',

    backgroundColor: '#f1f5f9',

    borderRadius: 6,

    padding: 8,

  },

  studentPerformanceQuestionClassAveragesTitle: {

    fontSize: 12,

    fontWeight: '600',

    color: '#6b7280',

    marginBottom: 8,

  },

  studentPerformanceQuestionClassAveragesRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

  },

  studentPerformanceQuestionClassAveragesText: {

    fontSize: 12,

    color: '#374151',

    fontWeight: '500',

  },

  // Custom Alert Styles

  alertOverlay: {

    flex: 1,

    backgroundColor: 'rgba(0, 0, 0, 0.5)',

    justifyContent: 'center',

    alignItems: 'center',

    paddingHorizontal: 20,

  },

  alertContainer: {

    backgroundColor: '#ffffff',

    borderRadius: 12,

    padding: 0,

    minWidth: 280,

    maxWidth: 350,

    shadowColor: '#000',

    shadowOffset: {

      width: 0,

      height: 4,

    },

    shadowOpacity: 0.25,

    shadowRadius: 8,

    elevation: 8,

  },

  alertContent: {

    padding: 20,

  },

  alertTitle: {

    fontSize: 18,

    fontWeight: '600',

    color: '#1f2937',

    marginBottom: 6,

    textAlign: 'center',

  },

  alertMessage: {

    fontSize: 15,

    color: '#6b7280',

    lineHeight: 20,

    textAlign: 'center',

    marginBottom: 20,

  },

  alertButtons: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    gap: 8,

    flexWrap: 'wrap',

  },

  alertButton: {

    flex: 1,

    paddingVertical: 12,

    paddingHorizontal: 16,

    borderRadius: 8,

    backgroundColor: '#3b82f6',

    alignItems: 'center',

    minWidth: 0,

  },

  alertButtonSingle: {

    width: '100%',

    flex: 1,

  },

  alertButtonsThree: {

    flexDirection: 'column',

    gap: 8,

  },

  alertButtonThree: {

    flex: 0,

    width: '100%',

  },

  alertButtonsFour: {

    flexDirection: 'column',

    gap: 8,

  },

  alertButtonFour: {

    flex: 0,

    width: '100%',
  },

  alertButtonCancel: {

    backgroundColor: '#f3f4f6',

  },

  alertButtonDestructive: {

    backgroundColor: '#ef4444',

  },

  alertButtonText: {

    fontSize: 16,

    fontWeight: '600',

    color: '#ffffff',

  },

  alertButtonTextCancel: {

    color: '#374151',

  },

  alertButtonTextDestructive: {

    color: '#ffffff',

  },

  

  // Floating Customer Service Button Styles

  floatingReportButton: {

    position: 'absolute',

    top: 0,
    left: 0,
    width: 60,
    height: 56,
    zIndex: 1000,
  },
  floatingReportButtonInner: {
    width: 60,

    height: 56,

    borderRadius: 28,

    backgroundColor: '#3b82f6',

    justifyContent: 'center',

    alignItems: 'center',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 4 },

    shadowOpacity: 0.25,

    shadowRadius: 12,

    elevation: 10,

    borderWidth: 3,

    borderColor: '#ffffff',

  },

  

  // Technical Report Modal Styles

  techReportModal: {

    backgroundColor: '#ffffff',

    borderTopLeftRadius: 32,

    borderTopRightRadius: 32,

    width: '100%',

    maxHeight: '95%',

    minHeight: '80%',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: -8 },

    shadowOpacity: 0.25,

    shadowRadius: 24,

    elevation: 16,

  },

  techReportModalHeader: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: 28,

    paddingVertical: 24,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  techReportModalTitleContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 10,

  },

  techReportModalTitle: {

    fontSize: 20,

    fontWeight: '800',

    color: '#1e293b',

    letterSpacing: -0.3,

  },

  techReportModalContent: {

    flex: 1,

  },

  techReportForm: {

    paddingHorizontal: 28,

    paddingVertical: 20,

    gap: 20,

  },

  techReportHint: {

    fontSize: 14,

    color: '#64748b',

    lineHeight: 20,

    backgroundColor: '#f8fafc',

    padding: 12,

    borderRadius: 12,

  },

  techReportField: {

    gap: 8,

  },

  techReportFieldLabel: {

    fontSize: 14,

    fontWeight: '700',

    color: '#64748b',

  },

  techReportFieldHint: {

    fontSize: 12,

    color: '#94a3b8',

    marginBottom: 8,

  },

  techReportFieldInput: {

    backgroundColor: '#f8fafc',

    borderRadius: 14,

    paddingHorizontal: 16,

    paddingVertical: 12,

    fontSize: 15,

    color: '#0f172a',

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  techReportMessageInput: {

    height: 140,

  },

  screenshotsPreviewContainer: {

    marginVertical: 12,

  },

  screenshotPreviewWrapper: {

    marginRight: 12,

    position: 'relative',

  },

  screenshotPreview: {

    width: 100,

    height: 100,

    borderRadius: 12,

    backgroundColor: '#f1f5f9',

  },

  removeScreenshotButton: {

    position: 'absolute',

    top: -8,

    right: -8,

    backgroundColor: '#ef4444',

    borderRadius: 12,

    width: 24,

    height: 24,

    justifyContent: 'center',

    alignItems: 'center',

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.2,

    shadowRadius: 4,

    elevation: 4,

  },

  screenshotButtons: {

    flexDirection: 'row',

    gap: 12,

  },

  screenshotButton: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 8,

    backgroundColor: '#f8fafc',

    paddingVertical: 12,

    paddingHorizontal: 16,

    borderRadius: 12,

    borderWidth: 1,

    borderColor: '#cbd5e1',

  },

  screenshotButtonText: {

    fontSize: 13,

    fontWeight: '600',

    color: '#3b82f6',

  },

  techReportModalFooter: {

    flexDirection: 'row',

    gap: 12,

    paddingHorizontal: 24,

    paddingBottom: 48,

    paddingTop: 12,

  },

  techReportCancelButton: {

    flex: 1,

    borderRadius: 14,

    paddingVertical: 14,

    alignItems: 'center',

    justifyContent: 'center',

    backgroundColor: '#f1f5f9',

  },

  techReportCancelButtonText: {

    color: '#0f172a',

    fontWeight: '700',

    fontSize: 15,

  },

  techReportSubmitButton: {

    flex: 1,

    borderRadius: 14,

    paddingVertical: 14,

    alignItems: 'center',

    justifyContent: 'center',

    backgroundColor: '#3b82f6',

  },

  techReportSubmitButtonDisabled: {

    opacity: 0.6,

  },

  techReportLoadingContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  techReportSubmitContainer: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  techReportSubmitButtonText: {

    color: '#ffffff',

    fontWeight: '700',

    fontSize: 15,

  },

  // Class Statistics Styles
  classStatisticsSection: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  classStatisticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#8b5cf6',
  },

  classStatisticsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },

  classStatisticsContent: {
    gap: 16,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  statCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },

  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  classStatLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },

  classStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },

  statSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
  },

  statsSection: {
    marginTop: 12,
  },

  statsSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 12,
    paddingLeft: 4,
  },

  performanceDistribution: {
    gap: 12,
  },

  distributionItem: {
    marginBottom: 8,
  },

  distributionBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
    minWidth: 2,
  },

  distributionLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  distributionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  distributionText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },

  distributionCount: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },

  // Results Tab - Compact Mobile-Friendly Styles
  resultsClassCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },

  resultsClassHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  resultsClassIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  resultsClassInfo: {
    flex: 1,
  },

  resultsClassName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 3,
  },

  resultsClassMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  resultsClassMetaText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
  },

  resultsClassMetaDivider: {
    width: 1,
    height: 10,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 4,
  },

  resultsQuarterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#faf5ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },

  resultsQuarterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  resultsQuarterTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7c3aed',
  },

  resultsExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },

  resultsExportBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
  },

  resultsExerciseCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  resultsExerciseHeader: {
    marginBottom: 8,
  },

  resultsExerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },

  resultsExerciseTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },

  resultsExerciseStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },

  resultsExerciseStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
  },

  resultsExerciseDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },

  resultsExerciseDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },

  resultsExerciseDetailText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },

  resultsStudentTable: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  resultsTableSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },

  resultsTableTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },

  resultsStatsSection: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  resultsStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#8b5cf6',
  },

  resultsStatsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },

  resultsStatsContent: {
    gap: 10,
  },

  resultsStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  statsToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginTop: 8,
  },

  statsToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
  },

  resultsStatCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  resultsStatLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
  },

  resultsStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },

  resultsStatSubtext: {
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 2,
  },

  resultsStatsSubsection: {
    marginTop: 8,
  },

  resultsStatsSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },

  resultsDistribution: {
    gap: 8,
  },

  resultsDistItem: {
    marginBottom: 6,
  },

  resultsDistBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
    minWidth: 2,
  },

  resultsDistLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  resultsDistLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  resultsDistDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  resultsDistText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },

  resultsDistCount: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },

  // Exercise Result Modal Styles
  exerciseResultIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },

  exerciseResultIdText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
    marginLeft: 4,
  },

  exerciseResultCloseButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  exerciseResultInfoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  exerciseResultInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  exerciseResultInfoLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    width: 100,
  },

  exerciseResultInfoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
    flex: 1,
  },

  exerciseResultSubmittedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  exerciseResultOnTimeTag: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },

  exerciseResultOnTimeText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
  },

  exerciseResultStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  exerciseResultStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },

  exerciseResultSummaryCards: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },

  exerciseResultSummaryCard: {
    flex: 1,
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },

  exerciseResultSummaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 4,
  },

  exerciseResultSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },

  exerciseResultSummarySubtext: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'center',
  },

  exerciseResultHistorySection: {
    marginBottom: 16,
  },

  exerciseResultHistoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },

  exerciseResultQuestionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },

  exerciseResultQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  exerciseResultQuestionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  exerciseResultQuestionNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },

  exerciseResultQuestionType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },

  exerciseResultQuestionStats: {
    flexDirection: 'row',
    gap: 12,
  },

  exerciseResultQuestionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  exerciseResultQuestionStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  exerciseResultQuestionText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
    marginBottom: 12,
  },

  exerciseResultAttemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  exerciseResultAttemptIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  exerciseResultAttemptText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },

  exerciseResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  exerciseResultHeaderContent: {
    flex: 1,
  },

  exerciseResultTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },

  exerciseResultIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },

  exerciseResultBottomActions: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },

  exerciseResultDeleteButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },

  exerciseResultDeleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Item Analysis Styles
  noDataContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginVertical: 8,
  },

  noDataText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },

  itemAnalysisCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  itemAnalysisHeader: {
    marginBottom: 12,
  },

  itemAnalysisTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },

  // New styles for the updated Item Analysis UI
  itemAnalysisNumberBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },

  itemAnalysisNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  itemAnalysisTypeBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },

  itemAnalysisTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },

  itemAnalysisDifficultyBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  itemAnalysisDifficultyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  itemAnalysisTimeBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  itemAnalysisTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  itemAnalysisAttemptsBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  itemAnalysisAttemptsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  itemAnalysisQuestionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 20,
  },

  itemAnalysisAnswerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  itemAnalysisCheckIcon: {
    marginRight: 4,
  },

  itemAnalysisNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginRight: 8,
  },


  itemAnalysisTable: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    overflow: 'hidden',
  },

  itemAnalysisTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  itemAnalysisTableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    flex: 1,
  },

  itemAnalysisTableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center',
  },

  itemAnalysisCorrectRow: {
    backgroundColor: '#f0fdf4',
  },

  itemAnalysisAnswerCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },

  itemAnalysisAnswerText: {
    fontSize: 13,
    color: '#1e293b',
    flex: 1,
  },

  itemAnalysisCorrectText: {
    color: '#059669',
    fontWeight: '600',
  },

  itemAnalysisCorrectIcon: {
    marginLeft: 4,
  },

  itemAnalysisFrequencyText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },

  itemAnalysisPercentageText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },


  itemAnalysisInstruction: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 20,
  },

  itemAnalysisMetrics: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },

  itemAnalysisMetricCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    minWidth: 80,
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  itemAnalysisMetricLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },

  itemAnalysisMetricValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '700',
    marginTop: 2,
  },

  itemAnalysisPercentageHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },

  itemAnalysisPercentageCell: {
    flex: 1,
    alignItems: 'center',
  },

  itemAnalysisFrequencyCell: {
    flex: 1,
    alignItems: 'center',
  },

  itemAnalysisTotalRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },

  itemAnalysisTotalText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
    textAlign: 'center',
  },

  // Detailed Statistics Modal Styles
  detailedStatsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    padding: 0,
  },
  
  detailedStatsModalPanelContainer: {
    width: '100%',
    height: '100%',
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  
  detailedStatsModalPanel: {
    width: '100%',
    height: '100%',
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 0,
    overflow: 'hidden',
  },

  detailedStatsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  detailedStatsModalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  detailedStatsModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 8,
  },

  detailedStatsCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailedStatsTopSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 4,
  },

  detailedStatsExerciseIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },

  detailedStatsExerciseIdText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
    marginLeft: 4,
  },

  detailedStatsExportButtonMain: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  detailedStatsExportButtonMainText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },

  detailedStatsModalContent: {
    maxHeight: '100%',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    backgroundColor: '#f8fafc',
  },

  detailedStatsLoadingContainer: {
    minHeight: 200,
    maxHeight: 400,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#f8fafc',
  },

  detailedStatsLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },

  detailedStatsErrorContainer: {
    minHeight: 200,
    maxHeight: 400,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    backgroundColor: '#f8fafc',
  },

  detailedStatsErrorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#1e293b',
    fontWeight: '700',
    textAlign: 'center',
  },

  detailedStatsErrorSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },

  detailedStatsRetryButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  detailedStatsRetryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  detailedStatsItemAnalysisSection: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },

  detailedStatsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },

  detailedStatsItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  detailedStatsItemHeader: {
    marginBottom: 12,
  },

  detailedStatsItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },

  detailedStatsItemNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginRight: 8,
  },

  detailedStatsItemTypeBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },

  detailedStatsItemTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730a3',
  },

  detailedStatsItemTimeRow: {
    marginTop: 4,
  },

  detailedStatsItemTimeText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  detailedStatsItemQuestionText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
    marginBottom: 12,
  },

  detailedStatsItemTable: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    overflow: 'hidden',
  },

  detailedStatsItemTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  detailedStatsItemTableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },

  detailedStatsItemTableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'flex-start',
    minHeight: 44,
  },

  detailedStatsItemCorrectRow: {
    backgroundColor: '#f0fdf4',
  },

  detailedStatsItemAnswerCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 8,
  },

  detailedStatsItemFrequencyCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailedStatsItemPercentageCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailedStatsItemAnswerText: {
    fontSize: 12,
    color: '#1e293b',
    flex: 1,
    lineHeight: 16,
    fontFamily: 'monospace',
  },

  detailedStatsItemCorrectText: {
    color: '#059669',
    fontWeight: '600',
  },

  detailedStatsItemCorrectIcon: {
    marginLeft: 4,
  },

  detailedStatsItemFrequencyText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },

  detailedStatsItemPercentageText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },

  detailedStatsItemTotalRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },

  detailedStatsItemTotalText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
    textAlign: 'center',
  },

  // Response Analysis Card Styles (matching the provided design)
  responseAnalysisCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  responseAnalysisHeader: {
    marginBottom: 16,
  },

  responseAnalysisTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },

  responseAnalysisNumberBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },

  responseAnalysisNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },

  responseAnalysisTypeBadge: {
    backgroundColor: '#e0e7ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  responseAnalysisTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730a3',
  },

  responseAnalysisDifficultyBadge: {
    backgroundColor: '#e0e7ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  responseAnalysisDifficultyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730a3',
  },

  responseAnalysisTimeBadge: {
    backgroundColor: '#e0e7ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  responseAnalysisTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730a3',
  },

  responseAnalysisAttemptsBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  responseAnalysisAttemptsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3730a3',
  },

  responseAnalysisInstruction: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
    lineHeight: 20,
  },

  responseAnalysisTable: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
  },

  responseAnalysisTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },

  responseAnalysisTableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'right',
  },

  responseAnalysisTableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  responseAnalysisCorrectRow: {
    backgroundColor: '#f0fdf4',
  },

  responseAnalysisAnswerCell: {
    flex: 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  responseAnalysisFrequencyCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  responseAnalysisPercentageCell: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  responseAnalysisPercentageHeaderCell: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  responseAnalysisAnswerText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500',
  },

  responseAnalysisCorrectText: {
    color: '#059669',
    fontWeight: '600',
  },

  responseAnalysisFrequencyText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },

  responseAnalysisPercentageText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'right',
  },

  responseAnalysisTotalRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },

  responseAnalysisTotalText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
  },

  detailedStatsClassStatsSection: {
    marginTop: 24,
    marginBottom: 0,
  },

  // Top row styles for MPS and Pass Rate
  detailedStatsTopRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },

  detailedStatsTopCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  detailedStatsTopLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 8,
    marginBottom: 4,
  },

  detailedStatsTopValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },

  detailedStatsTopSubtext: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },

  detailedStatsSubsection: {
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },

  detailedStatsSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },

  detailedStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Mode card that spans full width
  detailedStatsModeCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
    width: '100%',
  },

  detailedStatsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    minWidth: '30%',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  detailedStatsLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
  },

  detailedStatsValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },

  detailedStatsSubtext: {
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 2,
  },

  detailedStatsDistribution: {
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
  },

  detailedStatsDistItem: {
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },

  detailedStatsDistBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
    minWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },

  detailedStatsDistLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  detailedStatsDistLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  detailedStatsDistDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  detailedStatsDistText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },

  detailedStatsDistCount: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },

  // Line Chart Styles
  timeChartContainer: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
  },

  lineChartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },

  lineChartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  lineChartLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  lineChartLegendText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },

  lineChartMainContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },

  lineChartYAxisContainer: {
    width: 50,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },

  lineChartAxisLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },

  lineChartYAxis: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  lineChartYAxisValue: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '600',
  },

  lineChartContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  lineChartArea: {
    position: 'relative',
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#cbd5e1',
  },

  lineChartGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#e2e8f0',
  },

  lineChartLineContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  lineChartSegment: {
    position: 'absolute',
    height: 3,
    transformOrigin: 'left center',
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
    borderBottomLeftRadius: 1.5,
    borderBottomRightRadius: 1.5,
  },

  lineChartSimpleBar: {
    position: 'absolute',
    height: 3,
    marginTop: -1.5,
    borderRadius: 1.5,
  },

  lineChartConnectingLine: {
    position: 'absolute',
    transformOrigin: 'left center',
    borderRadius: 2,
  },

  lineChartPoint: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    marginTop: -5,
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },

  lineChartPointLabel: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '700',
    color: '#374151',
    top: -20,
    left: '50%',
    transform: [{ translateX: -15 }],
    minWidth: 30,
    textAlign: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },

  lineChartXLabels: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 20,
  },

  lineChartXLabel: {
    position: 'absolute',
    fontSize: 9,
    color: '#475569',
    fontWeight: '600',
    transform: [{ translateX: -5 }],
  },

  lineChartXAxisContainer: {
    alignItems: 'center',
    marginTop: 24,
  },

  svgChart: {
    alignSelf: 'center',
  },

});