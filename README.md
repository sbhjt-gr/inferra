# Ragionare LLM Runner

Ragionare is a mobile application that allows you to download and run large language models (LLMs) directly on your device. No internet connection required for inference - your conversations stay completely private and local.

<a href="https://play.google.com/store/apps/details?id=com.gorai.ragionare">
  <img src="https://github.com/user-attachments/assets/bdc18fc5-5a99-410c-b383-eaf9c737176e" alt="play_download" width="200"/>
</a>

<br>

<img src="https://github.com/user-attachments/assets/28e9720f-1e3c-460d-b189-7f31d5020a90" alt="play_download" />

## Project Structure

The project follows a standard React Native with Expo structure:

```
src/
  ├── components/   # Reusable UI components
  ├── constants/    # App constants and theme definitions
  ├── context/      # React context providers
  ├── navigation/   # Navigation configuration
  ├── screens/      # App screens
  ├── services/     # Services like model downloading
  ├── types/        # TypeScript type definitions
  └── utils/        # Utility functions and managers
```

## Getting Started

1. Install dependencies

   ```powershell
   npm install
   ```

2. Start the development server

   ```powershell
   npx expo start
   ```

3. Run on device or emulator
   
   ```powershell
   # For Android
   npx expo run:android
   
   # For iOS
   npx expo run:ios
   ```

## Building for Production

To build a production version:

```powershell
# For Android
npx expo run:android --variant release

# For iOS
npx expo run:ios --configuration Release
```

## License

Distributed under AGPL-3.0. See `LICENSE` for more information.

## Acknowledgement

-   [llama.cpp](https://github.com/ggerganov/llama.cpp) - the underlying engine to run LLMs
-   [ragionare-llama.rn](https://github.com/sbhjt-gr/ragionare-llama.rn) is customized from the original react-native llama.cpp adapter [llama.rn](https://github.com/mybigday/llama.rn)
