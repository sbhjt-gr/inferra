export default {
  expo: {
    name: "Inferra",
    slug: "inferra",
    owner: "subhajitgorai",
    version: "2.6.2",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    description: "AI-powered mobile chat assistant supporting both local and cloud-based language models. Features include AI text generation, image analysis, document processing, and multimodal interactions. All AI-generated content is clearly labeled for transparency.",
    privacy: "public",
    keywords: ["AI", "chat", "assistant", "machine learning", "language model", "artificial intelligence"],
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
      requireFullScreen: false,
      bundleIdentifier: "com.gorai.ragionare",
      buildNumber: "262",
      runtimeVersion: "2.6.2",
      deploymentTarget: "17.0",
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
        UINavigationControllerHidesBarsOnSwipe: false,
        CFBundleURLTypes: [
          {
            CFBundleURLName: "google",
            CFBundleURLSchemes: ["com.googleusercontent.apps.299137610747-u3b72q0vr3fi3qfb71rorhtam2vnr4oj"]
          }
        ]
      },
      scheme: "com.gorai.ragionare"
    },
    android: {
      versionCode: 262,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#660880"
      },
      package: "com.gorai.ragionare",
      runtimeVersion: "2.6.2",
      // googleServicesFile: "./android/app/google-services.json",
      edgeToEdgeEnabled: true,
      resizeableActivity: true,
      supportsFreeform: true,
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
      HUGGINGFACE_TOKEN: process.env.HUGGINGFACE_TOKEN,
      GOOGLE_SIGN_IN_WEB_CLIENT_ID: process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
      GOOGLE_SIGN_IN_IOS_CLIENT_ID: process.env.GOOGLE_SIGN_IN_IOS_CLIENT_ID,
      FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
      FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID,
      eas: {
        projectId: process.env.EAS_PROJECT_ID
      },
    },
    experiments: {
      typedRoutes: true
    },
    plugins: [
      "expo-asset",
      "expo-audio",
      "expo-background-task",
      "expo-router",
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 28
          },
          "ios": {
            "deploymentTarget": "17.0"
          }
        }
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/icon.png",
          imageWidth: 200,
          resizeMode: "cover",
          backgroundColor: "#660880"
        }
      ]
    ]
  }
} 