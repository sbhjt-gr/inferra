export type RootStackParamList = {
  MainTabs: {
    screen: string;
    params?: {
      chatId?: string;
    };
  };
  Home: undefined;
  Settings: undefined;
  Model: undefined;
  ChatHistory: {
    onChatDeleted?: (chatId: string) => void;
    onAllChatsDeleted?: () => void;
  };
};

export type TabParamList = {
  HomeTab: {
    chatId?: string;
  };
  Model: undefined;
  Settings: undefined;
}; 