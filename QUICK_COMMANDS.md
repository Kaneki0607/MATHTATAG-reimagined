# ⚡ Quick Commands Reference

## 🚀 **Deploy to Vercel (5 Minutes)**

```powershell
# Step 1: Commit and push
git add .
git commit -m "Ready for Vercel"
git push

# Step 2: Go to vercel.com and import your repo
# Step 3: Click Deploy
# Done! 🎉
```

---

## 🔨 **Build Commands**

```powershell
# Build for web
npm run build:web

# Start development server
npm start

# Start with cleared cache
npm run dev

# Start web version
npm run web

# Start Android
npm run android

# Start iOS
npm run ios
```

---

## 📦 **EAS Build Commands**

```powershell
# Build Android APK (for testing)
eas build --platform android --profile preview

# Build Android AAB (for Google Play)
eas build --platform android --profile production

# Build iOS
eas build --platform ios --profile production

# Check build status
eas build:list
```

---

## 🔄 **Update Commands**

```powershell
# Publish OTA update (fast updates)
eas update --branch preview --message "Your update"

# For production
eas update --branch production --message "Your update"

# Check updates
eas update:list
```

---

## 🌐 **Vercel CLI (Optional)**

```powershell
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to production
vercel --prod

# Deploy to preview
vercel
```

---

## 🧪 **Testing Commands**

```powershell
# Test web build locally
npm run build:web

# Serve built files
npx serve dist

# Lint code
npm run lint
```

---

## 📊 **Maintenance Commands**

```powershell
# Install dependencies
npm install

# Clean install
npm ci

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

---

## 🔧 **Git Commands**

```powershell
# Check status
git status

# Add all changes
git add .

# Commit changes
git commit -m "Your message"

# Push to remote
git push

# Pull latest changes
git pull

# Create new branch
git checkout -b branch-name
```

---

## 🎯 **One-Line Deploy**

```powershell
# Build, commit, and push
npm run build:web && git add . && git commit -m "Deploy" && git push
```

Then just import to Vercel once!

---

## 📱 **Platform-Specific**

### **Android**
```powershell
# Development
npm run android

# Build APK
eas build --platform android --profile preview

# Update
eas update --branch preview
```

### **iOS**
```powershell
# Development
npm run ios

# Build
eas build --platform ios --profile production
```

### **Web**
```powershell
# Development
npm run web

# Build
npm run build:web

# Deploy
# Push to Git → Import to Vercel
```

---

## 🆘 **Troubleshooting**

```powershell
# Clear cache
npm run start:clear

# Reinstall node modules
rm -rf node_modules package-lock.json
npm install

# Reset Expo cache
expo start --clear

# Check Expo doctor
npx expo-doctor
```

---

## 🎊 **Most Common Workflow**

### **Daily Development:**
```powershell
npm start
# Make changes, test, repeat
```

### **Deploy Web Updates:**
```powershell
git add .
git commit -m "Update"
git push
# Vercel auto-deploys!
```

### **Build New Mobile Version:**
```powershell
eas build --platform android --profile preview
```

---

**Keep this file handy for quick reference! 📌**

