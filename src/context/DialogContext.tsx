import React, { createContext, useContext, useState, ReactNode } from 'react';

type DialogContextType = {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string | null;
  showLoading: boolean;
  showTitle: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  showDialog: (params: {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string | null;
    showLoading?: boolean;
    showTitle?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) => void;
  hideDialog: () => void;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const useDialog = (): DialogContextType => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

type DialogProviderProps = {
  children: ReactNode;
};

export const DialogProvider = ({ children }: DialogProviderProps) => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [confirmText, setConfirmText] = useState('OK');
  const [cancelText, setCancelText] = useState<string | null>('Cancel');
  const [showLoading, setShowLoading] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | undefined>(() => {});
  const [cancelCallback, setCancelCallback] = useState<(() => void) | undefined>(() => {});

  const showDialog = ({
    title = '',
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    showLoading = false,
    showTitle = true,
    onConfirm = () => {},
    onCancel = () => {},
  }: {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string | null;
    showLoading?: boolean;
    showTitle?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) => {
    setTitle(title);
    setMessage(message);
    setConfirmText(confirmText);
    setCancelText(cancelText);
    setShowLoading(showLoading);
    setShowTitle(showTitle);
    setConfirmCallback(() => onConfirm);
    setCancelCallback(() => onCancel);
    setVisible(true);
  };

  const hideDialog = () => {
    setVisible(false);
    setShowLoading(false);
    setShowTitle(true);
  };

  const handleConfirm = () => {
    if (confirmCallback) {
      confirmCallback();
    }
    hideDialog();
  };

  const handleCancel = () => {
    if (cancelCallback) {
      cancelCallback();
    }
    hideDialog();
  };

  const value = {
    visible,
    title,
    message,
    confirmText,
    cancelText,
    showLoading,
    showTitle,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
    showDialog,
    hideDialog,
  };

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}; 
