# Publishing FalaMadeira: Cross-Platform Guide

This guide explains how to take the FalaMadeira web application and publish it so that it runs natively on **iOS**, **Android**, and **Desktop browsers**. 

The most efficient and modern way to achieve this with a React/Vite application is by turning it into a **Progressive Web App (PWA)**. A PWA allows users to "install" the website directly to their home screen or desktop, giving it an app icon, offline capabilities, and a native app feel without needing to go through the App Stores.

---

## Phase 1: Turning the App into a PWA

To make the app installable, you need to add a Web App Manifest and a Service Worker. In a Vite project, this is handled easily by the `vite-plugin-pwa` package.

### 1. Install the PWA Plugin
Run the following command in your terminal:
```bash
npm install vite-plugin-pwa -D
```

### 2. Update `vite.config.ts`
Modify your Vite configuration to include the PWA plugin and define your app's manifest (the metadata that tells phones how to install it).

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'FalaMadeira Training',
        short_name: 'FalaMadeira',
        description: 'European Portuguese Training System',
        theme_color: '#0284c7', // Your primary brand color
        background_color: '#f8fafc',
        display: 'standalone', // Makes it look like a native app (hides browser UI)
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
```

### 3. Generate App Icons
You will need to create app icons and place them in your `/public` folder:
*   `pwa-192x192.png`
*   `pwa-512x512.png`
*   `apple-touch-icon.png` (180x180px, specifically for iOS)
*   `favicon.ico`

*(Tip: You can use a free tool like [PWA Image Generator](https://www.pwabuilder.com/imageGenerator) to generate all required sizes from a single logo).*

### 4. Update `index.html`
Add the theme color and Apple touch icon to the `<head>` of your `index.html`:
```html
<meta name="theme-color" content="#0284c7">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

---

## Phase 2: Deployment (Hosting the Web App)

Because FalaMadeira is a Single Page Application (SPA), it can be hosted on any static hosting provider. 

1. **Build the App:** Run `npm run build`. This generates a `/dist` folder containing your optimized, production-ready app.
2. **Choose a Host:**
   *   **Vercel / Netlify:** The easiest options. Connect your GitHub repository, and they will automatically build and deploy your app every time you push code.
   *   **Firebase Hosting:** Great if you are already using Supabase/Firebase for backend services.
   *   **GitHub Pages:** Free and easy for static sites.

Once deployed, your app will be accessible via a standard URL (e.g., `https://falamadeira.vercel.app`).

---

## Phase 3: Installation Instructions for Users

Once the PWA is deployed, users can install it directly from their browsers. You can even add a small pop-up in your React app that detects their platform and shows them these instructions.

### 📱 iOS (iPhone / iPad)
Apple does not allow automatic install prompts, so users must install it manually via Safari.
1. Open the app URL in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up at the bottom of the screen).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **Add** in the top right corner.
*The app will now appear on their home screen and launch without the Safari UI.*

### 🤖 Android
Android provides a much smoother PWA experience.
1. Open the app URL in **Chrome**.
2. A banner will automatically pop up at the bottom saying **"Add FalaMadeira to Home screen"**.
3. Tap the banner and confirm the installation.
*(If the banner doesn't appear, tap the 3-dot menu in Chrome and select "Install app").*

### 💻 Desktop (Windows / Mac / Linux)
1. Open the app URL in **Chrome** or **Edge**.
2. Look at the right side of the URL address bar. You will see a small **Install icon** (a screen with a downward arrow).
3. Click it and select **Install**.
*The app will now be installed as a standalone desktop application, accessible from the Start Menu / Launchpad.*

---

## Phase 4: Advanced - Publishing to App Stores (Optional)

If you want the app to actually appear in the Google Play Store or Apple App Store, you need to "wrap" your PWA.

### Google Play Store (Android)
You can use **Trusted Web Activities (TWA)** to package your PWA into an Android `.apk` or `.aab` file.
*   **Tool:** Use [PWABuilder](https://www.pwabuilder.com/). You just paste your deployed URL, and it generates the Android Studio project and APK for you to upload to the Google Play Console.

### Apple App Store (iOS)
Apple is notoriously strict about wrapping web apps. If your app is purely a wrapped website, they may reject it under guideline 4.2 (Minimum Functionality).
*   **Tool:** You can use **Capacitor** (by Ionic) to wrap your React/Vite app into a native iOS shell.
*   **Process:** 
    1. Run `npm install @capacitor/core @capacitor/cli`
    2. Run `npx cap init`
    3. Run `npm install @capacitor/ios` and `npx cap add ios`
    4. Run `npm run build` then `npx cap sync ios`
    5. Open the project in Xcode (`npx cap open ios`) and submit to the App Store.

*Recommendation: For a training app like FalaMadeira, the direct "Add to Home Screen" PWA approach (Phase 1-3) is usually the best, fastest, and most cost-effective route.*
