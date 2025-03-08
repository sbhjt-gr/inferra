export type RootStackParamList = {
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
  };
  SettingsTab: undefined;
  ModelTab: undefined;
  NotificationsTab: undefined;
  SearchTab: undefined;
}; 