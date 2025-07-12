import 'dotenv/config';

export default {
  expo: {
    name: "Inferra",
    slug: "inferra",
    owner: "subhajitgorai",
    version: "2.5.5",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/icon.png",
      resizeMode: "cover",
      backgroundColor: "#660880"
    },
    updates: {
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 30000,
      url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.gorai.ragionare",
      buildNumber: "255",
      runtimeVersion: "2.5.5",
      updates: {
        enabled: false
      },
      infoPlist: {
        UIBackgroundModes: [
          "fetch",
          "remote-notification"
        ],
        UIStatusBarStyle: "UIStatusBarStyleDefault",
        UIViewControllerBasedStatusBarAppearance: false,
        UIGestureRecognizerShouldBegin: false,
        UINavigationControllerHidesBarsOnSwipe: false
      },
      scheme: "com.gorai.ragionare"
    },
    android: {
      versionCode: 255,
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#660880"
      },
      package: "com.gorai.ragionare",
      runtimeVersion: "2.5.5",
      permissions: [
        "NOTIFICATIONS",
        "BACKGROUND_FETCH",
        "WAKE_LOCK",
        "FOREGROUND_SERVICE",
        "CAMERA",
        "READ_MEDIA_IMAGES",
        "WRITE_EXTERNAL_STORAGE"
      ],
      statusBar: {
        barStyle: "default",
        backgroundColor: "transparent",
        translucent: true
      },
      navigationBar: {
        backgroundColor: "#660880"
      },
      scheme: "com.gorai.ragionare",
      intentFilters: [
        {
          action: "VIEW",
          data: [
            {
              scheme: "com.gorai.ragionare"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    extra: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_SIGN_IN_WEB_CLIENT_ID: process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
      eas: {
        projectId: process.env.EAS_PROJECT_ID
      },
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
      FIREBASE_ANDROID_API_KEY: process.env.FIREBASE_ANDROID_API_KEY,
      FIREBASE_ANDROID_APP_ID: process.env.FIREBASE_ANDROID_APP_ID,
      FIREBASE_IOS_API_KEY: process.env.FIREBASE_IOS_API_KEY,
      FIREBASE_IOS_APP_ID: process.env.FIREBASE_IOS_APP_ID,
      FIREBASE_IOS_CLIENT_ID: process.env.FIREBASE_IOS_CLIENT_ID,
      FIREBASE_IOS_REVERSED_CLIENT_ID: process.env.FIREBASE_IOS_REVERSED_CLIENT_ID,
      FIREBASE_IOS_BUNDLE_ID: process.env.FIREBASE_IOS_BUNDLE_ID,
    },
    experiments: {
      typedRoutes: true
    },
    plugins: [
      [
        
        "expo-splash-screen",
        {
          image: "./assets/icon.png",
          imageWidth: 200,
          resizeMode: "cover",
          backgroundColor: "#660880"
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            buildToolsVersion: '35.0.0',
            kotlinVersion: '2.0.21',
            kspVersion: '2.0.21-1.0.20',
            usesCleartextTraffic: false
          },
          ios: {
            deploymentTarget: "15.5",
            useFrameworks: "static"
          }
        }
      ]
    ]
  }
} 