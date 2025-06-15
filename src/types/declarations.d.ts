declare module 'expo-secure-store';

import Constants from 'expo-constants';

declare module 'expo-constants' {
  interface ExpoConfigExtra {
    firebaseApiKey?: string;
    firebaseAuthDomain?: string;
    firebaseProjectId?: string;
    firebaseStorageBucket?: string;
    firebaseMessagingSenderId?: string;
    firebaseAppId?: string;
    googleOAuthIosClientId?: string;
    googleOAuthAndroidClientId?: string;
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    DEEPSEEK_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
  }
  
  interface ExpoConfig {
    extra?: ExpoConfigExtra;
    android?: {
      googleServicesFile?: string;
    };
  }
  
  interface Constants {
    expoConfig?: ExpoConfig;
    manifest?: {
      extra?: ExpoConfigExtra;
    };
  }
  
  const Constants: Constants;
  export default Constants;
}

declare module 'expo-secure-store' {
  export function getItemAsync(key: string): Promise<string | null>;
  export function setItemAsync(key: string, value: string): Promise<void>;
  export function deleteItemAsync(key: string): Promise<void>;
}

declare module 'firebase/app' {
  export interface FirebaseOptions {
    apiKey?: string;
    authDomain?: string;
    databaseURL?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
  }

  export class FirebaseApp {}
  
  export function initializeApp(options: FirebaseOptions, name?: string): FirebaseApp;
  export function getApp(name?: string): FirebaseApp;
  export function getApps(): FirebaseApp[];
}

declare module 'firebase/auth' {
  import { FirebaseApp } from 'firebase/app';
  
  export interface User {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    phoneNumber: string | null;
    photoURL: string | null;
  }
  
  export class Auth {}
  export class GoogleAuthProvider {
    static PROVIDER_ID: string;
    static credential(idToken?: string, accessToken?: string): any;
    addScope(scope: string): GoogleAuthProvider;
  }
  
  export class GithubAuthProvider {
    static PROVIDER_ID: string;
    static credential(token: string): any;
    addScope(scope: string): GithubAuthProvider;
  }
  
  export function getAuth(app?: FirebaseApp): Auth;
  export function createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<{ user: User }>;
  export function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<{ user: User }>;
  export function signInWithPopup(auth: Auth, provider: GoogleAuthProvider | GithubAuthProvider): Promise<{ user: User }>;
  export function sendEmailVerification(user: User): Promise<void>;
  export function updateProfile(user: User, profile: { displayName?: string; photoURL?: string }): Promise<void>;
  export function signOut(auth: Auth): Promise<void>;
  export function onAuthStateChanged(auth: Auth, nextOrObserver: (user: User | null) => void): () => void;
} 