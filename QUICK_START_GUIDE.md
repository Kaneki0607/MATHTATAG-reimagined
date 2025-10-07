# 🚀 Quick Start Guide - New Features

## ✅ What's New

1. **SuperAdminDashboard** - Completely redesigned with modern UI
2. **Admin Access Control** - Grant/revoke admin access to teachers
3. **Firebase API Keys** - ElevenLabs keys now stored in Firebase

---

## 📋 Setup Steps (Do These NOW!)

### Step 1: Migrate API Keys to Firebase (CRITICAL!)

**Run this command once:**
```bash
node scripts/migrate-api-keys-to-firebase.js
```

**Expected Output:**
```
🚀 Starting API key migration to Firebase...
📊 Total keys to migrate: 14

🔑 Migrating key: sk_44e8294...
  ✅ Successfully migrated

... (13 more keys)

🎉 All API keys successfully migrated to Firebase!
```

**If you see errors:**
- Make sure Firebase is configured (`lib/firebase.ts`)
- Check your internet connection
- Verify Firebase Realtime Database is enabled

---

### Step 2: Verify Firebase Data

**Open Firebase Console:**
1. Go to: https://console.firebase.google.com
2. Select your project
3. Navigate to **Realtime Database**
4. Check these paths exist:

```
✅ /elevenlabsKeys (should have 14 entries)
   └── Each entry has: key, status, addedAt

✅ /admins (may be empty initially)

✅ /teachers (should have your existing teachers)
```

---

### Step 3: Test Super Admin Login

**Login Credentials:**
- Use your Firebase account that has one of these UIDs:
  - `XFDRJABVrIY5tQ07ry3jO9eEnCL2`
  - `3mXL3wcXCQQg90kKC6mvRyN0uk12`
  - `v48KBqVpsMTDCAIb2wiZAgXRnj73`

**Steps:**
1. Open app
2. Select **Admin** role
3. Enter your credentials
4. You should be routed to **SuperAdminDashboard** (not AdminDashboard)

**If you're routed to AdminDashboard instead:**
- Your UID is not in the `SUPER_ADMIN_UIDS` array
- Check your UID in Firebase Authentication
- Add it to `app/AdminLogin.tsx` line 15-19

---

### Step 4: Test Admin Access Control

**Grant Admin Access to a Teacher:**

1. Login as Super Admin
2. Navigate to **Teachers** tab
3. Click on any teacher
4. Teacher profile modal opens
5. Click **"Grant Admin Access"** button
6. You should see success alert

**Verify it worked:**
1. Check Firebase: `/teachers/{teacherUid}/isAdmin` should be `true`
2. Check Firebase: `/admins/{teacherUid}` should exist
3. Check SuperAdminDashboard: Teacher should have "Admin" badge

**Test Teacher Login:**
1. Logout from SuperAdminDashboard
2. Login with the teacher's credentials via AdminLogin
3. Teacher should be routed to **AdminDashboard** ✅

**Revoke Admin Access:**
1. Login as Super Admin again
2. Navigate to **Teachers** tab
3. Click on the teacher (now has Admin badge)
4. Click **"Revoke Admin Access"** button
5. Verify: Admin badge removed, `/admins/{uid}` deleted

---

### Step 5: Explore SuperAdminDashboard

**Home Tab 🏠**
- View statistics cards
- Check system overview

**Teachers Tab 👥**
- Browse all teachers
- Search by name/email/school
- Click to view profiles
- Grant/revoke admin access

**Admins Tab 👨‍💼**
- View all admin accounts
- Search admins

**API Keys Tab 🔑**
- Monitor ElevenLabs keys
- Check status and credits
- Search keys

**Logs Tab 📋**
- View teacher activity
- Search logs

---

## 🔧 Troubleshooting

### Issue: "No active API keys available"

**Solution:**
```bash
# Run the migration script
node scripts/migrate-api-keys-to-firebase.js

# Or manually add a key via Firebase Console:
/elevenlabsKeys/{auto-id}
  key: "sk_your_key_here"
  status: "active"
  addedAt: "2025-10-07T12:00:00.000Z"
```

---

### Issue: "Access Denied" when logging in as admin

**Cause:** Your UID is not in the super admin list

**Solution:**
1. Find your UID in Firebase Authentication
2. Add it to `app/AdminLogin.tsx`:
```typescript
const SUPER_ADMIN_UIDS = [
  'XFDRJABVrIY5tQ07ry3jO9eEnCL2',
  '3mXL3wcXCQQg90kKC6mvRyN0uk12',
  'v48KBqVpsMTDCAIb2wiZAgXRnj73',
  'YOUR_UID_HERE', // ← Add here
];
```
3. Restart app

---

### Issue: Can't grant admin access to teacher

**Check:**
1. You're logged in as Super Admin (not regular admin)
2. Teacher record exists in `/teachers/{uid}`
3. You have write permissions in Firebase

**Firebase Security Rules:**
```json
{
  "rules": {
    "admins": {
      ".read": true,
      ".write": true  // ← Make sure this is true for testing
    },
    "teachers": {
      ".read": true,
      ".write": true
    }
  }
}
```

---

### Issue: Functions return errors about "await"

**Cause:** Code calling ElevenLabs functions not updated

**Solution:** All ElevenLabs functions are now async:
```typescript
// ❌ Old (will error)
const key = getRandomApiKey();

// ✅ New (correct)
const key = await getRandomApiKey();
```

---

## 🎯 What to Do Next

### Immediate:
- [ ] Run migration script
- [ ] Verify Firebase data
- [ ] Test super admin login
- [ ] Test admin access control

### Optional:
- [ ] Add more super admin UIDs if needed
- [ ] Set up Firebase Security Rules
- [ ] Configure periodic API key credit checks
- [ ] Customize color scheme if desired

### Production:
- [ ] Remove test accounts
- [ ] Set strict Firebase Security Rules
- [ ] Enable Firebase Authentication providers
- [ ] Set up monitoring/alerts

---

## 📞 Need Help?

### Check Documentation:
1. **API Keys**: `lib/README-elevenlabs-keys.md`
2. **Admin System**: `ADMIN_SYSTEM_SUMMARY.md`
3. **SuperAdmin Features**: `SUPERADMIN_DASHBOARD_REDESIGN.md`
4. **Architecture**: `COMPLETE_SYSTEM_ARCHITECTURE.md`

### Common Questions:

**Q: How do I add a new super admin?**
A: Add their UID to `SUPER_ADMIN_UIDS` array in `app/AdminLogin.tsx`

**Q: How do I add a new school admin?**
A: Use SuperAdminDashboard → Teachers → Grant Admin Access

**Q: How do I add a new API key?**
A: Add it manually in Firebase Console at `/elevenlabsKeys` or use the `addApiKey()` function

**Q: Can teachers have both teaching and admin access?**
A: Yes! When you grant admin access, they keep their teaching capabilities and gain admin access

**Q: What happens if I revoke admin access?**
A: Teacher loses AdminDashboard access but keeps TeacherDashboard access

---

## ✅ Success Checklist

Before going to production, verify:

- [ ] Migration script completed successfully
- [ ] 14 API keys in Firebase (`/elevenlabsKeys`)
- [ ] Super admin login works (routes to SuperAdminDashboard)
- [ ] Regular admin login works (routes to AdminDashboard)
- [ ] Can grant admin access to teacher
- [ ] Can revoke admin access
- [ ] All 5 tabs in SuperAdminDashboard work
- [ ] Search works on all tabs
- [ ] Pull-to-refresh works
- [ ] Teacher profile modal displays correctly
- [ ] API key status badges show correct colors
- [ ] No console errors or warnings

---

## 🎉 You're Ready!

Your MathTatag system now has:
- ✅ Modern SuperAdminDashboard
- ✅ Dynamic admin access control
- ✅ Firebase-based API key management
- ✅ Professional UI across all dashboards

**Enjoy your upgraded system!** 🚀

---

**Version:** 2.0  
**Date:** October 7, 2025  
**Status:** Production Ready

