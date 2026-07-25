import React from 'react';
import Dialog from '../Dialog';

type Props = {
  visible: boolean;
  downloading: boolean;
  progress: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function MiniLMConsentDialog({
  visible,
  downloading,
  progress,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog
      visible={visible}
      onClose={downloading ? undefined : onCancel}
      onDismiss={downloading ? undefined : onCancel}
      dismissOnBackdropPress={!downloading}
      iconName="database-outline"
      title="Download embedding model"
      description="RAG needs an on-device embedding model (~92 MB). Download once; it stays on this device."
      points={
        downloading
          ? [`Downloading ${Math.max(0, Math.min(100, progress))}%`]
          : ['Used for local and Apple Intelligence retrieval', 'One-time download']
      }
      primaryButtonText={downloading ? 'Downloading' : 'Download'}
      primaryButtonLoading={downloading}
      primaryButtonDisabled={downloading}
      onPrimaryPress={downloading ? undefined : onConfirm}
      secondaryButtonText={downloading ? undefined : 'Cancel'}
      onSecondaryPress={downloading ? undefined : onCancel}
    />
  );
}
