# MathTatag Complete System Architecture

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MATHTATAG SYSTEM                         │
│                     (React Native)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
                   ┌────────────────┐
                   │  RoleSelection │
                   │    Screen      │
                   └────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ↓                ↓                ↓
    ┌──────────┐     ┌───────────┐    ┌──────────┐
    │  Parent  │     │  Teacher  │    │  Admin   │
    │  Login   │     │   Login   │    │  Login   │
    └──────────┘     └───────────┘    └──────────┘
           │                │                 │
           ↓                ↓                 ↓
    ┌──────────┐     ┌───────────┐    ┌────────────────┐
    │  Parent  │     │  Teacher  │    │ UID Check      │
    │Dashboard │     │ Dashboard │    │ Super Admin?   │
    └──────────┘     └───────────┘    └────────────────┘
                                              │
                                   ┌──────────┴──────────┐
                                   │ YES         │ NO    │
                                   ↓             ↓       
                          ┌─────────────┐  ┌──────────┐
                          │SuperAdmin   │  │  Admin   │
                          │Dashboard    │  │Dashboard │
                          └─────────────┘  └──────────┘
```

## 👥 User Roles & Hierarchy

### 1. **Super Admin** (Developers) 🔧
- **Login**: AdminLogin.tsx
- **Dashboard**: SuperAdminDashboard.tsx
- **Access Level**: Highest - Full system control
- **Capabilities**:
  - View all users (teachers, admins, parents)
  - Monitor ElevenLabs API keys
  - View teacher activity logs
  - **Grant/Revoke admin access to teachers**
  - System-wide monitoring and analytics

### 2. **Regular Admin** (School Admins) 🏫
- **Login**: AdminLogin.tsx
- **Dashboard**: AdminDashboard.tsx
- **Access Level**: High - School management
- **Capabilities**:
  - Manage teachers (verify, block, unblock, remove)
  - View teacher statistics
  - Send announcements to parents
  - Cannot grant admin access

### 3. **Teacher** 👨‍🏫
- **Login**: TeacherLogin.tsx
- **Dashboard**: TeacherDashboard.tsx
- **Access Level**: Medium - Teaching functions
- **Capabilities**:
  - Create exercises
  - Manage students and sections
  - View student progress
  - If granted admin access → Can also access AdminDashboard

### 4. **Parent** 👨‍👩‍👧
- **Login**: ParentLogin.tsx
- **Dashboard**: ParentDashboard.tsx
- **Access Level**: Low - View child progress
- **Capabilities**:
  - View child's progress
  - View announcements
  - Monitor student activity

## 🔐 Access Control Matrix

| Feature | Super Admin | Admin | Teacher | Parent |
|---------|-------------|-------|---------|--------|
| **View All Teachers** | ✅ | ✅ | ❌ | ❌ |
| **View All Admins** | ✅ | ❌ | ❌ | ❌ |
| **Grant Admin Access** | ✅ | ❌ | ❌ | ❌ |
| **Verify Teachers** | ❌ | ✅ | ❌ | ❌ |
| **Block Teachers** | ❌ | ✅ | ❌ | ❌ |
| **View API Keys** | ✅ | ❌ | ❌ | ❌ |
| **View Logs** | ✅ | ❌ | ❌ | ❌ |
| **Create Announcements** | ❌ | ✅ | ❌ | ❌ |
| **Create Exercises** | ❌ | ❌ | ✅ | ❌ |
| **Manage Students** | ❌ | ❌ | ✅ | ❌ |
| **View Child Progress** | ❌ | ❌ | ❌ | ✅ |

## 🗄️ Firebase Database Structure

```
Firebase Realtime Database
├── /admins
│   └── {uid}
│       ├── email: string
│       ├── firstName: string
│       ├── lastName: string
│       ├── isAdmin: boolean
│       ├── grantedBy: string
│       └── createdAt: string
│
├── /teachers
│   └── {uid}
│       ├── email: string
│       ├── firstName: string
│       ├── lastName: string
│       ├── school: string
│       ├── phone: string
│       ├── gender: string
│       ├── profilePictureUrl: string
│       ├── isVerified: boolean
│       ├── isBlocked: boolean
│       ├── isAdmin: boolean ⭐ NEW
│       ├── adminGrantedAt: string
│       ├── adminRevokedAt: string
│       └── createdAt: string
│
├── /parents
│   └── {uid}
│       ├── email: string
│       ├── name: string
│       └── createdAt: string
│
├── /students
│   └── {studentId}
│       ├── name: string
│       ├── classId: string
│       ├── teacherId: string
│       ├── parentId: string
│       └── createdAt: string
│
├── /sections
│   └── {sectionId}
│       ├── name: string
│       ├── teacherId: string
│       ├── students: array
│       └── createdAt: string
│
├── /exercises
│   └── {exerciseId}
│       ├── title: string
│       ├── teacherId: string
│       ├── questions: array
│       └── createdAt: string
│
├── /announcements
│   └── {announcementId}
│       ├── title: string
│       ├── message: string
│       ├── teacherId: string
│       ├── classIds: array
│       └── dateTime: string
│
├── /teacherLogs
│   └── {logId}
│       ├── message: string
│       ├── timestamp: string
│       └── teacherId: string
│
└── /elevenlabsKeys ⭐ NEW
    └── {keyId}
        ├── key: string
        ├── status: 'active'|'low_credits'|'expired'|'failed'
        ├── creditsRemaining: number
        ├── addedAt: string
        └── lastUsed: string
```

## 🔄 Admin Access Flow

### Teacher → Admin Promotion Flow

```
┌──────────────────────────────────────────────────────┐
│ Super Admin wants to grant admin access to teacher   │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 1. Super Admin logs in (SuperAdminDashboard)        │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 2. Navigate to Teachers tab                          │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 3. Click on teacher card                             │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 4. Teacher profile modal opens                       │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 5. Click "Grant Admin Access" button                 │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 6. Firebase Updates:                                 │
│    • /teachers/{uid}/isAdmin = true                  │
│    • /teachers/{uid}/adminGrantedAt = timestamp      │
│    • CREATE /admins/{uid} with teacher data          │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 7. Success! Teacher now has admin access             │
└──────────────────────────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│ 8. Teacher can login via AdminLogin                  │
│    • Not in SUPER_ADMIN_UIDS → AdminDashboard       │
│    • Can manage teachers at their school             │
└──────────────────────────────────────────────────────┘
```

### Login Routing Logic

```javascript
// AdminLogin.tsx

User enters email/password
        ↓
Firebase Authentication
        ↓
Get user.uid
        ↓
┌────────────────────────────────┐
│ Is uid in SUPER_ADMIN_UIDS?   │
└────────────────────────────────┘
        │
        ├─── YES ──→ SuperAdminDashboard (Full access)
        │
        └─── NO ──→ AdminDashboard (School admin)
```

## 📁 File Structure

```
app/
├── _layout.tsx
├── index.tsx
├── RoleSelection.tsx
│
├── ParentLogin.tsx          → ParentDashboard.tsx
├── TeacherLogin.tsx         → TeacherDashboard.tsx
└── AdminLogin.tsx           → SuperAdminDashboard.tsx (if super admin)
                             → AdminDashboard.tsx (if regular admin)

components/
├── TermsAndConditions.tsx
└── AssignExerciseForm.tsx

lib/
├── firebase.ts
├── firebase-auth.ts
├── firebase-database.ts
├── firebase-storage.ts
├── elevenlabs-keys.ts ⭐ NEW (Firebase-based)
└── terms-utils.ts
```

## 🎯 Key Features by Dashboard

### SuperAdminDashboard (Developers)

**Tabs:**
1. **Home** - Statistics and overview
2. **Teachers** - Manage all teachers + grant/revoke admin
3. **Admins** - View all admin accounts
4. **API Keys** - Monitor ElevenLabs keys
5. **Logs** - Teacher activity logs

**Unique Features:**
- ✅ Grant/Revoke admin access
- ✅ View all admins
- ✅ Monitor API keys
- ✅ View activity logs
- ✅ System-wide statistics

### AdminDashboard (School Admins)

**Tabs:**
1. **Home** - Welcome + announcements
2. **Teacher** - Manage active teachers
3. **Blocklist** - Blocked teachers
4. **Reports** - (Placeholder)

**Unique Features:**
- ✅ Verify teachers
- ✅ Block/Unblock teachers
- ✅ Remove teachers permanently
- ✅ Send announcements to parents
- ✅ View teacher statistics

### TeacherDashboard (Teachers)

**Features:**
- Create and manage exercises
- Manage students and sections
- View student progress
- Assign exercises
- If admin access granted → Can also access AdminDashboard

### ParentDashboard (Parents)

**Features:**
- View child's progress
- View announcements
- Monitor student activity

## 🔧 Configuration

### Super Admin UIDs (Hardcoded)

```typescript
// app/AdminLogin.tsx

const SUPER_ADMIN_UIDS = [
  'XFDRJABVrIY5tQ07ry3jO9eEnCL2',
  '3mXL3wcXCQQg90kKC6mvRyN0uk12',
  'v48KBqVpsMTDCAIb2wiZAgXRnj73',
];
```

**To add new super admin:**
1. Get Firebase UID
2. Add to array above
3. Redeploy app

### Regular Admin Access (Firebase-based)

**To make a teacher an admin:**
1. Super admin uses SuperAdminDashboard
2. Navigate to Teachers → Click teacher
3. "Grant Admin Access"
4. No code deployment needed!

## 🎨 UI Design System

### Color Scheme

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary Blue** | `#0ea5e9` | Active states, links |
| **Success Green** | `#10b981` | Verified, active |
| **Warning Orange** | `#f59e0b` | Pending, low credits |
| **Error Red** | `#ef4444` | Blocked, failed |
| **Admin Purple** | `#8b5cf6` | Admin badges |
| **Dark Gray** | `#1e293b` | Primary text |
| **Medium Gray** | `#64748b` | Secondary text |
| **Light Gray** | `#f1f5f9` | Backgrounds |

### Components

- **Cards**: White, rounded (20px), shadows
- **Badges**: Pills with icons, color-coded
- **Buttons**: Rounded (16px), with shadows
- **Avatars**: Circular, bordered
- **Bottom Nav**: Fixed, 5 tabs max

## 🚀 Data Flow Examples

### Example 1: Teacher Gets Admin Access

```
1. Teacher exists in /teachers/{teacherUid}
   isAdmin: false

2. Super Admin grants access via SuperAdminDashboard

3. Firebase updates:
   /teachers/{teacherUid}
     isAdmin: true ⭐
     adminGrantedAt: "2025-10-07T12:00:00Z"

4. Firebase creates:
   /admins/{teacherUid} ⭐ NEW
     email: teacher@school.com
     firstName: "John"
     lastName: "Doe"
     isAdmin: true
     grantedBy: "superadmin"
     createdAt: "2025-10-07T12:00:00Z"

5. Teacher logs in via AdminLogin
   → Not in SUPER_ADMIN_UIDS
   → Routed to AdminDashboard ✅

6. Teacher can now:
   - Verify other teachers
   - Block/unblock teachers
   - Send announcements
   - Still access TeacherDashboard
```

### Example 2: API Key Management

```
1. Super Admin navigates to API Keys tab

2. Fetches data from /elevenlabsKeys

3. Displays all keys with:
   - Partial key (first 15 chars)
   - Status badge (color-coded)
   - Credits remaining
   - Last used timestamp

4. Search functionality filters keys

5. Pull-to-refresh updates data
```

## 📊 Analytics & Monitoring

### Available Metrics

**SuperAdminDashboard Home:**
- Total Teachers
- Total Admins
- Total API Keys
- Total Logs
- Verified Teachers
- Pending Teachers
- Blocked Teachers
- Teachers with Admin Access
- Active API Keys

**AdminDashboard Home:**
- Total Teachers
- Sections per teacher
- Students per teacher

## 🔒 Security Best Practices

### Authentication
- All dashboards require Firebase Authentication
- Email verification required for teachers
- No verification for admins (trusted users)

### Authorization
- Super Admin UIDs hardcoded in app
- Admin access stored in Firebase
- Teachers can't self-promote
- Parents can only view own children

### Data Protection
- Firebase Security Rules should enforce permissions
- Admin operations logged with timestamps
- API keys partially hidden in UI

## 📝 Summary

**System Hierarchy:**
```
Super Admin (Developers)
    └── Admin (School Admins)
        └── Teacher (with/without admin access)
            └── Parent
```

**Key Innovation:**
- ⭐ **Dynamic Admin Access**: Teachers can be promoted/demoted without code changes
- ⭐ **Firebase-based API Keys**: No hardcoded keys in codebase
- ⭐ **Modern UI**: Consistent design across all dashboards
- ⭐ **Flexible Roles**: Teachers can have dual access (Teacher + Admin)

---

**Version:** 2.0  
**Last Updated:** October 7, 2025  
**Status:** ✅ Production Ready

