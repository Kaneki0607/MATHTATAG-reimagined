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
- 🎯 **Interactive Learning**: Image-based questions with multiple answer types
- 📊 **Real-time Analytics**: Track student progress and performance
- 🔊 **Text-to-Speech**: Audio support using ElevenLabs AI
- 📱 **Cross-Platform**: Works on Web, iOS, and Android
- 🌐 **Offline-First**: AsyncStorage for local data persistence
- 📧 **Email Verification**: Secure teacher registration with email confirmation

### Advanced Features
- ✅ Drag-and-drop question ordering
- 📄 Excel/CSV data export
- 🖼️ Image upload and management
- 📢 Announcements and notifications
- 👥 Class and student management
- 📈 Performance tracking and reporting
- 🔐 Role-based access control

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
- **@elevenlabs/elevenlabs-js** - Text-to-speech API integration
- **react-native-draggable-flatlist** - Drag-and-drop functionality
- **xlsx** - Excel file generation and parsing
- **expo-document-picker** - File selection
- **expo-image-picker** - Camera and gallery access

## 🚀 Quick Setup

### Prerequisites
- Node.js 18+ and npm
- Expo CLI (installed automatically)
- Firebase account (project already configured)

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
│       ├── questions: []
│       │   └── {
│       │       id: "E-XXX-0001-Q001",
│       │       question: "text",
│       │       imageUrl: "url",
│       │       correctAnswer: "...",
│       │       audioUrl: "url"
│       │   }
│       ├── createdAt
│       └── visibility
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
│   │   └── {questionId}_audio.mp3
│   └── thumbnail.png
│
/students/
└── {studentId}/
    └── avatar.png
```

### Data Flow Process

#### 1. **Exercise Creation Flow**
```
Teacher creates exercise
    ↓
Questions added with images
    ↓
Images uploaded to Firebase Storage
    ↓
Exercise saved to /exercises with image URLs
    ↓
Optional: TTS audio generated and uploaded
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
- Create and edit exercises
- Manage classes and students
- Assign exercises to classes
- View student results and analytics
- Generate parent login codes
- Send announcements to classes
- Export student data to Excel

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

**Current Version:** 1.0.3  
**Last Updated:** October 2025  
**Status:** Production Ready ✅
