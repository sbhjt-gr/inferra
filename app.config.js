export default {
  expo: {
    name: "Inferra",
    slug: "inferra",
    owner: "subhajitgorai",
    version: "0.7.0",
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
      url: "https://u.expo.dev/5ef5d807-bc8b-4dcb-a3f4-2bad3c098b3e"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      requireFullScreen: false,
      bundleIdentifier: "com.gorai.inferra",
      buildNumber: "270",
      runtimeVersion: "0.7.0",
      deploymentTarget: "17.0",
      updates: {
        enabled: false
      },
      infoPlist: {
        UIBackgroundModes: [
          "fetch",
          "remote-notification"
        ],
        NSCameraUsageDescription: "Camera access enables direct file capture uploads and OCR analysis features inside Inferra.",
        NSPhotoLibraryUsageDescription: "Inferra needs access to your photo library to let you select images for analysis and OCR.",
        NSPhotoLibraryAddUsageDescription: "Inferra needs permission to save captured photos and generated images to your library.",
        NSLocalNetworkUsageDescription: "Inferra uses local network access to share your AI chat interface with other devices on your WiFi network, allowing you to access your assistant from browsers on computers, tablets, or other phones.",
        NSBonjourServices: ["_http._tcp"],
        UIStatusBarStyle: "UIStatusBarStyleDefault",
        UIViewControllerBasedStatusBarAppearance: false,
        UIGestureRecognizerShouldBegin: false,
        UINavigationControllerHidesBarsOnSwipe: false,
        CFBundleURLTypes: [
          {
            CFBundleURLName: "google",
            CFBundleURLSchemes: ["com.googleusercontent.apps.299137610747-v1ipf308vgdgg06amnci4omektd3vurt"]
          }
        ]
      },
      entitlements: {
        "com.apple.developer.applesignin": ["Default"]
      },
      scheme: "com.gorai.inferra"
    },
    android: {
      versionCode: 270,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#660880"
      },
      package: "com.gorai.ragionare",
      runtimeVersion: "0.7.0",
      googleServicesFile: "./android/app/google-services.json",
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
        projectId: "5ef5d807-bc8b-4dcb-a3f4-2bad3c098b3e"
      },
    },
    plugins: [
      "expo-font",
      "expo-web-browser",
      "expo-asset",
      "expo-background-task",
      "expo-router",
      "expo-secure-store",
      "expo-sqlite",
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 28,
            "targetSdkVersion": 36
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