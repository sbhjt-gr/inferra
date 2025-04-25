export type RootStackParamList = {
  Login: {
    redirectTo?: string;
    redirectParams?: any;
  };
  Register: {
    redirectTo?: string;
    redirectParams?: any;
  };
  MainTabs: {
    screen: string;
    params?: {
      modelPath?: string;
    };
  };
  Home: undefined;
  Settings: undefined;
  Model: undefined;
  ChatHistory: undefined;
  Downloads: undefined;
};

export type TabParamList = {
  HomeTab: {
    modelPath?: string;
    loadChatId?: string;
  };
  SettingsTab: undefined;
  ModelTab: undefined;
  NotificationsTab: undefined;
  SearchTab: undefined;
}; 