import 'dotenv/config';

export default {
  expo: {
    name: "Inferra",
    slug: "inferra",
    owner: "subhajitgorai",
    version: "2.6.0",
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
      buildNumber: "260",
      runtimeVersion: "2.6.0",
      googleServicesFile: "./ios/GoogleService-Info.plist",
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
      versionCode: 260,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#660880"
      },
      package: "com.gorai.ragionare",
      runtimeVersion: "2.6.0",
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
      GOOGLE_SIGN_IN_WEB_CLIENT_ID: process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID,
      eas: {
        projectId: process.env.EAS_PROJECT_ID
      },
    },
    experiments: {
      typedRoutes: true
    },
    plugins: [
      "react-native-edge-to-edge",
      "@react-native-firebase/app",
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
            usesCleartextTraffic: false,
            manifestPlaceholders: {
              screenOrientation: "unspecified"
            }
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