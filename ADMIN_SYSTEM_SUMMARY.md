# Admin System Summary

## Overview

The MathTatag system has **two types of admins** with different access levels and dashboards:

### 1. **Super Admins (Developers)** 🔧
- **Who:** System developers and technical administrators
- **Dashboard:** `SuperAdminDashboard.tsx`
- **Access Level:** Full system access, including:
  - View all admins
  - View all teachers (verified, pending, blocked)
  - View teacher activity logs
  - Manage ElevenLabs API keys
  - Monitor system-wide statistics

### 2. **Regular Admins (School Admins)** 🏫
- **Who:** School administrators and educational staff
- **Dashboard:** `AdminDashboard.tsx`
- **Access Level:** School management access, including:
  - Manage teachers (verify, block, unblock, remove)
  - View teacher profiles and statistics
  - Create announcements for parents
  - Manage teacher sections and students

## Login Flow

### Entry Point: `AdminLogin.tsx`

```
User logs in with email/password
          ↓
   Check UID against SUPER_ADMIN_UIDS array
          ↓
    ┌─────────────────┐
    │ Is Super Admin? │
    └─────────────────┘
           ↓
    YES ←─┴─→ NO
     ↓          ↓
SuperAdmin   Regular Admin
Dashboard    Dashboard
```

### Current Super Admin UIDs

```typescript
const SUPER_ADMIN_UIDS = [
  'XFDRJABVrIY5tQ07ry3jO9eEnCL2', // Super admin 1
  '3mXL3wcXCQQg90kKC6mvRyN0uk12', // Super admin 2
  'v48KBqVpsMTDCAIb2wiZAgXRnj73', // Super admin 3
];
```

## Dashboard Comparison

| Feature | Super Admin Dashboard | Regular Admin Dashboard |
|---------|----------------------|------------------------|
| **File** | `SuperAdminDashboard.tsx` | `AdminDashboard.tsx` |
| **UI Style** | ✅ Tabbed Navigation | ✅ Tabbed Navigation |
| **View All Admins** | ✅ Yes | ❌ No |
| **View All Teachers** | ✅ Yes | ✅ Yes |
| **Verify Teachers** | ❌ No | ✅ Yes |
| **Block/Unblock Teachers** | ❌ No | ✅ Yes |
| **Grant/Revoke Admin Access** | ✅ Yes (NEW!) | ❌ No |
| **View Teacher Logs** | ✅ Yes | ❌ No |
| **Manage API Keys** | ✅ Yes (Monitor) | ❌ No |
| **Create Announcements** | ❌ No | ✅ Yes |
| **Search & Filters** | ✅ All Tabs | ✅ Advanced |
| **Statistics Dashboard** | ✅ Yes | ✅ Limited |

## SuperAdminDashboard Features

### Tabs (NEW UI - Matches AdminDashboard):

1. **Home** 🏠
   - Welcome header with super admin info
   - **Statistics Cards**:
     - Total Teachers
     - Total Admins
     - Total API Keys
     - Total Logs
   - **System Overview**:
     - Verified Teachers count
     - Pending Teachers count
     - Blocked Teachers count
     - Teachers with Admin Access count
     - Active API Keys count

2. **Teachers** 👥
   - **Full List** of all teachers with search
   - **Teacher Cards** showing:
     - Profile picture/avatar
     - Name, Email, School
     - Status badges (Verified, Blocked, Admin)
   - **Click to View** detailed profile
   - **Grant/Revoke Admin Access** (NEW!)
     - Teachers can be promoted to school admins
     - Teachers can have admin access revoked
     - Automatic admin record creation in `/admins`

3. **Admins** 👨‍💼
   - List of all admin accounts
   - Shows: Name, Email, Join date
   - Admin badge indicator
   - Searchable

4. **API Keys** 🔑
   - List of all ElevenLabs API keys
   - Shows: 
     - Partial key (first 15 characters)
     - Status (active/low_credits/expired/failed)
     - Credits remaining
     - Last used timestamp
   - Color-coded status badges
   - Searchable

5. **Logs** 📋
   - Latest 300 teacher activity logs
   - Shows: Timestamp, Message, Teacher ID
   - Searchable
   - Real-time monitoring

### Key Features:
- 🎨 **Modern UI**: Matches AdminDashboard design with tabs
- 🔍 **Search**: Available on all tabs (Teachers, Admins, API Keys, Logs)
- 🔄 **Pull-to-Refresh**: Swipe down to refresh data
- 👨‍💼 **Admin Access Control**: Grant/revoke admin privileges to teachers
- 📊 **Statistics Dashboard**: Quick overview on Home tab
- 🎯 **Teacher Profiles**: Detailed view with admin access management
- 🔑 **API Key Monitoring**: Real-time status of ElevenLabs keys

## AdminDashboard Features

### Tabs:
1. **Home** 🏠
   - Welcome header
   - Create announcements for parents
   - Teachers overview with statistics
   - Shows sections & student counts per teacher

2. **Teacher Management** 👥
   - Active (unblocked) teachers list
   - Search by name, email, or school
   - Filter: All, Verified, Pending
   - Actions: View profile, Verify

3. **Blocklist** 🚫
   - Blocked teachers list
   - Actions: Unblock, Remove permanently

4. **Reports** 📊
   - Placeholder (intentionally blank)

### Key Features:
- ✅ **Teacher Verification**: Approve new teacher accounts
- 🚫 **Block/Unblock**: Manage teacher access
- 🗑️ **Remove**: Permanently delete teacher accounts
- 📢 **Announcements**: Send messages to all parents
- 🔍 **Search & Filter**: Find teachers quickly
- 📊 **Statistics**: View teacher sections & student counts

## Admin Access Control (NEW!)

Super Admins can now grant or revoke admin access to teachers through the SuperAdminDashboard.

### How It Works:

#### Grant Admin Access to a Teacher:
1. Open **SuperAdminDashboard** → **Teachers** tab
2. Click on a teacher to open their profile
3. Click **"Grant Admin Access"** button
4. System automatically:
   - Updates teacher record: `isAdmin: true`
   - Creates admin record at `/admins/{teacherUid}`
   - Teacher can now login via AdminLogin and access AdminDashboard

#### Revoke Admin Access:
1. Open teacher profile with admin access
2. Click **"Revoke Admin Access"** button
3. System automatically:
   - Updates teacher record: `isAdmin: false`
   - Removes admin record from `/admins/{teacherUid}`
   - Teacher loses access to AdminDashboard

### Firebase Changes:

**When granting admin access:**
```
/teachers/{uid}
  ├── isAdmin: true
  └── adminGrantedAt: "2025-10-07T12:00:00Z"

/admins/{uid}  (NEW)
  ├── email: "teacher@example.com"
  ├── firstName: "John"
  ├── lastName: "Doe"
  ├── isAdmin: true
  ├── grantedBy: "superadmin"
  └── createdAt: "2025-10-07T12:00:00Z"
```

**When revoking admin access:**
```
/teachers/{uid}
  ├── isAdmin: false
  └── adminRevokedAt: "2025-10-07T12:00:00Z"

/admins/{uid}  (DELETED)
```

### Use Cases:

**Promote Teacher to School Admin:**
- Teacher manages their school's teachers
- Teacher can verify/block other teachers
- Teacher can send announcements to parents
- Teacher retains teaching capabilities

**Demote School Admin to Teacher:**
- Removes admin dashboard access
- User can still access TeacherDashboard
- Useful for role changes or access control

## How to Add New Super Admins

1. Get the user's Firebase UID
2. Open `app/AdminLogin.tsx`
3. Add UID to the `SUPER_ADMIN_UIDS` array:

```typescript
const SUPER_ADMIN_UIDS = [
  'XFDRJABVrIY5tQ07ry3jO9eEnCL2',
  '3mXL3wcXCQQg90kKC6mvRyN0uk12',
  'v48KBqVpsMTDCAIb2wiZAgXRnj73',
  'NEW_UID_HERE', // ← Add new UID
];
```

4. Save and redeploy

## How to Create Regular Admins

Regular admins are any authenticated users who are NOT in the `SUPER_ADMIN_UIDS` array.

**To create a new school admin:**
1. Create a Firebase Authentication account
2. Login via `AdminLogin.tsx`
3. They will automatically be routed to `AdminDashboard.tsx`

**No special configuration needed!** Just ensure they have Firebase credentials.

## Security Notes

### Super Admin Access
- ⚠️ **Hardcoded UIDs**: Super admin access is determined by UIDs in code
- 🔒 **Code-level Security**: Requires code deployment to add/remove super admins
- 👨‍💻 **Developer Only**: Only developers with codebase access can modify

### Regular Admin Access
- 🔓 **Firebase Auth**: Any authenticated user can access AdminDashboard
- ⚠️ **Consider Adding Validation**: May want to add admin flag in Firebase
- 💡 **Recommendation**: Store admin status in `/admins/{uid}` in Firebase

### Recommended Enhancement

Add Firebase-based admin validation:

```typescript
// In AdminLogin.tsx, after successful login:
const { data: adminData } = await readData(`/admins/${user.uid}`);
if (!adminData || !adminData.isAdmin) {
  Alert.alert('Access Denied', 'You do not have admin privileges.');
  return;
}
```

## Firebase Data Structure

```
/admins
  ├── {uid}
  │   ├── email: string
  │   ├── firstName: string
  │   ├── lastName: string
  │   └── createdAt: string

/teachers
  ├── {uid}
  │   ├── email: string
  │   ├── firstName: string
  │   ├── lastName: string
  │   ├── school: string
  │   ├── isVerified: boolean
  │   ├── isBlocked: boolean
  │   ├── isAdmin: boolean (NEW - grants admin access)
  │   ├── adminGrantedAt: string (optional)
  │   ├── adminRevokedAt: string (optional)
  │   └── ...

/teacherLogs
  ├── {logId}
  │   ├── message: string
  │   ├── timestamp: string
  │   └── teacherId: string

/elevenlabsKeys
  ├── {keyId}
  │   ├── key: string
  │   ├── status: 'active' | 'low_credits' | 'expired' | 'failed'
  │   ├── creditsRemaining: number
  │   ├── addedAt: string
  │   └── lastUsed: string
```

## Files Overview

| File | Purpose | Users |
|------|---------|-------|
| `AdminLogin.tsx` | Single login for all admins | All admins |
| `SuperAdminDashboard.tsx` | System monitoring & API key management | Developers only |
| `AdminDashboard.tsx` | School & teacher management | School admins |

## Summary

✅ **Super Admins** = Developers with full system access  
✅ **Regular Admins** = School administrators with teacher management access  
✅ **Single Login** = Both use `AdminLogin.tsx`, routed based on UID  
✅ **Extensible** = Easy to add new super admins by updating UID array  

---

**Last Updated:** October 7, 2025  
**Version:** 2.0

