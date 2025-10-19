# MATHTATAG

A comprehensive cross-platform educational application for mathematical learning, built with React Native and Expo. This modern learning management system enables teachers to create interactive exercises, students to solve them, and parents to monitor progress—all in real-time.

## 📋 Table of Contents
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Setup](#-quick-setup)
- [Data Architecture](#-data-architecture)
- [User Roles & Features](#-user-roles--features)
- [Project Structure](#-project-structure)
- [ID System](#-id-system)
- [Development](#-development)
- [Deployment](#-deployment)
- [Build for Production](#-build-for-production)

## ✨ Features

### Core Capabilities
- 🎓 **Multi-Role System**: Teachers, Students, Parents, Admins, and Super Admins
- 📝 **Exercise Management**: Create, assign, and track mathematical exercises
- 🎯 **Interactive Learning**: Multiple question types (Multiple Choice, Identification, Matching, Re-order, Reading Passage)
- 📊 **Real-time Analytics**: Track student progress and performance with detailed metrics
- 🔊 **Dual Audio System**: AI-generated TTS (ElevenLabs) + Teacher voice recording
- 🎤 **Voice Recording**: Ultra-optimized voice recording (~100 KB/min, 2-minute limit)
- 📱 **Cross-Platform**: Works seamlessly on Web, iOS, and Android
- 🌐 **Offline-First**: AsyncStorage for local data persistence
- 📧 **Email Verification**: Secure teacher registration with email confirmation
- 🖼️ **Smart Image Management**: Stock image library + custom uploads with filename extraction

### Advanced Features
- ✅ **Drag-and-Drop Reordering**: Interactive question ordering with visual feedback
- 📄 **Excel/CSV Export**: Export student data and results for analysis
- 🖼️ **Smart Image Management**: 15+ categories of stock images + custom uploads
- 📢 **Announcements**: Broadcast messages to classes, students, or parents
- 👥 **Class Management**: Organize students by grade/section with real-time sync
- 📈 **Performance Analytics**: Detailed metrics including attempts, time spent, accuracy
- 🔐 **Role-Based Access**: Granular permissions for Teachers, Admins, and Super Admins
- 🎙️ **Voice Recording**: Record custom voice instructions with noise optimization
- 🔄 **Attempt Tracking**: Smart attempt counting (only incorrect answers increment attempts)
- ⏱️ **Time Limits**: Configurable per-question time limits and max attempts
- 🎨 **Multiple Question Types**: Grid/List layouts, multiple images, image-based options

## 🛠 Tech Stack

### Frontend Framework
- **React Native 0.81.4** - Cross-platform mobile framework
- **Expo 54** - Development platform and tooling
- **Expo Router 6** - File-based navigation
- **TypeScript 5.9** - Type safety and better DX

### Backend & Database
- **Firebase Realtime Database** - NoSQL cloud database for real-time data sync
- **Firebase Storage** - Cloud storage for images, audio, and files
- **Firebase Authentication** - Secure user authentication with email verification

### UI & Styling
- **React Native Reanimated** - Smooth animations
- **React Native Gesture Handler** - Touch interactions
- **Expo Symbols & Icons** - Icon library
- **Custom theming** - Adaptive dark/light mode support

### Key Libraries
- **@elevenlabs/elevenlabs-js** - AI-powered text-to-speech API integration
- **expo-av** - Audio recording and playback (optimized for voice)
- **react-native-draggable-flatlist** - Smooth drag-and-drop functionality
- **xlsx** - Excel file generation and parsing
- **expo-document-picker** - File selection for resources
- **expo-image-picker** - Camera and gallery access
- **@react-native-firebase** - Firebase SDK integration

## 🚀 Quick Setup

### Prerequisites
- Node.js 18+ and npm
- Expo CLI (installed automatically)
- Firebase account (project already configured)
- Git (for cloning the repository)

### Clone the Repository

To get started, clone the repository from GitHub:

```bash
# Clone the entire repository
git clone https://github.com/Kaneki0607/MATHTATAG-reimagined.git

# Or clone a specific branch (e.g., ced2)
git clone --branch ced2 --single-branch https://github.com/Kaneki0607/MATHTATAG-reimagined.git

# Navigate to the project directory
cd MATHTATAG-reimagined
```

### Installation

Run this single command to set up everything:

```bash
npm run setup
```

This command will:
- ✅ Install all dependencies with proper peer dependency resolution
- ✅ Create necessary configuration files (babel.config.js, metro.config.js, expo-env.d.ts)
- ✅ Install missing packages (react-native-worklets)
- ✅ Fix Expo package versions
- ✅ Set up the project for immediate development

### Initialize ID System (Optional, Already Done)

If starting fresh or after database reset:

```bash
# Initialize ID counters in Firebase
npm run id:init

# Verify ID system status
npm run id:verify
```

## 🗄️ Data Architecture

### Database Structure

MATHTATAG uses **Firebase Realtime Database** with the following hierarchical structure:

```
/
├── system/
│   └── idCounters/          # Auto-incrementing ID counters
│       ├── PARENT/          # count: number, lastUpdated: timestamp
│       ├── TEACHER/
│       ├── STUDENT/
│       ├── EXERCISE/
│       └── ...
│
├── teachers/
│   └── {teacherId}/         # T-XXX-0001
│       ├── email
│       ├── firstName
│       ├── lastName
│       ├── emailVerified
│       ├── schoolCode
│       ├── classes: []
│       └── timestamp
│
├── students/
│   └── {studentId}/         # S-XXX-0001
│       ├── fullName
│       ├── firstName
│       ├── surname
│       ├── gender
│       ├── classId
│       ├── parentId
│       ├── gradeSection
│       └── timestamp
│
├── parents/
│   └── {parentId}/          # P-XXX-0001
│       ├── loginCode        # XXXX-XXXX format
│       ├── firstName
│       ├── lastName
│       ├── contactNumber
│       ├── address
│       ├── children: []     # Array of student IDs
│       └── infoStatus
│
├── classes/
│   └── {classId}/           # C-XXX-0001
│       ├── className
│       ├── section
│       ├── gradeLevel
│       ├── teacherId
│       ├── students: []
│       └── timestamp
│
├── exercises/
│   └── {exerciseId}/        # E-XXX-0001
│       ├── title
│       ├── description
│       ├── category
│       ├── teacherId
│       ├── teacherName
│       ├── timeLimitPerItem    # Time limit per question (seconds)
│       ├── maxAttemptsPerItem  # Max attempts per question
│       ├── questions: []
│       │   └── {
│       │       id: "E-XXX-0001-Q001",
│       │       type: "multiple-choice" | "identification" | "matching" | "re-order" | "reading-passage",
│       │       question: "text",
│       │       questionImage: "url",      # Single image
│       │       questionImages: [],        # Multiple images (patterns)
│       │       answer: "..." | [],        # String or array
│       │       options: [],               # For multiple choice
│       │       optionImages: [],          # Images for options
│       │       pairs: [],                 # For matching questions
│       │       reorderItems: [],          # For re-order questions
│       │       ttsAudioUrl: "url",        # AI-generated TTS
│       │       recordedTtsUrl: "url",     # Teacher-recorded voice
│       │       ttsStatus: "idle" | "generating" | "ready" | "failed",
│       │       fillSettings: {            # For identification questions
│       │         caseSensitive: boolean,
│       │         showBoxes: boolean,
│       │         altAnswers: [],
│       │         hint: "text"
│       │       }
│       │   }
│       ├── createdAt
│       ├── isPublic
│       └── coAuthors: []
│
├── assignedExercises/
│   └── {assignedId}/        # A-XXX-0001
│       ├── exerciseId
│       ├── classId
│       ├── teacherId
│       ├── dueDate
│       ├── assignedDate
│       └── status
│
├── results/
│   └── {resultId}/          # E-XXX-0001-R-ABC-0001
│       ├── studentId
│       ├── exerciseId
│       ├── classId
│       ├── answers: []
│       ├── score
│       ├── totalQuestions
│       ├── timeTaken
│       ├── submittedAt
│       └── accuracy
│
├── announcements/
│   └── {announcementId}/    # N-XXX-0001
│       ├── title
│       ├── message
│       ├── teacherId
│       ├── targetAudience   # "all", "class", "student"
│       ├── timestamp
│       └── priority
│
└── parentLoginCodes/
    └── {loginCode}/         # Maps login codes to parent IDs
        └── parentId
```

### Storage Structure

**Firebase Storage** is used for media files:

```
/exercises/
├── {exerciseId}/
│   ├── questions/
│   │   ├── {questionId}.png
│   │   └── {questionId}_audio.mp3  # AI-generated TTS
│   └── thumbnail.png
│
/recorded-tts/
└── {exerciseCode}/
    ├── question-{questionId}.m4a    # Teacher-recorded voice
    └── ...
│
/students/
└── {studentId}/
    └── avatar.png
│
/stock-images/
└── {categoryName}/
    └── {imageName}.png              # Custom uploaded stock images
```

### Data Flow Process

#### 1. **Exercise Creation Flow**
```
Teacher creates exercise with questions
    ↓
Images added (stock library or custom upload)
    ↓
Images uploaded to Firebase Storage
    ↓
Audio options (choose one):
  • AI TTS generation (ElevenLabs)
  • Teacher voice recording (2-min limit, optimized compression)
  • Both (recorded voice takes priority)
    ↓
Audio uploaded to Firebase Storage
  • AI TTS: /exercises/{exerciseId}/questions/{questionId}_audio.mp3
  • Recorded: /recorded-tts/{exerciseCode}/question-{questionId}.m4a
    ↓
Exercise saved to /exercises with:
  • Question data
  • Image URLs
  • ttsAudioUrl (AI TTS)
  • recordedTtsUrl (Teacher voice)
  • Metadata (attempts, time limits)
    ↓
Exercise ID generated (E-XXX-0001)
```

#### 2. **Exercise Assignment Flow**
```
Teacher selects exercise + class
    ↓
Assigned exercise created in /assignedExercises
    ↓
Real-time listener notifies students
    ↓
Students see new exercise in their dashboard
```

#### 3. **Exercise Completion Flow**
```
Student answers questions
    ↓
Answers validated against correctAnswer
    ↓
Result calculated (score, accuracy, time)
    ↓
Result saved to /results with hierarchical ID
    ↓
Parent dashboard updated in real-time
    ↓
Teacher analytics updated
```

#### 4. **Authentication Flow**
```
Teacher Registration:
  Email + Password → Firebase Auth
    ↓
  Email verification sent
    ↓
  User data saved to /teachers (emailVerified: false)
    ↓
  After verification → emailVerified: true
  
Parent Login:
  Login Code (XXXX-XXXX) → Lookup in /parentLoginCodes
    ↓
  Retrieve parent ID → Load from /parents
    ↓
  Access granted to children's data
  
Student Login:
  No authentication required
    ↓
  Student ID provided by teacher
    ↓
  Direct access to assigned exercises
```

### Real-time Data Synchronization

The app uses Firebase Realtime Database listeners for instant updates:

- **Teachers**: See student submissions as they happen
- **Students**: See new assignments immediately
- **Parents**: Track child's progress in real-time
- **Admins**: Monitor system activity live

### Data Persistence Strategy

- **Cloud-first**: All data stored in Firebase
- **Local cache**: AsyncStorage for offline support
- **Optimistic updates**: UI updates before server confirmation
- **Automatic retry**: Failed operations queued and retried
- **Data validation**: Client and server-side validation

## 👥 User Roles & Features

### 1. Super Admin
- Manage admin accounts
- System-wide announcements
- View all users and data
- Generate system reports
- Access audit logs

### 2. Admin  
- Manage teachers (approve/reject registrations)
- View teacher activities
- System announcements
- Generate reports

### 3. Teacher
- **Exercise Creation**: 
  - Create 5 types of interactive questions
  - Add images from stock library (500+ images) or custom uploads
  - Generate AI voice (ElevenLabs TTS) or record custom voice
  - Set time limits and max attempts per question
- **Class Management**: 
  - Create and organize classes by grade/section
  - Add/remove students
  - Generate parent login codes
- **Exercise Assignment**: 
  - Assign exercises to specific classes
  - Set deadlines and late submission policies
- **Analytics & Reporting**:
  - View real-time student results
  - Detailed attempt tracking and time analytics
  - Export data to Excel/CSV
- **Communication**:
  - Send announcements to classes
  - Broadcast messages to students and parents
- **Voice Recording**:
  - Record custom voice instructions (max 2 minutes)
  - Ultra-optimized compression (~100 KB/min)
  - Preview, re-record, or delete recordings
  - Recordings automatically prioritize over AI TTS

### 4. Student
- View assigned exercises
- Complete exercises with immediate feedback
- See personal progress and scores
- Access exercises by category
- Listen to questions (TTS)

### 5. Parent
- Login with unique code (no password)
- View all children's data
- Monitor exercise completion
- See detailed results and analytics
- Update personal information
- Receive announcements from teachers

## 📝 Question Types

MATHTATAG supports 5 comprehensive question types:

### 1. Multiple Choice
- **Grid or List Layout**: Visual or text-based options
- **Single or Multi-Answer**: Select one or multiple correct answers
- **Image Support**: Questions and options can include images
- **Multiple Images per Option**: Support for complex visual questions
- **Smart Validation**: Incorrect answers increment attempts, correct answers don't

### 2. Identification (Fill-in-the-Blank)
- **Flexible Matching**: Case-sensitive or case-insensitive
- **Alternative Answers**: Accept multiple correct variations
- **Show/Hide Boxes**: Visual answer boxes optional
- **Hints**: Optional hints for students
- **Accent Stripping**: Ignore diacritical marks for language flexibility

### 3. Matching Type
- **Drag-and-Drop Interface**: Intuitive pairing with visual feedback
- **Image Support**: Both left and right sides can have images or text
- **Color-Coded Pairs**: Visual indication of matched pairs
- **Smart Validation**: Only incorrect matches count as attempts
- **Locked Correct Pairs**: Prevent changing correct matches

### 4. Re-Order Questions
- **Ascending/Descending**: Define sort order
- **Mixed Content**: Text, images, or both
- **Visual Feedback**: Lock indicators for correct items
- **Drag-and-Drop**: Smooth reordering with gesture handling
- **Smart Locking**: Correct items stay in place, wrong items return to pool
- **No Duplicates**: Deduplication ensures clean UI

### 5. Reading Passage
- **Scrollable Passage**: Long-form reading content
- **Sub-Questions**: Multiple questions about the same passage
- **Mixed Question Types**: Each sub-question can be any type
- **Progressive Disclosure**: Questions revealed as students progress

### Question Features
- **Image Management**: 
  - Stock image library (15+ categories, 500+ images)
  - Custom uploads
  - Filename extraction for Firebase URL comparison
  - Multiple images per question (patterns)
- **Audio Support**:
  - AI-generated TTS per question
  - Teacher-recorded voice per question
  - Automatic priority handling
- **Attempt Tracking**:
  - Only wrong answers increment attempts
  - Correct answers don't count against limits
  - Detailed attempt history per question
- **Time Tracking**: Per-question time spent monitoring

## 🎤 Audio & Voice Recording Features

MATHTATAG offers a **dual audio system** for maximum flexibility:

### AI-Generated Text-to-Speech (ElevenLabs)
- **High-quality AI voices**: Natural-sounding voice synthesis
- **Multi-language support**: Generate TTS in various languages
- **Batch generation**: Generate audio for all questions at once
- **Fallback system**: Multiple API keys with automatic failover
- **Regeneration**: Re-generate audio if quality is unsatisfactory

### Teacher Voice Recording
- **Custom voice instructions**: Record your own voice for personalized teaching
- **Ultra-optimized compression**: ~40-100 KB per minute (75% smaller than standard)
  - Sample Rate: 22,050 Hz (optimized for voice)
  - Bit Rate: 32 kbps (minimal file size)
  - Mono channel (single audio track)
- **2-minute time limit**: Automatic stop with visual countdown
  - Color-coded timer: Green → Orange (30s left) → Red (15s left)
- **Firebase Storage integration**: Seamless upload and management
- **Priority system**: Recorded voice automatically overrides AI TTS
- **Recording management**:
  - Preview before saving
  - Re-record if needed
  - Delete previous recordings to restore AI TTS
  - Play/Stop controls

### Audio Playback (Student Side)
- **Automatic prioritization**: Recorded voice → AI TTS → None
- **Cached playback**: Pre-loaded audio for instant playback
- **Resource preloading**: Images and audio preloaded before exercise starts
- **Play count tracking**: Monitor how many times students listen
- **Visual feedback**: Speaker icon shows audio availability

### Storage Optimization
With the optimized recording settings:
- **2-minute recording**: ~80-200 KB (vs 2 MB unoptimized)
- **10 recordings**: ~800 KB - 2 MB
- **100 recordings**: ~8-20 MB
- **Perfect for Firebase free tier**: 5 GB storage limit

### Benefits
- ✅ **Personalized learning**: Students hear their teacher's voice
- ✅ **Language flexibility**: Support for Filipino, English, and mixed content
- ✅ **Accessibility**: Audio support for students with reading difficulties
- ✅ **Cost-effective**: Minimal storage usage with optimized compression
- ✅ **Easy to use**: Simple record → preview → save workflow

## 📁 Project Structure

```
MATHTATAG-reimagined/
│
├── app/                          # Main application screens (Expo Router)
│   ├── index.tsx                 # Landing page / Role selection
│   ├── _layout.tsx               # Root layout with navigation
│   ├── TeacherLogin.tsx          # Teacher authentication
│   ├── TeacherDashboard.tsx      # Teacher main interface
│   ├── ParentLogin.tsx           # Parent login (code-based)
│   ├── ParentDashboard.tsx       # Parent main interface
│   ├── StudentExerciseAnswering.tsx  # Student exercise interface
│   ├── CreateExercise.tsx        # Exercise creation form
│   ├── AdminLogin.tsx            # Admin authentication
│   ├── AdminDashboard.tsx        # Admin panel
│   └── SuperAdminDashboard.tsx   # Super admin panel
│
├── components/                   # Reusable React components
│   ├── AssignExerciseForm.tsx    # Exercise assignment modal
│   ├── IdManagementPanel.tsx     # ID system management
│   ├── ResponsiveComponents.tsx  # Responsive wrappers
│   ├── TermsAndConditions.tsx    # Legal text component
│   └── ui/                       # UI primitives
│
├── lib/                          # Core business logic and utilities
│   ├── firebase.ts               # Firebase app initialization
│   ├── firebase-auth.ts          # Authentication functions
│   ├── firebase-database.ts      # Database CRUD operations
│   ├── firebase-storage.ts       # File upload/download
│   ├── id-generator.ts           # Readable ID generation system
│   ├── entity-helpers.ts         # Entity creation helpers
│   ├── elevenlabs-keys.ts        # TTS API configuration
│   ├── error-logger.ts           # Error tracking
│   └── README-ID-SYSTEM.ts       # ID system documentation
│
├── hooks/                        # Custom React hooks
│   ├── useExercises.ts           # Exercise data management
│   ├── useResponsive.ts          # Responsive layout hook
│   └── use-color-scheme.ts       # Theme management
│
├── constants/                    # App-wide constants
│   └── theme.ts                  # Color scheme and styling
│
├── scripts/                      # Utility scripts
│   ├── setup.js                  # Project setup automation
│   ├── initialize-id-counters.ts # Initialize ID system
│   ├── migrate-ids.ts            # Migrate legacy IDs
│   ├── verify-ids.ts             # Verify ID integrity
│   └── reset-project.js          # Reset to blank slate
│
├── assets/                       # Static assets
│   ├── images/                   # App icons, logos, splash screens
│   │   ├── Stock-Images/         # Exercise images library
│   │   │   ├── Numbers/          # Number images (0-100)
│   │   │   ├── Shapes/           # Geometric shapes
│   │   │   ├── Animals/          # Animal images
│   │   │   ├── Fruits and Vegetables/
│   │   │   └── ... (15+ categories)
│   │   └── Maps/                 # Map images for navigation
│   └── fonts/                    # Custom fonts
│
├── dist/                         # Web build output (generated)
├── node_modules/                 # Dependencies (generated)
│
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── app.json                      # Expo configuration
├── babel.config.js               # Babel configuration
├── metro.config.js               # Metro bundler config
└── vercel.json                   # Vercel deployment config
```

## 🔑 ID System

MATHTATAG uses a **readable, sequential ID system** instead of random Firebase keys.

### ID Format: `PREFIX-XXX-XXXX`

**Components:**
- `PREFIX`: Single letter entity type (T=Teacher, S=Student, P=Parent, etc.)
- `XXX`: Random 3-letter code (prevents collisions)
- `XXXX`: Sequential 4-digit number

**Examples:**
```
T-ABA-0001  → Teacher ID
S-XYZ-0042  → Student ID
P-FGH-0003  → Parent ID
E-LMN-0156  → Exercise ID
C-QWE-0012  → Class ID
```

### Hierarchical IDs

**Questions:**
```
E-LMN-0156-Q001  → Question 1 of Exercise E-LMN-0156
E-LMN-0156-Q002  → Question 2 of Exercise E-LMN-0156
```

**Results:**
```
E-LMN-0156-R-ABC-0001  → Result for Exercise E-LMN-0156
```

### Benefits
- ✅ **Human-readable**: Easy to reference in support
- ✅ **Traceable**: Sequential numbers show growth
- ✅ **Collision-resistant**: Random 3-letter code prevents duplicates
- ✅ **Type-visible**: Know entity type from first letter
- ✅ **Hierarchical**: Clear parent-child relationships

### ID System Commands

```bash
# Initialize counters (run once)
npm run id:init

# Verify current ID state
npm run id:verify

# Test ID generation
npm run id:test

# Migrate legacy IDs (if needed)
npm run id:migrate
```

See `lib/README-ID-SYSTEM.ts` for complete documentation.

## 📱 Development

### Start Development Server

```bash
# Clear cache and start (recommended)
npm run start:clear

# Regular start
npm start

# Platform-specific
npm run android    # Android emulator/device
npm run ios        # iOS simulator/device  
npm run web        # Web browser
```

### Development Features

- **Hot Reload**: Changes appear instantly
- **TypeScript**: Full type checking
- **File-based Routing**: Add files to `/app` directory
- **Error Overlay**: Helpful error messages in development

### Git Workflow

```bash
# Check current branch
git branch

# Create and switch to a new branch
git checkout -b feature/new-feature

# Switch to existing branch
git checkout ced2

# Pull latest changes from a specific branch
git pull origin ced2

# Push changes to your branch
git add .
git commit -m "Your commit message"
git push origin your-branch-name

# Clone a specific branch only
git clone --branch ced2 --single-branch https://github.com/Kaneki0607/MATHTATAG-reimagined.git
```

### Testing

```bash
# Test ID system
npm run id:test

# Verify database integrity
npm run id:verify
```

## 🌐 Deployment

### Web Deployment (Vercel)

This app is optimized for Vercel deployment:

1. **Connect to Vercel**
```bash
git add .
git commit -m "Ready for deployment"
git push
```

2. **Import on Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Deploy with one click!

3. **Automatic Deployments**
   - Every push to `main` triggers a deployment
   - Preview deployments for pull requests

See `VERCEL_SETUP.md` for detailed instructions.

### Mobile Deployment (EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build Android APK
eas build --platform android --profile preview

# Build for production
eas build --platform android --profile production

# Build iOS
eas build --platform ios --profile production
```

### Over-The-Air (OTA) Updates

Push updates to users without rebuilding the app:

```bash
# Push an update to the preview branch
eas update --branch preview --message "Bug fixes and improvements"

# Push an update to production
eas update --branch production --message "New features"

# Push an update with automatic message
eas update --branch preview --message "fixes"
```

**Benefits of OTA Updates:**
- ✅ Instant bug fixes without app store review
- ✅ Update JavaScript and assets in seconds
- ✅ Users get updates automatically on app restart
- ✅ No need to rebuild native binaries

**Note:** OTA updates only work for JavaScript code and assets. Native code changes require a full rebuild.

## 📦 Build for Production

### Web Build
```bash
npm run build:web
```
Output: `dist/` folder ready for static hosting

### Android APK
```bash
eas build --platform android --profile preview
```
Get: Downloadable APK file

### iOS IPA
```bash
eas build --platform ios --profile production
```
Submit to App Store

## 🔐 Environment Configuration

### Firebase Configuration
Located in `lib/firebase.ts`:
```typescript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "mathtatag-capstone-app.firebaseapp.com",
  databaseURL: "https://mathtatag-capstone-app-default-rtdb.firebaseio.com",
  projectId: "mathtatag-capstone-app",
  storageBucket: "mathtatag-capstone-app.firebasestorage.app",
  // ...
};
```

### ElevenLabs TTS (Optional)
Configure in `lib/elevenlabs-keys.ts` for text-to-speech functionality.

## 🚀 Quick Reference

### Common Teacher Tasks

#### Recording Voice Instructions
1. Create or edit a question
2. Click "Record Voice" button
3. Grant microphone permission (first time only)
4. Click "Start Recording"
5. Speak clearly (up to 2 minutes, color-coded timer shows remaining time)
6. Click "Stop Recording"
7. Preview the recording with "Play" button
8. Save or re-record if needed

#### Using Stock Images
1. When creating a question, click "Add image"
2. Choose from 15+ categories:
   - Numbers (0-100)
   - Shapes (2D & 3D)
   - Animals (47 images)
   - Fruits & Vegetables (23 images)
   - Money (Philippine currency)
   - Time & Position
   - And more!
3. Click an image to add it to your question

#### Managing Audio
- **AI TTS**: Generated automatically if enabled in question generator
- **Voice Recording**: Overrides AI TTS when both exist
- **Delete Recording**: Click "Delete Previous Recording" to restore AI TTS
- **Regenerate TTS**: Click "Regenerate" if AI voice quality is poor

#### Setting Limits
- **Time Limit**: Set seconds per question (e.g., 120 for 2 minutes)
- **Max Attempts**: Set maximum attempts or leave unlimited
- **Remember**: Only wrong answers count toward attempt limit!

### Common Developer Tasks

#### Running the Project
```bash
# Start with clean cache
npm run start:clear

# Test on specific platform
npm run android
npm run ios
npm run web
```

#### Database Operations
```bash
# Initialize ID system (first time)
npm run id:init

# Verify database integrity
npm run id:verify

# Test ID generation
npm run id:test
```

#### Deployment
```bash
# Build for web (Vercel)
npm run build:web

# Build Android APK
eas build --platform android --profile preview

# Push OTA update
eas update --branch preview --message "Bug fixes"
```

## 📚 Learn More

### Expo Resources
- [Expo Documentation](https://docs.expo.dev/)
- [Expo Router Guide](https://docs.expo.dev/router/introduction/)
- [EAS Build Guide](https://docs.expo.dev/build/introduction/)

### Firebase Resources  
- [Firebase Realtime Database](https://firebase.google.com/docs/database)
- [Firebase Storage](https://firebase.google.com/docs/storage)
- [Firebase Authentication](https://firebase.google.com/docs/auth)

### Development Guides
- [React Native Docs](https://reactnative.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 👨‍💻 Development Team

Built as a capstone project for educational technology advancement.

## 📄 License

This project is proprietary software developed for MATHTATAG.

---

## 🆕 Recent Updates

### Version 1.0.3 (October 2025)
- ✅ **Voice Recording System**: Ultra-optimized teacher voice recording with 2-minute limit
- ✅ **Audio Compression**: 75% smaller file sizes (~40-100 KB/min vs 960 KB/min)
- ✅ **Dual Audio Priority**: Recorded voice automatically overrides AI TTS
- ✅ **Recording Management**: Delete previous recordings to restore AI TTS
- ✅ **Smart Attempt Tracking**: Only incorrect answers increment attempt counter
- ✅ **Re-order Component**: Complete overhaul with locked slots and visual feedback
- ✅ **Filename Extraction**: Smart URL comparison for Firebase images
- ✅ **Multiple Question Images**: Support for pattern questions with multiple images
- ✅ **Time-coded Recording**: Visual countdown with color indicators
- ✅ **Storage Optimization**: Perfect for Firebase free tier (5 GB limit)

---

**Current Version:** 1.0.3  
**Last Updated:** October 19, 2025  
**Status:** Production Ready ✅  
**Repository:** [github.com/Kaneki0607/MATHTATAG-reimagined](https://github.com/Kaneki0607/MATHTATAG-reimagined)
