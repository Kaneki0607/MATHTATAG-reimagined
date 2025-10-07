# Error Logging System Documentation

## Overview

A comprehensive error logging system has been implemented to automatically track and monitor all errors, warnings, and informational logs across the Teacher Dashboard and Parent Dashboard. The Admin Dashboard now displays these logs in real-time with advanced filtering and search capabilities.

## System Architecture

### 1. Error Logger Utility (`lib/error-logger.ts`)

A centralized logging utility that provides:

#### Key Functions

- **`logError(message, severity, source, metadata)`**
  - Logs errors, warnings, or info messages to Firebase
  - Automatically captures user context (userId, email)
  - Supports additional metadata for debugging
  - Severity levels: `'error'`, `'warning'`, `'info'`
  - Sources: `'TeacherDashboard'`, `'ParentDashboard'`, `'AdminDashboard'`, `'StudentExercise'`, `'System'`

- **`logErrorWithStack(error, severity, source, additionalContext)`**
  - Logs errors with full stack traces
  - Ideal for caught exceptions
  - Automatically extracts error name and message

- **`withErrorLogging(fn, source, context)`**
  - Wrapper function that automatically logs any errors thrown by async functions
  - Useful for wrapping critical operations

- **`logUserAction(action, source, metadata)`**
  - Logs user actions for audit trail
  - Uses 'info' severity level

#### Log Data Structure

```typescript
interface ErrorLogData {
  id: string;              // Unique log identifier
  timestamp: string;       // ISO timestamp
  message: string;         // Error/warning/info message
  severity: LogSeverity;   // 'error' | 'warning' | 'info'
  source?: LogSource;      // Dashboard source
  userId?: string;         // User ID who triggered the log
  userEmail?: string;      // User email
  stackTrace?: string;     // Error stack trace (if available)
  metadata?: Record<string, any>; // Additional context
}
```

### 2. Teacher Dashboard Integration

Error logging has been integrated into critical operations:

- **Student & Parent Loading**: Logs errors when failing to load student/parent data
- **Assignment Loading**: Tracks failures in loading assignments
- **Analytics Loading**: Monitors errors in class analytics computation
- **Exercise Operations**: 
  - Delete exercise failures
  - Copy exercise failures
  - Edit exercise failures

Example integration:
```typescript
try {
  await deleteExercise(exerciseId);
  showAlert('Success', 'Exercise deleted successfully');
} catch (error) {
  showAlert('Error', 'Failed to delete exercise');
  if (error instanceof Error) {
    logErrorWithStack(error, 'error', 'TeacherDashboard', 'Failed to delete exercise');
  } else {
    logError('Failed to delete exercise: ' + String(error), 'error', 'TeacherDashboard');
  }
}
```

### 3. Parent Dashboard Integration

Error logging captures:

- **Parent Data Loading**: Errors when loading parent profile data
- **Teacher Data Loading**: Warnings when failing to load teacher information for announcements
- **Announcement Loading**: Errors in fetching announcements
- **Mark as Read**: Warnings when failing to mark announcements as read

### 4. Admin Dashboard - Error Logs Section

The Admin Dashboard's **Reports** tab now features:

#### Real-Time Updates
- Automatically updates when new logs are added to Firebase
- Uses Firebase real-time listeners (`listenToData`)
- No manual refresh needed - logs appear instantly

#### Advanced Filtering

**Search Functionality:**
- Search by error message
- Search by source component
- Search by user email
- Real-time search as you type

**Severity Filters:**
- All logs
- Errors only (red)
- Warnings only (yellow)
- Info only (blue)

#### Visual Design

**Log Items Display:**
- Color-coded borders based on severity:
  - 🔴 Red: Errors
  - 🟡 Yellow: Warnings
  - 🔵 Blue: Info
- Severity badges with icons
- Timestamp display
- Source component indicator
- User information (email)
- Full error message
- Metadata display

**Empty States:**
- "All Clear!" message when no logs exist
- "No Matches" when filters return no results

#### Technical Reports Integration

The Reports tab also includes:
- User-submitted technical reports
- Screenshot attachments
- Status tracking (pending/in-progress/resolved)
- Shake-to-report functionality

## Usage Examples

### Logging from Teacher Dashboard

```typescript
// Simple error log
logError('Failed to load student data', 'error', 'TeacherDashboard');

// Error with stack trace
try {
  await someCriticalOperation();
} catch (error) {
  if (error instanceof Error) {
    logErrorWithStack(error, 'error', 'TeacherDashboard', 'Critical operation failed');
  }
}

// Warning with metadata
logError('Student assignment incomplete', 'warning', 'TeacherDashboard', {
  studentId: 'student123',
  assignmentId: 'assignment456'
});

// Info log for audit trail
logUserAction('Exported student grades', 'TeacherDashboard', {
  classId: 'class789',
  exportFormat: 'excel'
});
```

### Logging from Parent Dashboard

```typescript
// Error when loading data
logError('Failed to fetch announcements', 'error', 'ParentDashboard');

// Warning for non-critical issues
logError('Could not load teacher profile image', 'warning', 'ParentDashboard', {
  teacherId: 'teacher123'
});
```

## Admin Dashboard - Reports Tab Features

### 1. Error Logs Section

**Location:** Admin Dashboard → Reports Tab → Error Logs

**Features:**
- Real-time log streaming from Firebase
- Search bar for filtering logs
- Severity filter chips (All, Errors, Warnings, Info)
- Detailed log cards showing:
  - Severity badge with icon
  - Timestamp
  - Error message
  - Source component
  - User email (if available)
  - Additional metadata

**Statistics:**
- Total log count badge
- Color-coded by severity

### 2. Technical Reports Section

**Location:** Admin Dashboard → Reports Tab → Technical Reports

**Features:**
- User-submitted bug reports
- Screenshot attachments (up to 5 per report)
- Status tracking
- Reporter information
- Timestamp

### 3. Shake to Report

When viewing the Reports tab, shake your device to quickly submit a technical report.

## Firebase Database Structure

```
/errorLogs/
  ├── log_1234567890_abc123/
  │   ├── id: "log_1234567890_abc123"
  │   ├── timestamp: "2025-10-07T10:30:00.000Z"
  │   ├── message: "Failed to load students"
  │   ├── severity: "error"
  │   ├── source: "TeacherDashboard"
  │   ├── userId: "teacher_uid_123"
  │   ├── userEmail: "teacher@school.com"
  │   ├── stackTrace: "Error: ..."
  │   └── metadata: {...}
  │
  └── log_1234567891_def456/
      └── ...

/technicalReports/
  ├── report_1234567890/
  │   ├── id: "report_1234567890"
  │   ├── reportedBy: "admin_uid"
  │   ├── reportedByEmail: "admin@school.com"
  │   ├── timestamp: "2025-10-07T10:35:00.000Z"
  │   ├── description: "Bug description..."
  │   ├── screenshots: ["url1", "url2"]
  │   └── status: "pending"
  └── ...
```

## Performance Considerations

1. **Real-time Updates**: 
   - Listeners are only active when the Reports tab is selected
   - Automatic cleanup when switching tabs to prevent memory leaks

2. **Sorting**: 
   - Logs are automatically sorted by timestamp (newest first)
   - Efficient client-side filtering

3. **Search & Filtering**: 
   - All filtering happens client-side for instant results
   - Case-insensitive search

## Best Practices

1. **Use Appropriate Severity Levels:**
   - `error`: Critical failures that affect functionality
   - `warning`: Non-critical issues that should be monitored
   - `info`: Audit trail, user actions, system events

2. **Include Context:**
   - Always specify the source dashboard
   - Add metadata for better debugging
   - Include relevant IDs (studentId, classId, etc.)

3. **Error Messages:**
   - Be descriptive and specific
   - Include what failed and why (if known)
   - Avoid generic messages like "Error occurred"

4. **Stack Traces:**
   - Use `logErrorWithStack()` for caught exceptions
   - Provides valuable debugging information

## Monitoring & Maintenance

### For Admins

1. **Regular Monitoring:**
   - Check the Reports tab daily
   - Pay attention to error patterns
   - Investigate repeated errors from same sources

2. **Using Filters:**
   - Filter by severity to prioritize critical errors
   - Search by user email to track user-specific issues
   - Search by source to identify problematic components

3. **Taking Action:**
   - Errors should be investigated and resolved
   - Warnings should be monitored for patterns
   - Info logs help understand system usage

### For Developers

1. **Adding New Logs:**
   - Import the error logger utility
   - Add logging to all error catch blocks
   - Include relevant context and metadata

2. **Testing:**
   - Verify logs appear in Admin Dashboard
   - Check severity colors and badges
   - Ensure real-time updates work

## Security & Privacy

- User context is automatically captured (userId, email)
- Stack traces may contain sensitive data - monitor access
- Error messages should not expose passwords or sensitive data
- Admin access required to view error logs

## Future Enhancements

Potential improvements:
- Email notifications for critical errors
- Error rate graphs and trends
- Export logs to CSV/Excel
- Automatic error categorization
- Error resolution tracking
- Integration with external monitoring tools

## Troubleshooting

**Logs not appearing:**
- Verify Firebase connection
- Check that error logging is called in catch blocks
- Ensure user is authenticated

**Real-time updates not working:**
- Check Firebase real-time database rules
- Verify listener is set up correctly
- Ensure cleanup is not called prematurely

**Search/filter not working:**
- Check filter state
- Verify search query is lowercase
- Ensure data structure matches expected format

## Summary

The Error Logging System provides comprehensive monitoring of all Teacher and Parent Dashboard activities, with automatic error tracking, real-time updates, and advanced filtering capabilities. Admins can now easily monitor system health, identify issues, and track user actions across the entire platform.

