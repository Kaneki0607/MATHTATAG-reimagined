import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import * as FileSystem from 'expo-file-system/legacy';

import * as ImagePicker from 'expo-image-picker';

import * as Print from 'expo-print';

import { useRouter } from 'expo-router';

import * as Sharing from 'expo-sharing';

import { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,

  Animated,
  Dimensions,

  Image,

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

import * as XLSX from 'xlsx';

import { AssignExerciseForm } from '../components/AssignExerciseForm';

import { AssignedExercise, useExercises } from '../hooks/useExercises';

import { onAuthChange, signOutUser } from '../lib/firebase-auth';

import { deleteData, pushData, readData, updateData, writeData } from '../lib/firebase-database';

import { logError, logErrorWithStack } from '../lib/error-logger';
import { uploadFile } from '../lib/firebase-storage';



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

  const [annAllClasses, setAnnAllClasses] = useState(true);

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
  
  // PanResponder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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
  
  const [closingClassId, setClosingClassId] = useState<string | null>(null);

  // Add Student state

  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  const [selectedClassForStudent, setSelectedClassForStudent] = useState<{ id: string; name: string } | null>(null);

  const [studentNickname, setStudentNickname] = useState('');

  const [studentGender, setStudentGender] = useState<'male' | 'female'>('male');

  const [savingStudent, setSavingStudent] = useState(false);

  

  // Student menu and parent info state

  const [studentMenuVisible, setStudentMenuVisible] = useState<string | null>(null);

  const [showParentInfoModal, setShowParentInfoModal] = useState(false);

  const [selectedParentInfo, setSelectedParentInfo] = useState<any>(null);

  

  // Results sorting state

  const [resultsSortBy, setResultsSortBy] = useState<'attempts' | 'time'>('attempts');

  const [resultsSortOrder, setResultsSortOrder] = useState<'asc' | 'desc'>('asc');

  // List modal state

  const [showListModal, setShowListModal] = useState(false);

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

  const [studentPerformanceData, setStudentPerformanceData] = useState<any>(null);

  const [loadingStudentPerformance, setLoadingStudentPerformance] = useState(false);

  const [geminiAnalysis, setGeminiAnalysis] = useState<any>(null);

  const [classAverages, setClassAverages] = useState<any>(null);



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

    const classStudents = studentsByClass[assignment.classId] || [];

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

        // Try Firebase parent ID match (new format)

        if (result.parentId === student.parentId) return true;

        

        // Try studentId match (if available in result)

        if (result.studentId === student.studentId) return true;

        

        // Try login code match (old format - backward compatibility)

        const parentData = parentsById[student.parentId];

        if (parentData && parentData.loginCode && result.parentId === parentData.loginCode) {

          return true;

        }

        

        return false;

      });

      

      if (matchingStudent) {

        completedStudentIds.add(matchingStudent.studentId);

      }

    });

    

    const completedCount = completedStudentIds.size;

    

    

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

    if (!student) return 'pending';

    

    // Check for exercise results using both Firebase parent ID and login code (for backward compatibility)

    const studentResult = classResults.find((result: any) => {

      if (result.exerciseId !== assignment.exerciseId) return false;

      

      // Try to match by Firebase parent ID (new format)

      if (result.parentId === student.parentId) return true;

      

      // Try to match by studentId directly (if available in result)

      if (result.studentId === studentId) return true;

      

      // Try to match by login code (old format - backward compatibility)

      // This requires resolving the student's parent to their login code

      const parentData = parentsById[student.parentId];

      if (parentData && parentData.loginCode && result.parentId === parentData.loginCode) {

        return true;

      }

      

      return false;

    });

    

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

      const { data } = await readData('/sections');

      const list = Object.entries(data || {})

        .map(([id, v]: any) => ({ id, ...(v || {}) }))

        .filter((s: any) => s.teacherId === teacherId)

        .map((s: any) => ({

          id: s.id,

          name: s.name ?? 'Untitled',

          schoolYear: s.schoolYear,

          schoolName: s.schoolName,

          status: s.status ?? 'active',

        }));

      setTeacherClasses(list);

      setActiveClasses(list.filter((c) => c.status !== 'inactive'));

      // After classes load, refresh related data

      await Promise.all([

        loadStudentsAndParents(list.map((c) => c.id)),

        loadAssignments(list.map((c) => c.id)),

        loadClassAnalytics(list.map((c) => c.id)),

      ]);

    } catch (e) {

      // ignore

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

        const r = { resultId, ...(result || {}) };

        

        // Find the classId for this result using parentId

        const classId = r.parentId ? parentToClassMap[r.parentId] : null;

        

        

        if (classId && classIds.includes(classId)) {

          if (!resultsByClass[classId]) resultsByClass[classId] = new Set();

          if (!resultsByClassArray[classId]) resultsByClassArray[classId] = [];

          resultsByClass[classId].add(r.exerciseId);

          resultsByClassArray[classId].push(r);

        }

      });

      

      // Update stats with actual completion data from ExerciseResults

      Object.entries(resultsByClass).forEach(([classId, completedExerciseIds]) => {

        if (stats[classId]) {

          stats[classId].completed = completedExerciseIds.size;

          stats[classId].pending = Math.max(0, stats[classId].total - completedExerciseIds.size);

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

      const { data: exerciseResults } = await readData('/exerciseResults');

      

      const map: Record<string, any> = {};

      

      // Process each class

      for (const classId of classIds) {

        const classAnalytics = analyticsData?.[classId] || {};

        

        // Calculate average attempts and time from exercise results

        if (exerciseResults) {

          const classResults = Object.values(exerciseResults).filter((result: any) => 

            result.classId === classId

          );

          

          if (classResults.length > 0) {

            let totalAttempts = 0;

            let totalTime = 0;

            let totalQuestions = 0;

            

            classResults.forEach((result: any) => {

              if (result.questionResults) {

                result.questionResults.forEach((q: any) => {

                  totalAttempts += q.attempts || 1;

                  totalTime += q.timeSpent || 0;

                  totalQuestions++;

                });

              }

            });

            

            if (totalQuestions > 0) {

              classAnalytics.averageAttempts = totalAttempts / totalQuestions;

              classAnalytics.averageTime = totalTime / classResults.length; // Average time per exercise

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



  const handleAssignExercise = async (classIds: string[], deadline: string, acceptLateSubmissions: boolean, quarter: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4') => {

    try {

      await assignExercise(

        selectedExerciseForAssign.id, 

        classIds, 

        deadline, 

        currentUserId!, 

        acceptLateSubmissions, 

        'open', // Default to open status

        quarter

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



      const results = Object.values(allResults) as any[];

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



  // Function to generate Gemini analysis with retry logic

  const generateGeminiAnalysis = async (resultData: any, classAverages: any, retryCount: number = 0): Promise<any> => {

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



Remember: Return ONLY the JSON object, no markdown, no code blocks, no additional text.`;



      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {

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

          return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);

        }

        

        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);

      }



      const data = await response.json();

      const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      

      if (!analysisText) {

        if (retryCount < maxRetries) {

          console.log(`No analysis text received, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);

          await new Promise(resolve => setTimeout(resolve, retryDelay));

          return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);

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

          return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);

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

        return generateGeminiAnalysis(resultData, classAverages, retryCount + 1);

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

  const handleStudentNameClick = async (studentId: string, exerciseId: string, classId: string, studentNickname: string) => {

    // Find the student data

    const student = Object.values(studentsByClass).flat().find((s: any) => s.studentId === studentId);

    if (!student) return;



    setSelectedStudentPerformance(student);

    setSelectedExerciseForPerformance({ exerciseId, classId, studentNickname });

    setShowStudentPerformanceModal(true);

    

    // Load performance data

    await loadStudentPerformance(studentId, exerciseId, classId);

  };



  const handleExportToExcel = async (exerciseTitle: string, results: any[], students: any[]) => {

    try {

      // Prepare data for Excel

      const excelData = results.map((result: any, idx: number) => {

        const student = students.find((s: any) => s.studentId === result.studentId);

        const studentNickname = student?.nickname || 'Unknown Student';

        

        const questionResults = result.questionResults || [];

        const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

        const avgAttempts = questionResults.length > 0 ? (totalAttempts / questionResults.length).toFixed(1) : '1.0';

        

        const totalTimeSeconds = Math.round((result.totalTimeSpent || 0) / 1000);

        const totalTimeMinutes = Math.round((result.totalTimeSpent || 0) / 60000);

        const remainingSeconds = Math.round(((result.totalTimeSpent || 0) % 60000) / 1000);

        const timeDisplay = totalTimeMinutes > 0 ? `${totalTimeMinutes}m ${remainingSeconds}s` : `${totalTimeSeconds}s`;

        

        return {

          '#': idx + 1,

          'Student': studentNickname,

          'Avg Attempts': avgAttempts,

          'Time (seconds)': totalTimeSeconds,

          'Time (formatted)': timeDisplay,

          'Completed At': result.completedAt ? new Date(result.completedAt).toLocaleString() : 'N/A'

        };

      });



      // Create a workbook

      const wb = XLSX.utils.book_new();

      

      // Convert data to worksheet

      const ws = XLSX.utils.json_to_sheet(excelData);

      

      // Set column widths

      ws['!cols'] = [

        { wch: 5 },   // #

        { wch: 20 },  // Student

        { wch: 15 },  // Avg Attempts

        { wch: 15 },  // Time (seconds)

        { wch: 18 },  // Time (formatted)

        { wch: 20 }   // Completed At

      ];

      

      // Add worksheet to workbook

      XLSX.utils.book_append_sheet(wb, ws, 'Results');

      

      // Generate Excel file as base64

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      

      // Create filename

      const filename = `${exerciseTitle.replace(/[^a-zA-Z0-9]/g, '_')}_results.xlsx`;

      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      

      // Write file to device

      await FileSystem.writeAsStringAsync(fileUri, wbout, {

        encoding: 'base64',

      });

      

      // Share the file

      if (await Sharing.isAvailableAsync()) {

        await Sharing.shareAsync(fileUri, {

          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

          dialogTitle: `Export ${exerciseTitle} Results`,

          UTI: 'com.microsoft.excel.xlsx'

        });

        showAlert('Success', 'Excel file exported successfully!', undefined, 'success');

      } else {

        showAlert('Success', `Results exported to ${filename}`, undefined, 'success');

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

      showAlert('Error', 'Failed to export results to Excel. Please try again.', undefined, 'error');

    }

  };



  const exportClassListToPdf = async (cls: { id: string; name: string }) => {

    try {

      const students = [...(studentsByClass[cls.id] || [])].sort((a, b) =>

        String(a.nickname || '').localeCompare(String(b.nickname || ''))

      );

      const rows = students

        .map((s: any, idx: number) => {

          const loginCode = s.parentId ? (parentsById[s.parentId]?.loginCode || '—') : '—';

          return `<tr>

            <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${idx + 1}</td>

            <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(String(s.nickname || ''))}</td>

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



  const handleOpenAddStudent = (cls: { id: string; name: string }) => {

    setSelectedClassForStudent(cls);

    setStudentNickname('');

    setStudentGender('male');

    setShowAddStudentModal(true);

  };



  const handleCreateStudent = async () => {

    if (!selectedClassForStudent) return;

    if (!studentNickname.trim()) { showAlert('Error', 'Please enter a student nickname.', undefined, 'error'); return; }

    try {

      setSavingStudent(true);

      const loginCode = await generateUniqueLoginCode();

      // Create parent placeholder (details will be collected on first login)

      const parentPayload = {

        loginCode,

        infoStatus: 'pending',

        createdAt: new Date().toISOString(),

      };

      const { key: parentId, error: parentErr } = await pushData('/parents', parentPayload);

      if (parentErr || !parentId) { showAlert('Error', parentErr || 'Failed to create parent.', undefined, 'error'); return; }

      await writeData(`/parentLoginCodes/${loginCode}`, parentId);

      // Create student

      const studentPayload = {

        classId: selectedClassForStudent.id,

        parentId,

        nickname: studentNickname.trim(),

        gender: studentGender,

        createdAt: new Date().toISOString(),

      };

      const { key: studentId, error: studentErr } = await pushData('/students', studentPayload);

      if (studentErr || !studentId) { showAlert('Error', studentErr || 'Failed to create student.', undefined, 'error'); return; }

      await updateData(`/students/${studentId}`, { studentId });

      await updateData(`/parents/${parentId}`, { parentId });

      // Refresh lists

      await loadStudentsAndParents(activeClasses.map((c) => c.id));

      

      // Close modal first

      setShowAddStudentModal(false);

      setSavingStudent(false);

      

      // Show alert after modal is closed

      setTimeout(() => {

        showAlert(

          'Student Created',

          `Share this Parent Login Code with the guardian: ${loginCode}`,

          [

            {

              text: 'Create Another',

              onPress: () => {

                setStudentNickname('');

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



  // Student menu handlers

  const handleEditStudent = (student: any, classInfo: { id: string; name: string }) => {

    setSelectedClassForStudent(classInfo);

    setStudentNickname(String(student.nickname || ''));

    setStudentGender(String(student.gender || 'male') === 'female' ? 'female' : 'male');

    setShowAddStudentModal(true);

    setStudentMenuVisible(null);

  };



  const handleDeleteStudent = (student: any, classId: string) => {

    showAlert(

      'Delete Student',

      `Remove "${student.nickname}" from this class? This cannot be undone.`,

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

      setSelectedParentInfo({

        ...parentData,

        student: student,

        loginCode: parentData.loginCode || 'N/A'

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

            if (activeClasses.length > 0) {

              await loadStudentsAndParents(activeClasses.map(c => c.id));

            }

            break;

          case 'class':

            // Refresh classes and students

            await loadTeacherClasses(currentUserId);

            if (activeClasses.length > 0) {

              await loadStudentsAndParents(activeClasses.map(c => c.id));

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

      // Generate a unique numeric-only ticket number (15 digits)

      const now = Date.now(); // 13 digits

      const random = Math.floor(Math.random() * 100); // 2 digits

      const ticketNumber = `${now}${random.toString().padStart(2, '0')}`;

      const reportId = ticketNumber;



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

        userRole: 'teacher',

        timestamp,

        description: reportDescription.trim(),

        screenshots: uploadedUrls,

        status: 'pending',

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

                       setAnnAllClasses(false);

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

               <Text style={styles.sectionTitle}>Classrooms</Text>

               {activeClasses.length === 0 ? (

                 <Text style={styles.classroomSubtitle}>No active classes yet.</Text>

               ) : (

                activeClasses.map((cls) => (

                  <View key={cls.id} style={styles.classroomCard}>

                   <View style={styles.classroomHeader}>

                      <Text style={styles.classroomTitle}>{cls.name}</Text>

                      <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>

                      <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>

                      <TouchableOpacity

                        accessibilityLabel="More actions"

                        onPress={() => setOpenMenuClassId(openMenuClassId === cls.id ? null : cls.id)}

                        style={styles.moreButton}

                      >

                        <MaterialIcons name="more-vert" size={22} color="#64748b" />

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

                              handleCloseClass(cls);

                            }}

                            disabled={closingClassId === cls.id}

                          >

                            <MaterialCommunityIcons name="lock" size={16} color="#ef4444" />

                            <Text style={[styles.moreMenuText, { color: '#ef4444' }]}>{closingClassId === cls.id ? 'Closing…' : 'Close Class'}</Text>

                          </TouchableOpacity>

                        </View>

                      )}

                    </View>

                    {/* Analytics Section (placeholder/demo) */}

                    <View style={styles.analyticsContainer}>

                       <View style={styles.analyticsHeader}>

                         <Text style={styles.analyticsTitle}>Results</Text>

                         <TouchableOpacity 

                           style={styles.viewAllButton}

                           onPress={() => setActiveTab('results')}

                         >

                           <Text style={styles.viewAllText}>View All</Text>

                           <AntDesign name="arrow-right" size={14} color="#3b82f6" />

                         </TouchableOpacity>

                       </View>

                      <ResponsiveCards 
                        cardsPerRow={{ xs: 1, sm: 2, md: 3, lg: 3, xl: 3 }}
                        style={styles.analyticsCards}
                      >

                        <View style={styles.analyticsCard}>

                          <View style={styles.analyticsIcon}>

                            <MaterialCommunityIcons name="repeat" size={responsive.scale(24)} color="#10b981" />

                          </View>

                          <View style={styles.analyticsContent}>

                            <Text style={styles.analyticsLabel}>Avg Attempts per Item</Text>

                            <Text style={styles.analyticsValue}>{

                              (() => {

                                const ca = classAnalytics[cls.id] as any;

                                if (!ca || !ca.averageAttempts) return '—';

                                return ca.averageAttempts.toFixed(1);

                              })()

                            }</Text>

                            <Text style={styles.analyticsChange}>Per question average</Text>

                          </View>

                        </View>

                        <View style={styles.analyticsCard}>

                          <View style={styles.analyticsIcon}>

                            <MaterialCommunityIcons name="clock-outline" size={responsive.scale(24)} color="#3b82f6" />

                           </View>

                           <View style={styles.analyticsContent}>

                            <Text style={styles.analyticsLabel}>Average Time</Text>

                            <Text style={styles.analyticsValue}>{

                              (() => {

                                const ca = classAnalytics[cls.id] as any;

                                if (!ca || !ca.averageTime) return '—';

                                const minutes = Math.floor(ca.averageTime / 60000);

                                const seconds = Math.floor((ca.averageTime % 60000) / 1000);

                                return `${minutes}:${seconds.toString().padStart(2, '0')}`;

                              })()

                            }</Text>

                            <Text style={styles.analyticsChange}>Per exercise average</Text>

                          </View>

                        </View>

                      </ResponsiveCards>

                       <View style={styles.quickStats}>

                         <View style={styles.statItem}>

                           <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.total ?? 0}</Text>

                           <Text style={styles.statLabel}>Exercises</Text>

                         </View>

                         <View style={styles.statDivider} />

                         <View style={styles.statItem}>

                           <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.completed ?? 0}</Text>

                           <Text style={styles.statLabel}>Completed</Text>

                         </View>

                         <View style={styles.statDivider} />

                         <View style={styles.statItem}>

                           <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.pending ?? 0}</Text>

                           <Text style={styles.statLabel}>Pending</Text>

                         </View>

                       </View>

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

               <View key={cls.id} style={styles.classTabCard}>

                 <View style={styles.classCardHeader}>

                   <View style={styles.classIconContainer}>

                     <MaterialCommunityIcons name="google-classroom" size={24} color="#3b82f6" />

                   </View>

                   <View style={{ flex: 1 }}>

                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>

                       <Text style={styles.classroomTitle}>{cls.name}</Text>

                       <TouchableOpacity style={styles.exportBtn} onPress={() => exportClassListToPdf(cls)}>

                         <MaterialCommunityIcons name="file-pdf-box" size={14} color="#ffffff" />

                         <Text style={styles.exportBtnText}>Export PDF</Text>

                       </TouchableOpacity>

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

                    <View>

                      <View style={styles.studentHeaderRow}>

                        <Text style={[styles.studentIndex, { width: 28 }]}>#</Text>

                        <Text style={[styles.studentName, { fontWeight: '700', color: '#374151' }]}>Student Name</Text>

                        <Text style={[styles.studentCode, { color: '#374151' }]}>Parent Access Code</Text>

                      </View>

                      {(studentsByClass[cls.id] || []).map((s: any, idx: number) => {

                      const p = s.parentId ? parentsById[s.parentId] : undefined;

                      const loginCode = p?.loginCode || 'N/A';

                      return (

                        <View key={s.studentId} style={styles.studentRow}>

                          <Text style={styles.studentIndex}>{idx + 1}.</Text>

                          <Text style={styles.studentName}>{s.nickname}</Text>

                          <Text style={styles.studentCode}>{loginCode}</Text>

                          <View style={styles.studentActionsWrap}>

                            <TouchableOpacity

                              accessibilityLabel="Student options"

                              onPress={() => setStudentMenuVisible(studentMenuVisible === s.studentId ? null : s.studentId)}

                              style={styles.iconBtn}

                            >

                              <MaterialIcons name="more-vert" size={20} color="#64748b" />

                            </TouchableOpacity>

                            {studentMenuVisible === s.studentId && (

                              <View style={styles.studentMenuDropdown}>

                                <TouchableOpacity

                                  style={styles.studentMenuItem}

                                  onPress={() => handleEditStudent(s, { id: cls.id, name: cls.name })}

                                >

                                  <MaterialIcons name="edit" size={16} color="#64748b" />

                                  <Text style={styles.studentMenuText}>Edit Student</Text>

                                </TouchableOpacity>

                                <TouchableOpacity

                                  style={styles.studentMenuItem}

                                  onPress={() => handleViewParentInfo(s)}

                                >

                                  <MaterialIcons name="person" size={16} color="#3b82f6" />

                                  <Text style={styles.studentMenuText}>View Parent Info</Text>

                                </TouchableOpacity>

                                <TouchableOpacity

                                  style={[styles.studentMenuItem, styles.studentMenuItemDanger]}

                                  onPress={() => handleDeleteStudent(s, cls.id)}

                                >

                                  <MaterialIcons name="delete" size={16} color="#ef4444" />

                                  <Text style={[styles.studentMenuText, styles.studentMenuTextDanger]}>Delete Student</Text>

                                </TouchableOpacity>

                              </View>

                            )}

                          </View>

                        </View>

                      );

                    })}

                    </View>

                  </TouchableWithoutFeedback>

                )}

               </View>

             ))

             )}

           </View>

         )}



         {activeTab === 'results' && (

           <View style={{ paddingBottom: 140 }}>

             {/* Header */}

             <View style={styles.classTabHeader}>

               <View>

                 <Text style={styles.classTabTitle}>Exercise Results</Text>

                 <Text style={styles.classTabSubtitle}>Track performance and analytics</Text>

               </View>

               <MaterialIcons name="assessment" size={32} color="#3b82f6" />

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

                 <View key={cls.id} style={styles.classTabCard}>

                   <View style={styles.classCardHeader}>

                     <View style={styles.classIconContainer}>

                       <MaterialCommunityIcons name="google-classroom" size={24} color="#3b82f6" />

                     </View>

                     <View style={{ flex: 1 }}>

                       <Text style={styles.classroomTitle}>{cls.name}</Text>

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

                         

                         // Group results by exercise for better organization

                         const resultsByExercise = rankedResults.reduce((acc: any, result: any) => {

                           const exerciseTitle = result.exerciseTitle || 'Unknown Exercise';

                           if (!acc[exerciseTitle]) {

                             acc[exerciseTitle] = [];

                           }

                           acc[exerciseTitle].push(result);

                           return acc;

                         }, {});



                         // Handle sorting function

                         const handleSort = (newSortBy: 'attempts' | 'time') => {

                           if (resultsSortBy === newSortBy) {

                             setResultsSortOrder(resultsSortOrder === 'asc' ? 'desc' : 'asc');

                           } else {

                             setResultsSortBy(newSortBy);

                             setResultsSortOrder('asc');

                           }

                         };



                         return Object.entries(resultsByExercise).map(([exerciseTitle, exerciseResults]: [string, any]) => {

                           // Find the assignment for this exercise to get status

                           const exerciseAssignment = assignedExercises.find((assignment: any) => 

                             assignment.exerciseId === exerciseResults[0]?.exerciseId && 

                             assignment.classId === cls.id

                           );

                           

                           // Determine if exercise is still accepting results

                           const isAcceptingResults = exerciseAssignment ? 

                             exerciseAssignment.acceptingStatus === 'open' && 

                             (new Date() <= new Date(exerciseAssignment.deadline) || (exerciseAssignment.acceptLateSubmissions ?? true)) : 

                             false;

                           

                           // Sort the exercise results based on current sort settings

                           const sortedResults = [...exerciseResults].sort((a: any, b: any) => {

                             const aQuestionResults = a.questionResults || [];

                             const bQuestionResults = b.questionResults || [];

                             

                             let aValue, bValue;

                             

                             if (resultsSortBy === 'attempts') {

                               const aTotalAttempts = aQuestionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

                               const bTotalAttempts = bQuestionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

                               aValue = aQuestionResults.length > 0 ? aTotalAttempts / aQuestionResults.length : 1;

                               bValue = bQuestionResults.length > 0 ? bTotalAttempts / bQuestionResults.length : 1;

                             } else {

                               aValue = a.totalTimeSpent || 0;

                               bValue = b.totalTimeSpent || 0;

                             }

                             

                             return resultsSortOrder === 'asc' ? aValue - bValue : bValue - aValue;

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

                             <View key={exerciseTitle} style={styles.exerciseResultsSection}>

                               {/* Exercise Header with Status */}

                               <View style={styles.exerciseHeader}>

                                 <View style={styles.exerciseTitleRow}>

                                   <MaterialCommunityIcons name="book-open-variant" size={20} color="#3b82f6" />

                                   <Text style={styles.exerciseTitle}>{exerciseTitle}</Text>

                                   <View style={[

                                     styles.exerciseStatusBadge,

                                     { backgroundColor: isAcceptingResults ? '#10b981' : '#ef4444' }

                                   ]}>

                                     <MaterialCommunityIcons 

                                       name={isAcceptingResults ? "check-circle" : "close-circle"} 

                                       size={12} 

                                       color="#ffffff" 

                                     />

                                     <Text style={styles.exerciseStatusText}>

                                       {isAcceptingResults ? 'Open' : 'Closed'}

                                     </Text>

                                   </View>

                                 </View>

                                 

                                 {/* Exercise Details - 2x2 Grid */}

                                 <View style={styles.exerciseDetailsGrid}>

                                   <View style={styles.exerciseDetailItem}>

                                     <MaterialCommunityIcons name="help-circle-outline" size={16} color="#64748b" />

                                     <Text style={styles.exerciseDetailText}>

                                       {exerciseResults[0]?.questionResults?.length || 0} Questions

                                     </Text>

                                   </View>

                                   <View style={styles.exerciseDetailItem}>

                                     <MaterialCommunityIcons name="clock-outline" size={16} color="#64748b" />

                                     <Text style={styles.exerciseDetailText}>

                                       {exerciseAssignment?.exercise?.timeLimitPerItem ? 

                                         `${Math.round(exerciseAssignment.exercise.timeLimitPerItem / 60)} min per item` : 'No time limit'}

                                     </Text>

                                   </View>

                                   <View style={styles.exerciseDetailItem}>

                                     <MaterialCommunityIcons name="school-outline" size={16} color="#64748b" />

                                     <Text style={styles.exerciseDetailText}>

                                       {exerciseAssignment?.exercise?.category || 'General'}

                                     </Text>

                                   </View>

                                   <View style={styles.exerciseDetailItem}>

                                     <MaterialCommunityIcons name="chart-line" size={16} color="#64748b" />

                                     <Text style={styles.exerciseDetailText}>

                                       {exerciseAssignment?.exercise?.questionCount ? 

                                         (exerciseAssignment.exercise.questionCount <= 5 ? 'Easy' : 

                                          exerciseAssignment.exercise.questionCount <= 10 ? 'Medium' : 'Hard') : 'Medium'} Level

                                     </Text>

                                   </View>

                                 </View>

                                 

                                 {/* Performance Summary Card */}

                                 <View style={styles.performanceSummaryCard}>

                                   <Text style={styles.performanceSummaryTitle}>Summary of Class Average</Text>

                                   

                                   {/* Progress Bar for Completion Rate */}

                                   <View style={styles.completionProgressContainer}>

                                     <Text style={styles.completionProgressLabel}>Class Completion Progress</Text>

                                     <View style={styles.completionProgressBar}>

                                       <View style={[styles.completionProgressFill, { 

                                         width: `${Math.min(exerciseCompletionRate, 100)}%`,

                                         backgroundColor: exerciseCompletionRate >= 90 ? '#10b981' : 

                                                         exerciseCompletionRate >= 70 ? '#f59e0b' : '#ef4444'

                                       }]} />

                                     </View>

                                     <Text style={styles.completionProgressText}>

                                       {Math.round(exerciseCompletionRate)}% Complete

                                     </Text>

                                   </View>

                                   

                                   <View style={styles.performanceMetricsGrid}>

                                     <View style={styles.performanceMetric}>

                                       <View style={styles.metricIconContainer}>

                                         <MaterialCommunityIcons name="clock-outline" size={12} color="#3b82f6" />

                                       </View>

                                       <View style={styles.metricContent}>

                                         <Text style={styles.metricLabel}>Average Time</Text>

                                         <Text style={styles.metricValue}>

                                           {exerciseAverageTime > 0 ? 

                                             (() => {

                                               const totalMinutes = Math.floor(exerciseAverageTime / 60000);

                                               const remainingSeconds = Math.floor((exerciseAverageTime % 60000) / 1000);

                                               return totalMinutes > 0 ? `${totalMinutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;

                                             })() : 

                                             '—'

                                           }

                                         </Text>

                                       </View>

                                     </View>

                                     

                                     <View style={styles.performanceMetric}>

                                       <View style={styles.metricIconContainer}>

                                         <MaterialCommunityIcons name="repeat" size={12} color="#10b981" />

                                       </View>

                                       <View style={styles.metricContent}>

                                         <Text style={styles.metricLabel}>Average Attempts</Text>

                                         <Text style={styles.metricValue}>

                                           {exerciseAverageAttempts > 0 ? exerciseAverageAttempts.toFixed(1) : '—'}

                                         </Text>

                                       </View>

                                     </View>

                                     

                                     <View style={styles.performanceMetric}>

                                       <View style={styles.metricIconContainer}>

                                         <MaterialCommunityIcons name="account-group" size={12} color="#f59e0b" />

                                       </View>

                                       <View style={styles.metricContent}>

                                         <Text style={styles.metricLabel}>Completion</Text>

                                         <Text style={styles.metricValue}>

                                           ({exerciseResults.length}/{classStudents.length})

                                         </Text>

                                       </View>

                                     </View>

                                   </View>

                                 </View>

                               </View>

                               

                               {/* Student Results Table */}

                               <View style={styles.studentResultsContainer}>

                                 <View style={styles.studentResultsHeader}>

                                   <Text style={styles.studentResultsTitle}>Student Results</Text>

                                   <TouchableOpacity 

                                     style={styles.exportButton}

                                     onPress={() => handleExportToExcel(exerciseTitle, sortedResults, classStudents)}

                                   >

                                     <MaterialCommunityIcons name="file-excel" size={14} color="#ffffff" />

                                     <Text style={styles.exportButtonText}>Export Excel</Text>

                                   </TouchableOpacity>

                                 </View>

                                 

                                 <ScrollView 

                                   horizontal={width < 400}

                                   showsHorizontalScrollIndicator={width < 400}

                                   style={styles.tableScrollContainer}

                                   nestedScrollEnabled={true}

                                   keyboardShouldPersistTaps="handled"

                                 >

                                   <View style={styles.tableContainer}>

                                     {/* Table Header */}

                                     <View style={styles.resultsTableHeader}>

                                       <Text style={[styles.tableHeaderText, { width: 50 }]}>#</Text>

                                       <Text style={[styles.tableHeaderText, { flex: 2 }]}>Student</Text>

                                       <TouchableOpacity 

                                         style={styles.sortableHeaderCell}

                                         onPress={() => handleSort('attempts')}

                                       >

                                         <Text style={[styles.tableHeaderText, { flex: 1.5 }, resultsSortBy === 'attempts' && styles.activeSort]}>

                                           Attempts

                                         </Text>

                                         {resultsSortBy === 'attempts' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={16} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                       <TouchableOpacity 

                                         style={styles.sortableHeaderCell}

                                         onPress={() => handleSort('time')}

                                       >

                                         <Text style={[styles.tableHeaderText, { flex: 1.5 }, resultsSortBy === 'time' && styles.activeSort]}>

                                           Time Spent

                                         </Text>

                                         {resultsSortBy === 'time' && (

                                           <MaterialIcons 

                                             name={resultsSortOrder === 'asc' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 

                                             size={16} 

                                             color="#3b82f6" 

                                           />

                                         )}

                                       </TouchableOpacity>

                                     </View>

                                   

                                     {/* Table Rows */}

                                     {sortedResults.map((result: any, idx: number) => {

                                       // Find student by studentId from the result (proper database lookup)

                                       const student = Object.values(studentsByClass).flat().find((s: any) => s.studentId === result.studentId);

                                       const studentNickname = student?.nickname || 'Unknown Student';

                                       

                                       // Calculate average attempts and total time

                                       const questionResults = result.questionResults || [];

                                       const totalAttempts = questionResults.reduce((sum: number, q: any) => sum + (q.attempts || 1), 0);

                                       const avgAttempts = questionResults.length > 0 ? (totalAttempts / questionResults.length).toFixed(1) : '1.0';

                                       const totalTimeMinutes = Math.round((result.totalTimeSpent || 0) / 60000);

                                       const totalTimeSeconds = Math.round(((result.totalTimeSpent || 0) % 60000) / 1000);

                                       const timeDisplay = totalTimeMinutes > 0 ? `${totalTimeMinutes}m ${totalTimeSeconds}s` : `${Math.round((result.totalTimeSpent || 0) / 1000)}s`;

                                       

                                       // Calculate performance level for this student

                                       const studentPerformanceLevel = (() => {

                                         const avgAttemptsNum = parseFloat(avgAttempts);

                                         const timeInSeconds = (result.totalTimeSpent || 0) / 1000;

                                         

                                         if (avgAttemptsNum <= 1.2 && timeInSeconds <= 60) return 'excellent';

                                         if (avgAttemptsNum <= 2.0 && timeInSeconds <= 120) return 'good';

                                         if (avgAttemptsNum <= 3.0 && timeInSeconds <= 180) return 'fair';

                                         return 'needs_improvement';

                                       })();

                                       

                                       return (

                                         <View key={result.resultId || idx} style={styles.resultsTableRow}>

                                           <Text style={[styles.tableRowText, { width: 50 }]}>{idx + 1}</Text>

                                           <TouchableOpacity 

                                             style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}

                                             onPress={() => handleStudentNameClick(result.studentId, result.exerciseId, result.classId, studentNickname)}

                                           >

                                             <Text style={[styles.tableRowText, styles.studentNameCell, { flex: 1, color: '#3b82f6' }]}>{studentNickname}</Text>

                                           </TouchableOpacity>

                                           <Text style={[styles.tableRowText, { flex: 1.5 }]}>{avgAttempts}</Text>

                                           <Text style={[styles.tableRowText, { flex: 1.5 }]}>{timeDisplay}</Text>

                                         </View>

                                       );

                                     })}

                                   </View>

                                 </ScrollView>

                               </View>

                             </View>

                           );

                         });

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

                            <MaterialCommunityIcons name="google-classroom" size={24} color="#3b82f6" />

                          </View>

                          <View style={{ flex: 1 }}>

                            <Text style={styles.classroomTitle}>{cls.name}</Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>

                              <MaterialIcons name="school" size={14} color="#64748b" />

                              <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>

                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>

                              <MaterialIcons name="calendar-today" size={14} color="#64748b" />

                              <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>

                            </View>

                          </View>

                          <View style={styles.statusPillActive}>

                            <MaterialCommunityIcons name="circle" size={8} color="#10B981" />

                            <Text style={styles.statusTextActive}>Active</Text>

                          </View>

                        </View>

                        <View style={styles.classStudentCount}>

                          <MaterialCommunityIcons name="account-group" size={18} color="#64748b" />

                          <Text style={styles.studentCountText}>{studentsByClass[cls.id]?.length ?? 0} Students</Text>

                        </View>

                        <View style={styles.quickStats}>

                          <View style={styles.statItem}>

                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.total ?? 0}</Text>

                            <Text style={styles.statLabel}>Exercises</Text>

                          </View>

                          <View style={styles.statDivider} />

                          <View style={styles.statItem}>

                            <Text style={styles.statValue}>{assignmentsByClass[cls.id]?.completed ?? 0}</Text>

                            <Text style={styles.statLabel}>Completed</Text>

                          </View>

                          <View style={styles.statDivider} />

                          <View style={styles.statItem}>

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

                            <MaterialCommunityIcons name="google-classroom" size={24} color="#94a3b8" />

                          </View>

                          <View style={{ flex: 1 }}>

                            <Text style={styles.classroomTitle}>{cls.name}</Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>

                              <MaterialIcons name="school" size={14} color="#64748b" />

                              <Text style={styles.classroomSubtitle}>{cls.schoolName || '—'}</Text>

                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>

                              <MaterialIcons name="calendar-today" size={14} color="#64748b" />

                              <Text style={styles.classroomYear}>SY: {formatSchoolYear(cls.schoolYear)}</Text>

                            </View>

                          </View>

                          <View style={styles.statusPillInactive}>

                            <MaterialCommunityIcons name="circle" size={8} color="#94a3b8" />

                            <Text style={styles.statusTextInactive}>Inactive</Text>

                          </View>

                        </View>

                        <View style={styles.classStudentCount}>

                          <MaterialCommunityIcons name="account-group" size={18} color="#64748b" />

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

        

        <TouchableOpacity style={[styles.navItem, activeTab === 'results' && styles.activeNavItem]} onPress={() => setActiveTab('results')}>

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

                    const section = {

                      name: className.trim(),

                      schoolName: resolvedSchool,

                      schoolYear: syValue,

                      teacherId: currentUserId,

                      status: 'active',

                      createdAt: new Date().toISOString(),

                    };

                    const { key, error } = await pushData('/sections', section);

                    if (error || !key) {

                      showAlert('Error', error || 'Failed to create section.', undefined, 'error');

                    } else {

                      await updateData(`/sections/${key}`, { id: key });

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

                  <Text style={styles.announcementFieldLabel}>Send To</Text>

                  <View style={styles.announcementSegmentWrap}>

                    <TouchableOpacity

                      style={[styles.announcementSegmentButton, annAllClasses && styles.announcementSegmentActive]}

                      onPress={() => {

                        setAnnAllClasses(true);

                        setAnnSelectedClassIds(teacherClasses.map((c) => c.id));

                      }}

                    >

                      <MaterialCommunityIcons 

                        name="school" 

                        size={18} 

                        color={annAllClasses ? "#ffffff" : "#64748b"} 

                      />

                      <Text style={[styles.announcementSegmentText, annAllClasses && styles.announcementSegmentTextActive]}>All Classes</Text>

                    </TouchableOpacity>

                    <TouchableOpacity

                      style={[styles.announcementSegmentButton, !annAllClasses && styles.announcementSegmentActive]}

                      onPress={() => setAnnAllClasses(false)}

                    >

                      <MaterialCommunityIcons 

                        name="account-group" 

                        size={18} 

                        color={!annAllClasses ? "#ffffff" : "#64748b"} 

                      />

                      <Text style={[styles.announcementSegmentText, !annAllClasses && styles.announcementSegmentTextActive]}>Specific Classes</Text>

                    </TouchableOpacity>

                  </View>

                  {!annAllClasses && (

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

                  )}

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

                style={[styles.announcementSendButton, (!annTitle.trim() || !annMessage.trim() || (!annAllClasses && annSelectedClassIds.length === 0)) && styles.announcementSendButtonDisabled]}

                disabled={sendingAnn || !annTitle.trim() || !annMessage.trim() || (!annAllClasses && annSelectedClassIds.length === 0)}

                onPress={async () => {

                  if (!currentUserId) { showAlert('Error', 'Not authenticated.', undefined, 'error'); return; }

                  if (!annTitle.trim() || !annMessage.trim()) { showAlert('Error', 'Title and message are required.', undefined, 'error'); return; }

                  const targetIds = annAllClasses ? teacherClasses.map((c) => c.id) : annSelectedClassIds;

                  if (!targetIds.length) { showAlert('Error', 'Select at least one class.', undefined, 'error'); return; }

                  try {

                    setSendingAnn(true);

                    const now = new Date();

                    const id = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

                    const payload = {

                      id,

                      classIds: targetIds,

                      dateTime: now.toISOString(),

                      message: annMessage.trim(),

                      title: annTitle.trim(),

                      teacherId: currentUserId,

                    };

                    const { success, error } = await writeData(`/announcements/${id}`, payload);

                    if (!success) {

                      showAlert('Error', error || 'Failed to send', undefined, 'error');

                    } else {

                      setShowAnnModal(false);

                      setAnnTitle('');

                      setAnnMessage('');

                      setAnnAllClasses(false);

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

              <Text style={styles.modalTitle}>Add Student{selectedClassForStudent ? ` — ${selectedClassForStudent.name}` : ''}</Text>

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

                  <Text style={styles.fieldLabel}>Student Nickname</Text>

                  <TextInput

                    style={styles.fieldInput}

                    value={studentNickname}

                    onChangeText={setStudentNickname}

                    placeholder="e.g., Ken"

                    placeholderTextColor="#6b7280"

                  />

                </View>

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

                  Disclaimer: For student privacy, use only a nickname or a unique identifier. Parent details will be collected securely when they first log in.

                </Text>

              </View>

            </ScrollView>

            <View style={styles.modalActions}>

              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddStudentModal(false)} disabled={savingStudent}>

                <Text style={styles.cancelButtonText}>Cancel</Text>

              </TouchableOpacity>

              <TouchableOpacity style={styles.saveButton} onPress={handleCreateStudent} disabled={savingStudent}>

                <Text style={styles.saveButtonText}>{savingStudent ? 'Creating...' : 'Create'}</Text>

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

                          <Text style={{ color: '#111827' }}>{s.nickname}</Text>

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

                <Text style={styles.studentListTitle}>Students ({studentsByClass[selectedAssignmentForStatus.classId]?.length || 0})</Text>

                <Text style={styles.studentListSubtitle}>Tap status badges to toggle completion</Text>

                

                {(studentsByClass[selectedAssignmentForStatus.classId] || []).map((student: any, index: number) => {

                  const status = getStudentStatus(student.studentId, selectedAssignmentForStatus);

                  return (

                    <View key={student.studentId} style={styles.studentStatusItem}>

                      <View style={styles.studentInfo}>

                        <View style={styles.studentAvatar}>

                          <Text style={styles.studentAvatarText}>

                            {student.nickname?.charAt(0)?.toUpperCase() || 'S'}

                          </Text>

                        </View>

                        <View style={styles.studentDetails}>

                          <Text style={styles.studentStatusName}>{student.nickname || 'Unknown Student'}</Text>

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



      {/* Parent Info Modal */}

      <Modal visible={showParentInfoModal} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <View style={styles.parentInfoModal}>

            <View style={styles.parentInfoHeader}>

              <TouchableOpacity

                onPress={() => setShowParentInfoModal(false)}

                style={styles.parentInfoCloseButton}

              >

                <MaterialIcons name="close" size={24} color="#1e293b" />

              </TouchableOpacity>

              <Text style={styles.parentInfoTitle}>Parent Information</Text>

              <View style={styles.parentInfoPlaceholder} />

            </View>



            {selectedParentInfo && (

              <ScrollView 

                style={styles.parentInfoContent} 

                showsVerticalScrollIndicator={false}

                nestedScrollEnabled={true}

                keyboardShouldPersistTaps="handled"

              >

                <View style={styles.parentInfoSection}>

                  <Text style={styles.parentInfoSectionTitle}>Student Information</Text>

                  <View style={styles.parentInfoRow}>

                    <Text style={styles.parentInfoLabel}>Student Name:</Text>

                    <Text style={styles.parentInfoValue}>{selectedParentInfo.student?.nickname || 'N/A'}</Text>

                  </View>

                  <View style={styles.parentInfoRow}>

                    <Text style={styles.parentInfoLabel}>Gender:</Text>

                    <Text style={styles.parentInfoValue}>{selectedParentInfo.student?.gender || 'N/A'}</Text>

                  </View>

                </View>



                <View style={styles.parentInfoSection}>

                  <Text style={styles.parentInfoSectionTitle}>Access Information</Text>

                  <View style={styles.parentInfoRow}>

                    <Text style={styles.parentInfoLabel}>Parent Access Code:</Text>

                    <Text style={[styles.parentInfoValue, styles.parentInfoCodeValue]}>{selectedParentInfo.loginCode}</Text>

                  </View>

                  <View style={styles.parentInfoRow}>

                    <Text style={styles.parentInfoLabel}>Account Status:</Text>

                    <Text style={[styles.parentInfoValue, selectedParentInfo.infoStatus === 'completed' ? styles.parentInfoStatusCompleted : styles.parentInfoStatusPending]}>

                      {selectedParentInfo.infoStatus === 'completed' ? 'Profile Complete' : 'Profile Pending'}

                    </Text>

                  </View>

                </View>



                {selectedParentInfo.infoStatus === 'completed' && (

                  <View style={styles.parentInfoSection}>

                    <Text style={styles.parentInfoSectionTitle}>Parent Details</Text>

                    <View style={styles.parentInfoRow}>

                      <Text style={styles.parentInfoLabel}>Name:</Text>

                      <Text style={styles.parentInfoValue}>

                        {selectedParentInfo.firstName && selectedParentInfo.lastName 

                          ? `${selectedParentInfo.firstName} ${selectedParentInfo.lastName}`

                          : 'Not provided'}

                      </Text>

                    </View>

                    <View style={styles.parentInfoRow}>

                      <Text style={styles.parentInfoLabel}>Email:</Text>

                      <Text style={styles.parentInfoValue}>{selectedParentInfo.email || 'Not provided'}</Text>

                    </View>

                    <View style={styles.parentInfoRow}>

                      <Text style={styles.parentInfoLabel}>Mobile:</Text>

                      <Text style={styles.parentInfoValue}>{selectedParentInfo.mobile || 'Not provided'}</Text>

                    </View>

                    {selectedParentInfo.profilePictureUrl && (

                      <View style={styles.parentInfoRow}>

                        <Text style={styles.parentInfoLabel}>Profile Picture:</Text>

                        <View style={styles.parentInfoImageContainer}>

                          <Image 

                            source={{ uri: selectedParentInfo.profilePictureUrl }} 

                            style={styles.parentInfoImage}

                            resizeMode="cover"

                          />

                        </View>

                      </View>

                    )}

                  </View>

                )}



                {selectedParentInfo.infoStatus === 'pending' && (

                  <View style={styles.parentInfoSection}>

                    <View style={styles.parentInfoPendingContainer}>

                      <MaterialIcons name="info" size={24} color="#f59e0b" />

                      <Text style={styles.parentInfoPendingText}>

                        Parent hasn't completed their profile yet. Share the access code with them to get started.

                      </Text>

                    </View>

                  </View>

                )}

              </ScrollView>

            )}



            <View style={styles.parentInfoActions}>

              <TouchableOpacity

                style={styles.parentInfoCloseActionButton}

                onPress={() => setShowParentInfoModal(false)}

              >

                <Text style={styles.parentInfoCloseActionButtonText}>Close</Text>

              </TouchableOpacity>

            </View>

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

                  {selectedStudentPerformance.nickname || selectedStudentPerformance.firstName}

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

                      {selectedStudentPerformance?.nickname || 'Unknown Student'}

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

    fontSize: 20,

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

    fontSize: 16,

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

    fontSize: 16,

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

    fontSize: 16,

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

    fontSize: 16,

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

    fontSize: 16,

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

  sectionTitle: {

    fontSize: Math.max(16, Math.min(20, staticWidth * 0.05)),

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: Math.min(12, staticHeight * 0.015),

    paddingHorizontal: Math.min(8, staticWidth * 0.02),

  },

  classroomCard: {

    backgroundColor: '#ffffff',

    borderRadius: Math.min(16, staticWidth * 0.04),

    padding: Math.min(20, staticWidth * 0.05),

    marginHorizontal: Math.min(8, staticWidth * 0.02),

    marginBottom: Math.min(16, staticHeight * 0.02),

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.06,

    shadowRadius: 8,

    elevation: 3,

    borderWidth: 1,

    borderColor: '#e2e8f0',

    width: staticWidth - Math.min(32, staticWidth * 0.08),

    alignSelf: 'center',

  },

  classroomHeader: {

    marginBottom: 12,

  },

  classroomTitle: {

    fontSize: Math.max(16, Math.min(20, staticWidth * 0.05)),

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: Math.min(6, staticHeight * 0.008),

  },

  classroomSubtitle: {

    fontSize: Math.max(12, Math.min(14, staticWidth * 0.035)),

    color: '#64748b',

    marginBottom: Math.min(4, staticHeight * 0.005),

    fontWeight: '500',

  },

  classroomYear: {

    fontSize: Math.max(11, Math.min(13, staticWidth * 0.032)),

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

    fontSize: Math.max(14, Math.min(18, staticWidth * 0.045)),

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

  metricContent: {

    alignItems: 'center',

  },

  metricLabel: {

    fontSize: Math.max(8, Math.min(10, staticWidth * 0.02)),

    color: '#64748b',

    fontWeight: '600',

    marginBottom: 1,

    textAlign: 'center',

  },

  metricValue: {

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

    position: 'absolute',

    top: 0,

    right: 0,

    padding: 6,

    borderRadius: 12,

  },

  moreMenu: {

    position: 'absolute',

    top: 28,

    right: 0,

    backgroundColor: '#ffffff',

    borderRadius: 12,

    paddingVertical: 6,

    paddingHorizontal: 8,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 4 },

    shadowOpacity: 0.1,

    shadowRadius: 8,

    elevation: 6,

    borderWidth: 1,

    borderColor: '#e5e7eb',

    zIndex: 10,

  },

  moreMenuItem: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingVertical: 8,

    paddingHorizontal: 8,

    gap: 8,

  },

  moreMenuText: {

    color: '#1e293b',

    fontSize: 14,

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

    borderRadius: 16,

    padding: 20,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 2 },

    shadowOpacity: 0.05,

    shadowRadius: 8,

    elevation: 2,

    borderWidth: 1,

    borderColor: '#f1f5f9',

  },

  statItem: {

    flex: 1,

    alignItems: 'center',

  },

  statValue: {

    fontSize: 20,

    fontWeight: '700',

    color: '#1e293b',

    marginBottom: 4,

  },

  statLabel: {

    fontSize: 12,

    color: '#64748b',

    fontWeight: '500',

  },

  statDivider: {

    width: 1,

    backgroundColor: '#e2e8f0',

    marginHorizontal: 16,

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

  studentRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingVertical: 8,

    borderBottomWidth: 1,

    borderBottomColor: '#f1f5f9',

  },

  studentHeaderRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

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

    gap: 10,

  },

  iconBtn: {

    padding: 6,

    borderRadius: 8,

  },

  statusPillActive: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    backgroundColor: '#dcfce7',

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 20,

    borderWidth: 1,

    borderColor: '#86efac',

  },

  statusPillInactive: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    backgroundColor: '#f1f5f9',

    paddingHorizontal: 12,

    paddingVertical: 6,

    borderRadius: 20,

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

    fontSize: 12,

    fontWeight: '700',

  },

  statusTextInactive: {

    color: '#64748b',

    fontSize: 12,

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

    fontSize: 24,

    fontWeight: '800',

    color: '#1e293b',

    marginBottom: 4,

  },

  classTabSubtitle: {

    fontSize: 14,

    color: '#64748b',

    fontWeight: '500',

  },

  emptyStateContainer: {

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 60,

    paddingHorizontal: 20,

  },

  emptyStateText: {

    fontSize: 18,

    fontWeight: '700',

    color: '#94a3b8',

    marginTop: 16,

    marginBottom: 8,

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

    borderRadius: 16,

    padding: 18,

    marginHorizontal: 8,

    marginBottom: 32,

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

    marginBottom: 14,

    gap: 12,

  },

  classIconContainer: {

    width: 48,

    height: 48,

    borderRadius: 14,

    backgroundColor: '#eff6ff',

    justifyContent: 'center',

    alignItems: 'center',

    borderWidth: 1,

    borderColor: '#dbeafe',

  },

  classIconContainerInactive: {

    width: 48,

    height: 48,

    borderRadius: 14,

    backgroundColor: '#f8fafc',

    justifyContent: 'center',

    alignItems: 'center',

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  classStudentCount: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

    paddingVertical: 10,

    paddingHorizontal: 12,

    backgroundColor: '#f8fafc',

    borderRadius: 10,

    marginBottom: 12,

    borderWidth: 1,

    borderColor: '#e2e8f0',

  },

  studentCountText: {

    fontSize: 14,

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

    padding: 8,

    borderRadius: 8,

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

    fontSize: 14,

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

  quarterHeader: {

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

    minWidth: staticWidth < 400 ? staticWidth * 0.9 : 'auto',

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

    fontSize: Math.max(11, Math.min(13, staticWidth * 0.03)),

    fontWeight: '700',

    color: '#374151',

    textAlign: 'center',

  },

  

  sortableHeaderCell: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 4,

    flex: 1.5,

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

    minWidth: staticWidth < 400 ? staticWidth * 0.9 : 'auto',

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

    fontSize: Math.max(11, Math.min(13, staticWidth * 0.03)),

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

    maxHeight: staticHeight * 0.35,

  },

  tableContainer: {

    minWidth: staticWidth < 400 ? staticWidth * 0.9 : 'auto',

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

    maxHeight: '85%',

    minHeight: '60%',

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

    paddingBottom: 24,

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

});
