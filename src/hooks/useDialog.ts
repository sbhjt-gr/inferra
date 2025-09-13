import { useState, useCallback } from 'react';
import React from 'react';

interface DialogActions {
  title: string;
  message: string;
  actions: React.ReactNode[];
}

export const useDialog = () => {
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogActions, setDialogActions] = useState<React.ReactNode[]>([]);

  const showDialog = useCallback((title: string, message: string, actions: React.ReactNode[]) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(actions);
    setDialogVisible(true);
  }, []);

  const hideDialog = useCallback(() => {
    setDialogVisible(false);
  }, []);

  return {
    dialogVisible,
    dialogTitle,
    dialogMessage,
    dialogActions,
    showDialog,
    hideDialog,
  };
};
