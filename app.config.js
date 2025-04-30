import 'dotenv/config';

export default {
  expo: {
    name: "Inferra",
    slug: "inferra",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
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
      bundleIdentifier: "com.gorai.inferra"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#660880"
      },
      package: "com.gorai.ragionare"
    },
    web: {
      favicon: "./assets/icon.png"
    },
    extra: {
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      eas: {
        projectId: process.env.EAS_PROJECT_ID
      }
    },
    plugins: [
      [
        "expo-build-properties",
        {
          android: {
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