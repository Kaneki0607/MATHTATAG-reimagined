# 🚀 MATHTATAG Deployment Guide

## 📱 Deploying to Vercel

### Prerequisites
- Node.js 18+ installed
- Git repository (GitHub, GitLab, or Bitbucket)
- Vercel account (free at [vercel.com](https://vercel.com))

### Quick Deploy (Recommended)

**Step 1: Push to Git**
```bash
git add .
git commit -m "Ready for Vercel deployment"
git push
```

**Step 2: Import to Vercel**
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your repository
4. Configure settings:
   - **Framework Preset**: Other
   - **Build Command**: `npm run build:web`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

**Step 3: Deploy**
Click "Deploy" and wait 3-5 minutes.

Your app will be live at: `https://your-project-name.vercel.app`

---

## 🔄 Updating Your Deployment

### Automatic Updates (Recommended)
Once connected to Vercel, every push to your main branch automatically deploys:
```bash
git add .
git commit -m "Your update message"
git push
```

Vercel will automatically build and deploy the changes.

### Manual Deploy via CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

---

## 📦 Building for Different Platforms

### Web (Vercel)
```bash
npm run build:web
```

### Android APK
```bash
eas build --platform android --profile preview
```

### Android AAB (Production)
```bash
eas build --platform android --profile production
```

### iOS
```bash
eas build --platform ios --profile production
```

---

## 🔧 Configuration

### Firebase
Firebase configuration is already set up in `lib/firebase.ts`. No additional environment variables needed.

### ElevenLabs API Keys
API keys are managed through Firebase Realtime Database at `/elevenlabskeys` path. No environment variables needed.

---

## 🌐 Custom Domain (Optional)

1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Domains"
3. Add your custom domain
4. Update your DNS settings as instructed by Vercel

---

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
npm install
npm run build:web
```

### Web App Shows Blank Screen
- Check browser console for errors
- Ensure all dependencies are web-compatible
- Check that Firebase is properly initialized

### Firebase Not Working
- Verify Firebase configuration in `lib/firebase.ts`
- Check Firebase project settings
- Ensure Firebase services are enabled in your Firebase console

---

## 📊 Monitoring

After deployment, monitor your app at:
- Vercel Dashboard: View build logs and analytics
- Firebase Console: Monitor database and storage usage
- Browser DevTools: Check for client-side errors

---

## 🎯 Best Practices

1. **Always test locally first**: Run `npm run web` before deploying
2. **Use preview deployments**: Test changes on preview URLs before production
3. **Monitor build times**: Keep dependencies optimized
4. **Check mobile responsiveness**: Test on different screen sizes
5. **Enable analytics**: Set up Vercel Analytics for insights

---

## 📞 Support

For issues:
- Check Vercel deployment logs
- Review Firebase console for backend errors
- Inspect browser console for client-side issues

---

## ✅ Deployment Checklist

- [ ] Code pushed to Git repository
- [ ] Vercel account created
- [ ] Repository imported to Vercel
- [ ] Build settings configured
- [ ] First deployment successful
- [ ] App accessible via Vercel URL
- [ ] Firebase functionality tested
- [ ] Mobile responsiveness verified
- [ ] (Optional) Custom domain configured

