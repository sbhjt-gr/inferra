export type RootStackParamList = {
  MainTabs: {
    screen: string;
    params?: {
      chatId?: string;
      modelPath?: string;
    };
  };
  Home: undefined;
  Settings: undefined;
  Model: undefined;
  ChatHistory: {
    onChatDeleted?: (chatId: string) => void;
    onAllChatsDeleted?: () => void;
  };
  Downloads: undefined;
};

export type TabParamList = {
  HomeTab: {
    chatId?: string;
    modelPath?: string;
    openModelSelector?: boolean;
    preselectedModelPath?: string;
  };
  Model: undefined;
  Downloads: undefined;
  Settings: undefined;
}; 