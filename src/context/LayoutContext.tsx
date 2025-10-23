import React, { createContext, useContext, ReactNode } from 'react';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

interface LayoutContextType {
  isWideScreen: boolean;
  chatAreaWidth: number;
  sidebarWidth: number;
  constrainToChat: boolean;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

interface LayoutProviderProps {
  children: ReactNode;
  constrainToChat?: boolean;
}

export function LayoutProvider({ children, constrainToChat = false }: LayoutProviderProps) {
  const { isWideScreen, chatWidth, sidebarWidth } = useResponsiveLayout();

  const value: LayoutContextType = {
    isWideScreen,
    chatAreaWidth: chatWidth,
    sidebarWidth,
    constrainToChat,
  };

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
