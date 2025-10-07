# Firebase Console Email Configuration Guide

## 🔥 Firebase Console Setup Instructions

### Prerequisites
- Access to Firebase Console
- Project: MATHTATAG
- Admin/Owner permissions

---

## Step-by-Step Configuration

### 1️⃣ Access Email Templates

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **MATHTATAG**
3. Navigate to: **Authentication** (left sidebar)
4. Click on: **Templates** tab
5. You'll see three template types:
   - Email address verification
   - Password reset
   - Email address change

---

### 2️⃣ Configure Email Address Verification Template

Click on **"Email address verification"** to customize:

#### **Sender Name**
```
MATHTATAG
```

#### **Reply-to Email**
```
noreply@mathtatag-capstone-app.firebaseapp.com
```
(or your custom email if configured)

#### **Subject Line**
```
Verify your email for MATHTATAG ✓
```

#### **Email Body (HTML)**
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #3b82f6; font-size: 28px; margin: 0;">MATHTATAG</h1>
      <p style="color: #64748b; font-size: 14px; margin-top: 8px;">Your Intelligent Math Learning Companion</p>
    </div>
    
    <!-- Main Content -->
    <div style="margin-bottom: 30px;">
      <h2 style="color: #1e293b; font-size: 22px; margin-bottom: 16px;">Welcome, %DISPLAY_NAME%! 👋</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        Thank you for joining MATHTATAG! We're excited to have you on board.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        To complete your registration and access all features, please verify your email address by clicking the button below:
      </p>
    </div>
    
    <!-- Action Button -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="%LINK%" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
        Verify Email Address
      </a>
    </div>
    
    <!-- Alternative Link -->
    <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color: #3b82f6; font-size: 12px; word-break: break-all; margin-top: 8px;">
        %LINK%
      </p>
    </div>
    
    <!-- Footer -->
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.6;">
        This verification link will expire in 24 hours.
      </p>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin-top: 12px;">
        If you didn't create an account with MATHTATAG, you can safely ignore this email.
      </p>
    </div>
    
    <!-- Branding -->
    <div style="margin-top: 24px; text-align: center;">
      <p style="color: #64748b; font-size: 14px; font-weight: 600;">
        Best regards,<br>
        The MATHTATAG Team 🧮
      </p>
    </div>
    
  </div>
  
  <!-- Footer Text -->
  <div style="text-align: center; margin-top: 20px;">
    <p style="color: #94a3b8; font-size: 11px;">
      © 2025 MATHTATAG. All rights reserved.
    </p>
  </div>
</div>
```

---

### 3️⃣ Configure Password Reset Template

Click on **"Password reset"** to customize:

#### **Sender Name**
```
MATHTATAG
```

#### **Reply-to Email**
```
noreply@mathtatag-capstone-app.firebaseapp.com
```

#### **Subject Line**
```
Reset your MATHTATAG password 🔒
```

#### **Email Body (HTML)**
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <div style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #f59e0b; font-size: 28px; margin: 0;">MATHTATAG</h1>
      <p style="color: #64748b; font-size: 14px; margin-top: 8px;">Password Reset Request</p>
    </div>
    
    <!-- Main Content -->
    <div style="margin-bottom: 30px;">
      <h2 style="color: #1e293b; font-size: 22px; margin-bottom: 16px;">Hello, %DISPLAY_NAME%</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
        We received a request to reset your MATHTATAG account password.
      </p>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        Click the button below to choose a new password:
      </p>
    </div>
    
    <!-- Action Button -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="%LINK%" style="display: inline-block; background-color: #f59e0b; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);">
        Reset Password
      </a>
    </div>
    
    <!-- Alternative Link -->
    <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color: #f59e0b; font-size: 12px; word-break: break-all; margin-top: 8px;">
        %LINK%
      </p>
    </div>
    
    <!-- Security Notice -->
    <div style="margin-top: 32px; padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
      <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">
        <strong>Security Notice:</strong> This password reset link will expire in 1 hour for your security.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.6;">
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>
    
    <!-- Branding -->
    <div style="margin-top: 24px; text-align: center;">
      <p style="color: #64748b; font-size: 14px; font-weight: 600;">
        Best regards,<br>
        The MATHTATAG Team 🧮
      </p>
    </div>
    
  </div>
  
  <!-- Footer Text -->
  <div style="text-align: center; margin-top: 20px;">
    <p style="color: #94a3b8; font-size: 11px;">
      © 2025 MATHTATAG. All rights reserved.
    </p>
  </div>
</div>
```

---

### 4️⃣ Configure Authorized Domains

1. Go to: **Authentication** → **Settings**
2. Scroll to: **Authorized domains**
3. Ensure these domains are listed:
   - `localhost` (for development)
   - `mathtatag-capstone-app.firebaseapp.com` (production)
   - Any custom domains you use

4. Click **"Add domain"** if needed

---

### 5️⃣ Test Email Delivery

1. Go to: **Authentication** → **Templates**
2. Click on any template (e.g., "Email address verification")
3. Click **"Send test email"** button
4. Enter your email address
5. Click **"Send"**
6. Check your inbox to verify delivery

---

## 📧 Email Customization Tips

### Brand Colors:
- Primary Blue: `#3b82f6`
- Orange/Warning: `#f59e0b`
- Success Green: `#10b981`
- Dark Text: `#1e293b`
- Light Text: `#64748b`

### Font Recommendations:
- Headings: Arial, Helvetica, sans-serif
- Body: Arial, sans-serif
- Fallback: System default

### Mobile Responsiveness:
- Max width: 600px
- Padding: 20px
- Flexible layouts
- Touch-friendly buttons (min 44px height)

---

## 🔍 Verification Process Details

### For New Users:
1. User registers → `signUpUser()` called
2. Firebase Auth creates account
3. Verification email sent automatically
4. User receives email with link
5. User clicks link → Email verified
6. User can now login

### For Existing Unverified Users:
1. User tries to login → `signInUser()` called
2. System checks `user.emailVerified`
3. If false → Show verification modal
4. User clicks "Resend" → `resendVerificationEmail()` called
5. System checks if already verified
6. If not verified → Send new email
7. User verifies and logs in

---

## 🎯 Action URL Configuration

The verification and reset links redirect to:
```
https://mathtatag-capstone-app.firebaseapp.com/
```

**How it works:**
1. User clicks link in email
2. Firebase processes the action
3. User is redirected to the action URL
4. App shows success message
5. User can continue to login

**To customize:**
- Edit in `lib/firebase-auth.ts`
- Update `actionCodeSettings.url`
- Ensure domain is authorized in Firebase

---

## 📱 Platform-Specific Notes

### iOS:
- Deep linking may require additional setup
- Universal Links configuration recommended
- Test on real device for email app integration

### Android:
- App Links configuration may be needed
- Test email client integration
- Verify deep link handling

### Web:
- Direct URL navigation works automatically
- No additional configuration needed
- Test on multiple browsers

---

## 🚨 Important Security Notes

1. **Never disable email verification** in production
2. **Keep reset link expiry** at 1 hour maximum
3. **Monitor failed login attempts** for security
4. **Use strong password requirements** (implemented in validation)
5. **Log verification events** for audit trail

---

## 📊 Monitoring & Analytics

Track these metrics in Firebase:
- Email delivery rate
- Verification completion rate
- Password reset requests
- Failed login attempts due to unverified email

**To view:**
1. Firebase Console → Analytics
2. Authentication → Users tab
3. Check "Email verified" column

---

## 🛠️ Troubleshooting

### Email Templates Not Saving
- Ensure you have admin permissions
- Check for HTML syntax errors
- Remove any unsupported tags
- Try simpler HTML first, then enhance

### Emails Going to Spam
- Configure SPF/DKIM records (if using custom domain)
- Use Firebase's default sender
- Avoid spam trigger words
- Test with Gmail, Outlook, etc.

### Verification Link Not Working
- Check authorized domains
- Verify action URL is correct
- Ensure link hasn't expired
- Try on different browser

### Users Not Receiving Emails
- Check Firebase Usage & Billing
- Verify email quota not exceeded
- Check SMTP configuration
- Test with different email providers

---

## 📋 Checklist for Going Live

Before deploying to production:

- [ ] Email templates customized with MATHTATAG branding
- [ ] Sender name set to "MATHTATAG"
- [ ] Reply-to email configured
- [ ] Action URL verified and tested
- [ ] Authorized domains configured
- [ ] Test emails sent and received
- [ ] Spam filter testing completed
- [ ] Mobile email client testing done
- [ ] Password reset flow tested
- [ ] Verification resend tested
- [ ] Error handling verified
- [ ] User messages are clear and helpful

---

## 🎨 Brand Guidelines for Emails

### Logo:
- Use MATHTATAG logo at top of email
- Center-aligned
- Max width: 200px

### Colors:
- Primary: #3b82f6 (Blue)
- Success: #10b981 (Green)
- Warning: #f59e0b (Orange)
- Error: #ef4444 (Red)
- Background: #f8fafc (Light gray)

### Typography:
- Headings: Bold, 22-28px
- Body: Regular, 16px
- Small text: 12-14px
- Line height: 1.6 for readability

### Buttons:
- Padding: 16px 40px
- Border radius: 12px
- Font weight: Bold
- Min height: 44px (touch-friendly)

---

## 📞 Email Support Configuration

### Reply-to Address Options:

1. **Firebase Default:**
   ```
   noreply@mathtatag-capstone-app.firebaseapp.com
   ```
   ✅ Works immediately
   ❌ Cannot reply

2. **Custom Domain:**
   ```
   support@mathtatag.com
   ```
   ✅ Professional
   ✅ Can receive replies
   ❌ Requires SMTP setup

3. **Gmail SMTP:**
   ```
   your.gmail@gmail.com
   ```
   ✅ Easy to set up
   ✅ Free
   ❌ Daily sending limits

---

## 🔗 Useful Firebase Links

- **Project Console:** https://console.firebase.google.com/project/mathtatag-capstone-app
- **Authentication Docs:** https://firebase.google.com/docs/auth
- **Email Templates Guide:** https://firebase.google.com/docs/auth/custom-email-handler
- **Action URLs:** https://firebase.google.com/docs/auth/web/passing-state-in-email-actions

---

## 📝 Template Variables Reference

Use these in your email templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `%DISPLAY_NAME%` | User's display name | John Doe |
| `%EMAIL%` | User's email | john@example.com |
| `%LINK%` | Action link (verification/reset) | https://... |
| `%APP_NAME%` | Your app name | MATHTATAG |

---

## ✅ Final Verification

After configuration, test the complete flow:

1. **Create test account** → Verify email received
2. **Try login without verification** → Modal appears
3. **Resend verification email** → New email received
4. **Click verification link** → Email verified
5. **Login successfully** → Access granted
6. **Test forgot password** → Reset email received
7. **Reset password** → Can login with new password

---

**Configuration Status:** ✅ Ready for Production
**Last Updated:** October 7, 2025
**Configured By:** Development Team

