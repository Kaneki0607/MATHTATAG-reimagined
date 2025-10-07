# Technical Reports System Documentation

## Overview

The Technical Reports System allows Teachers and Parents to report bugs, issues, or technical problems directly to the Admin. All reports are centralized in the Admin Dashboard under the **Reports** tab for easy monitoring and resolution.

## System Architecture

### 1. Report Submission Points

#### Parent Dashboard
- **Location**: Floating button (draggable headset icon)
- **Access**: Available on all sections of the Parent Dashboard
- **Features**:
  - Shake-to-activate on Reports tab (if implemented)
  - Draggable floating button for quick access
  - Report form with description and screenshots

#### Teacher Dashboard
- **Location**: Floating button (draggable headset icon)
- **Access**: Available on all sections of the Teacher Dashboard
- **Features**:
  - Draggable floating button for quick access
  - Report form with description and screenshots
  - Alert-based success/error notifications

### 2. Report Structure

```typescript
interface TechnicalReport {
  id: string;                              // Unique report ID (report_timestamp)
  reportedBy: string;                      // User ID (parentKey or teacherUid)
  reportedByEmail: string;                 // User email
  reportedByName?: string;                 // User full name (optional)
  userRole?: 'teacher' | 'parent' | 'admin'; // Reporter role
  timestamp: string;                       // ISO timestamp
  description: string;                     // Problem description
  screenshots: string[];                   // Array of screenshot URLs
  status: 'pending' | 'in_progress' | 'resolved'; // Report status
}
```

### 3. Firebase Database Path

All technical reports are stored at:
```
/technicalReports/{reportId}
```

### 4. Screenshot Storage Path

Screenshots are uploaded to Firebase Storage at:
```
technical-reports/{reportId}/screenshot_{index}.jpg
```

## Features

### Parent Dashboard Features

1. **Floating Report Button**
   - Draggable across the screen
   - Auto-fades after 3 seconds of inactivity
   - Fades back in on touch/movement
   - Headset icon for easy recognition

2. **Report Modal**
   - **Problem Description** (required)
     - Multi-line text input
     - Minimum: Description must not be empty
   
   - **Screenshots** (optional)
     - Up to 5 screenshots
     - Options: Take Photo or Choose from Gallery
     - Preview with remove option
     - Image compression (0.8 quality)

3. **Submission Process**
   - Validates description
   - Uploads screenshots to Firebase Storage
   - Creates report in Firebase Database
   - Shows success alert
   - Clears form after submission
   - Logs errors to Error Logging System

### Teacher Dashboard Features

1. **Floating Report Button**
   - Same draggable functionality as Parent Dashboard
   - Auto-fade behavior
   - Headset icon

2. **Report Modal**
   - **Problem Description** (required)
     - Multi-line text input
   
   - **Screenshots** (optional)
     - Up to 5 screenshots
     - Take Photo or Choose from Gallery
     - Preview and remove functionality

3. **Submission Process**
   - Validates description
   - Uploads screenshots
   - Creates report with teacher information
   - Shows custom alert (success/error)
   - Error logging integration

### Admin Dashboard Features

1. **Real-Time Updates**
   - Automatically updates when new reports are submitted
   - Uses Firebase real-time listeners
   - No manual refresh needed

2. **Technical Reports Display**
   - **Header Information**:
     - Total report count badge
     - Icon indicating report type
   
   - **Report Cards** showing:
     - **Reporter Information**:
       - Icon based on role (teacher/parent/admin)
       - Reporter name (or email if name unavailable)
       - Role badge (color-coded):
         - 🔵 Blue: Teacher
         - 🟣 Pink: Parent
         - 🟣 Purple: Admin
     
     - **Timestamp**: Formatted date and time
     
     - **Status Badge**:
       - 🟡 Yellow: Pending
       - 🔵 Blue: In Progress
       - 🟢 Green: Resolved
     
     - **Description**: Full problem description
     
     - **Screenshots** (if available):
       - Thumbnail previews
       - Horizontal scroll
       - Count indicator
     
     - **Action Buttons**:
       - **Mark as Done** (for pending/in-progress reports):
         - Updates status to 'resolved'
         - Green button with checkmark icon
         - Adds resolvedAt timestamp
       - **Remove** (for resolved reports only):
         - Permanently deletes the report
         - Red button with delete icon
         - Confirmation dialog before deletion

3. **Empty State**
   - "All Clear!" message
   - Green checkmark icon
   - Encouraging text

## User Flow

### For Parents

1. Parent encounters a technical issue
2. Taps the floating headset button (or shakes device on Reports tab)
3. Technical Report Modal opens
4. Parent describes the problem in detail
5. (Optional) Parent attaches screenshots:
   - Takes photo with camera
   - OR chooses from gallery
   - Can add up to 5 screenshots
   - Can remove unwanted screenshots
6. Taps "Submit Report"
7. System uploads screenshots to Firebase Storage
8. System creates report in Firebase Database
9. Success alert confirms submission
10. Modal closes and form resets
11. Admin receives report in real-time

### For Teachers

1. Teacher encounters a technical issue
2. Taps the floating headset button
3. Technical Report Modal opens
4. Teacher describes the problem
5. (Optional) Attaches screenshots (same as parents)
6. Taps "Submit Report"
7. System processes and uploads
8. Custom alert shows success
9. Modal closes and resets
10. Admin receives report immediately

### For Admins

1. Admin navigates to Reports tab
2. Technical Reports section shows all reports in real-time
3. For each report, Admin can view:
   - Who reported (name and role badge)
   - When it was reported (timestamp)
   - Current status (pending/in-progress/resolved)
   - Full description
   - All attached screenshots (if any)
4. Admin takes action:
   - **For Pending/In-Progress Reports**:
     - Clicks "Mark as Done" button
     - Report status updates to 'resolved'
     - Button changes to "Remove"
   - **For Resolved Reports**:
     - Clicks "Remove" button
     - Confirmation dialog appears
     - Admin confirms deletion
     - Report is permanently removed from database
5. All changes sync in real-time across all admin sessions

## Visual Design

### Role Badges
- **Teacher**: Light blue background (#dbeafe)
- **Parent**: Light pink background (#fce7f3)
- **Admin**: Light purple background (#f3e8ff)

### Status Badges
- **Pending**: Amber/Orange (#f59e0b)
- **In Progress**: Blue (#3b82f6)
- **Resolved**: Green (#10b981)

### Icons
- **Teacher**: account-tie (MaterialCommunityIcons)
- **Parent**: account-heart (MaterialCommunityIcons)
- **Admin**: account-circle (MaterialCommunityIcons)

## Error Handling

All three dashboards integrate with the Error Logging System:

### Parent Dashboard
```typescript
catch (error) {
  console.error('Error submitting report:', error);
  if (error instanceof Error) {
    logErrorWithStack(error, 'error', 'ParentDashboard', 'Failed to submit technical report');
  } else {
    logError('Failed to submit technical report: ' + String(error), 'error', 'ParentDashboard');
  }
  Alert.alert('Error', 'Failed to submit report. Please try again later.');
}
```

### Teacher Dashboard
```typescript
catch (error) {
  console.error('Error submitting report:', error);
  if (error instanceof Error) {
    logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to submit technical report');
  } else {
    logError('Failed to submit technical report: ' + String(error), 'error', 'TeacherDashboard');
  }
  showAlert('Error', 'Failed to submit report. Please try again.', undefined, 'error');
}
```

### Admin Dashboard
- Real-time listener errors are logged
- Failed data fetches are handled gracefully
- Empty states shown when no data available

## Security & Privacy

1. **Authentication Required**
   - Only authenticated users can submit reports
   - Reporter information automatically captured

2. **Data Validation**
   - Description required (cannot be empty)
   - Screenshot limit enforced (max 5)
   - Image compression applied (0.8 quality)
   - Null safety checks on all data fields

3. **Storage**
   - Screenshots stored in Firebase Storage with proper paths
   - Report data stored in Firebase Realtime Database
   - Each report has unique ID with timestamp
   - Deletion confirmation required for safety

4. **Access Control**
   - Only Admins can view all technical reports
   - Only Admins can mark reports as done
   - Only Admins can remove reports
   - Parents/Teachers can only submit reports
   - Status updates restricted to Admins

5. **Data Integrity**
   - Default values ensure no crashes:
     - `screenshots` defaults to empty array `[]`
     - `status` defaults to `'pending'`
   - Graceful error handling throughout
   - Real-time sync keeps data consistent

## Best Practices

### For Users (Parents/Teachers)

1. **Be Descriptive**
   - Explain what you were trying to do
   - Describe what happened instead
   - Include any error messages you saw

2. **Include Screenshots**
   - Show the error or unexpected behavior
   - Capture relevant context
   - Multiple screenshots help diagnose issues

3. **One Issue Per Report**
   - Submit separate reports for different issues
   - Makes tracking and resolution easier

### For Admins

1. **Regular Monitoring**
   - Check Technical Reports section daily
   - Prioritize critical errors
   - Review new reports as they arrive

2. **Status Management**
   - **Mark as Done**: Click to mark pending/in-progress reports as resolved
   - **Remove**: Delete resolved reports to keep the list clean
   - Use confirmation dialog to prevent accidental deletions

3. **Workflow**
   - Review new report (status: pending)
   - Investigate the issue
   - Fix the problem
   - Click "Mark as Done" (status changes to resolved)
   - Once verified fixed, click "Remove" to delete from list

4. **Pattern Recognition**
   - Look for repeated issues
   - Identify common problems from specific users
   - Proactively address systemic issues

## Troubleshooting

### Reports Not Appearing in Admin Dashboard

**Possible Causes:**
1. Firebase connection issue
2. Real-time listener not set up
3. Reports tab not active

**Solutions:**
1. Check Firebase connection
2. Navigate to Reports tab to activate listeners
3. Pull to refresh

### Cannot Submit Report

**Possible Causes:**
1. Empty description
2. No internet connection
3. Firebase permissions issue

**Solutions:**
1. Ensure description is filled out
2. Check internet connection
3. Verify Firebase rules allow writes to /technicalReports

### Screenshots Not Uploading

**Possible Causes:**
1. File too large
2. Storage permissions issue
3. Network timeout

**Solutions:**
1. Images are compressed to 0.8 quality automatically
2. Check Firebase Storage rules
3. Retry with better connection

### Floating Button Not Visible

**Possible Causes:**
1. Button faded out due to inactivity
2. Button moved off-screen

**Solutions:**
1. Tap or drag anywhere - button will fade back in
2. Button is constrained to screen bounds automatically

## Implementation Details

### Admin Actions

#### Mark Report as Done
```typescript
const handleMarkReportAsDone = async (reportId: string) => {
  const { success } = await updateData(`/technicalReports/${reportId}`, {
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
  });

  if (success) {
    // Updates local state immediately (real-time sync also updates)
    setTechnicalReports(prev => 
      prev.map(report => 
        report.id === reportId ? { ...report, status: 'resolved' } : report
      )
    );
    Alert.alert('Success', 'Technical report marked as resolved.');
  }
};
```

#### Remove Report
```typescript
const handleRemoveReport = async (reportId: string) => {
  Alert.alert(
    'Remove Report',
    'Are you sure you want to permanently remove this technical report?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { success } = await deleteData(`/technicalReports/${reportId}`);
          if (success) {
            setTechnicalReports(prev => prev.filter(report => report.id !== reportId));
            Alert.alert('Success', 'Technical report removed.');
          }
        }
      }
    ]
  );
};
```

### Floating Button Behavior

```typescript
// Auto-fade after 3 seconds
const inactivityTimer = setTimeout(() => {
  fadeOutFloatingButton();
}, 3000);

// Fade in on interaction
const resetInactivityTimer = () => {
  clearTimeout(inactivityTimer);
  fadeInFloatingButton();
  // Set new timer
};

// Keep within screen bounds
const maxX = width - buttonSize - padding;
const maxY = height - buttonSize - padding;
```

### Real-Time Listener (Admin Dashboard)

```typescript
useEffect(() => {
  if (activeTab === 'reports') {
    const unsubscribe = listenToData('/technicalReports', (data) => {
      if (data) {
        const reportsList = Object.entries(data)
          .map(([id, reportData]) => ({ id, ...reportData }))
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setTechnicalReports(reportsList);
      } else {
        setTechnicalReports([]);
      }
    });

    return () => {
      stopListening('/technicalReports');
    };
  }
}, [activeTab]);
```

## Admin Workflow Example

### Complete Resolution Workflow

```
1. NEW REPORT ARRIVES
   ┌─────────────────────────────────────┐
   │ 📧 Technical Report                 │
   │ From: Teacher John (Teacher)        │
   │ Status: 🟡 Pending                  │
   │ Description: Login button not work  │
   │ Screenshots: 2 attached             │
   │                                     │
   │ [Mark as Done]                      │
   └─────────────────────────────────────┘

2. ADMIN CLICKS "MARK AS DONE"
   ┌─────────────────────────────────────┐
   │ 📧 Technical Report                 │
   │ From: Teacher John (Teacher)        │
   │ Status: 🟢 Resolved                 │
   │ Description: Login button not work  │
   │ Screenshots: 2 attached             │
   │ Resolved: Oct 7, 2025 2:30 PM      │
   │                                     │
   │ [Remove]                            │
   └─────────────────────────────────────┘

3. ADMIN CLICKS "REMOVE"
   ┌─────────────────────────────────┐
   │  Remove Report                  │
   │                                 │
   │  Are you sure you want to       │
   │  permanently remove this        │
   │  technical report?              │
   │                                 │
   │  [Cancel]  [Remove]             │
   └─────────────────────────────────┘

4. REPORT DELETED
   ✅ Report removed from database
   ✅ Real-time update removes from UI
   ✅ Success message shown
```

## Future Enhancements

Potential improvements:
1. **Email Notifications**: Notify admins when new reports arrive
2. **In-App Notifications**: Alert admins of new reports
3. **Priority Levels**: Users can mark severity (low/medium/high/critical)
4. **Comments/Notes**: Admins can add notes to reports
5. **Resolution Details**: Admins can describe how issue was fixed
6. **User Notifications**: Notify users when their report is resolved
7. **Report Categories**: Tag reports (bug, feature request, question, etc.)
8. **Search & Filter**: Search reports by user, date, status, etc.
9. **Export Reports**: Download reports as PDF or CSV
10. **Analytics**: Track common issues, resolution times, etc.

## Summary

The Technical Reports System provides a seamless way for Teachers and Parents to report issues directly to Admins. With:
- **Easy Access**: Floating button available everywhere
- **Rich Reports**: Descriptions and screenshots
- **Real-Time Updates**: Admins see reports instantly
- **Role Identification**: Clear badges showing who reported
- **Status Tracking**: Monitor resolution progress
- **Error Logging**: All failures tracked for debugging

This ensures Admins can quickly identify, prioritize, and resolve technical issues to maintain a smooth user experience across the platform.

