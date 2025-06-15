import 'dotenv/config';

export default {
  expo: {
    name: "Inferra",
    slug: "inferra",
    owner: "subhajitgorai",
    version: "2.0.0",
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
      fallbackToCacheTimeout: 0
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.gorai.ragionare",
      buildNumber: "200",
      runtimeVersion: "2.0.0",
      infoPlist: {
        UIBackgroundModes: [
          "fetch",
          "remote-notification"
        ],
        UIStatusBarStyle: "UIStatusBarStyleDefault",
        UIViewControllerBasedStatusBarAppearance: false
      },
      scheme: "com.gorai.ragionare"
    },
    android: {
      versionCode: 201,
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#660880"
      },
      package: "com.gorai.ragionare",
      runtimeVersion: "2.0.0",
      permissions: [
        "NOTIFICATIONS",
        "BACKGROUND_FETCH",
        "WAKE_LOCK",
        "FOREGROUND_SERVICE"
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
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/icon.png"
    },
    extra: {
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      googleOAuthIosClientId: process.env.GOOGLE_OAUTH_IOS_CLIENT_ID,
      googleOAuthAndroidClientId: process.env.GOOGLE_OAUTH_ANDROID_CLIENT_ID,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      eas: {
        projectId: process.env.EAS_PROJECT_ID
      }
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
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            buildToolsVersion: '35.0.0',
            kotlinVersion: '2.0.21',
            kspVersion: '2.0.21-1.0.20',
            usesCleartextTraffic: false
          },
          ios: {
            deploymentTarget: "15.1"
          }
        }
      ]
    ]
  }
} 