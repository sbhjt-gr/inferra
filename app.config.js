export default {
  expo: {
    name: "InferrLM",
    slug: "inferrlm",
    owner: "subhajitgorai",
    version: "0.8.7",
    orientation: "default",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    description: "AI-powered mobile chat assistant supporting both local and cloud-based language models. Features include AI text generation, image analysis, document processing, multimodal interactions, optional Android AppFunctions tooling, and optional user-enabled root elevation tools that never root the device.",
    privacy: "public",
    keywords: ["AI", "chat", "assistant", "machine learning", "language model", "artificial intelligence"],
    newArchEnabled: true,
    updates: {
      enabled: true,
      checkAutomatically: 'NEVER',
      url: "https://u.expo.dev/a539a082-58a3-4f29-9bb7-107913124e7d",
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      requireFullScreen: false,
      bundleIdentifier: "com.gorai.inferra",
      appleTeamId: "GXKD77CCQ6",
      buildNumber: "293",
      runtimeVersion: "0.8.7",
      infoPlist: {
        UIBackgroundModes: [
          "fetch",
          "remote-notification"
        ],
        NSCameraUsageDescription: "Camera access enables direct file capture uploads and OCR analysis features inside InferrLM.",
        NSPhotoLibraryUsageDescription: "InferrLM needs access to your photo library to let you select images for analysis and OCR.",
        NSPhotoLibraryAddUsageDescription: "InferrLM needs permission to save captured photos and generated images to your library.",
        NSMicrophoneUsageDescription: "InferrLM uses your microphone to record audio for on-device transcription and translation.",
        NSContactsUsageDescription: "InferrLM uses contacts access only when you approve a mobile action to create or update a contact.",
        NSCalendarsUsageDescription: "InferrLM uses calendar access only when you approve a mobile action to create an event.",
        NSRemindersUsageDescription: "InferrLM uses reminders access only when you approve a calendar-style action that targets reminders.",
        NSUserNotificationsUsageDescription: "InferrLM uses notifications only when you approve a skill or mobile action to schedule a reminder.",
        NSLocalNetworkUsageDescription: "InferrLM uses local network access to share your AI chat interface with other devices on your WiFi network, allowing you to access your assistant from browsers on computers, tablets, or other phones.",
        NSBonjourServices: ["_http._tcp"],
        ITSAppUsesNonExemptEncryption: false,
        UIViewControllerBasedStatusBarAppearance: true,
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
      versionCode: 293,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#660880"
      },
      package: "com.gorai.ragionare",
      runtimeVersion: "0.8.7",
      resizeableActivity: true,
      supportsFreeform: true,
      permissions: [
        "NOTIFICATIONS",
        "BACKGROUND_FETCH",
        "WAKE_LOCK",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_DATA_SYNC",
        "CAMERA",
        "RECORD_AUDIO",
        "READ_CONTACTS",
        "WRITE_CONTACTS",
        "READ_CALENDAR",
        "WRITE_CALENDAR",
        "READ_MEDIA_IMAGES",
        "WRITE_EXTERNAL_STORAGE",
        "android.permission.EXECUTE_APP_FUNCTIONS"
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
      autoUpdate: true,
      changelog: [
        "Fixed server hanging when clients disconnect during streaming.",
        "Server now returns 503 instead of blocking when model is busy.",
      ],
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      HUGGINGFACE_TOKEN: process.env.HUGGINGFACE_TOKEN,
      eas: {
        projectId: "a539a082-58a3-4f29-9bb7-107913124e7d"
      },
    },
    plugins: [
      "react-native-litert-lm",
      "@react-native-ml-kit/text-recognition",
      "expo-sharing",
      "expo-status-bar",
      "expo-font",
      "expo-web-browser",
      "expo-asset",
      "expo-audio",
      "expo-contacts",
      "expo-calendar",
      "expo-notifications",
      "expo-localization",
      "expo-background-task",
      "expo-router",
      "expo-secure-store",
      "expo-sqlite",
      "./modules/local-server/plugin",
      "./modules/transfer/plugin",
      "./modules/app-functions/plugin",
      "./modules/root-access/plugin",
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 28,
            "compileSdkVersion": 36,
            "targetSdkVersion": 36
          },
          "ios": {
            "deploymentTarget": "26.0"
          }
        }
      ],
      "./app.plugin",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash.png",
          imageWidth: 200,
          resizeMode: "cover",
          backgroundColor: "#660880"
        }
      ]
    ]
  }
} 
