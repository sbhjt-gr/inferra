export const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  try {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i < 0 || i >= sizes.length || !isFinite(bytes)) return '0 B';
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  } catch (error) {
    console.error('Error formatting bytes:', error, bytes);
    return '0 B';
  }
};

export const getProgressText = (data: any) => {
  if (!data) return '0% • 0 B / 0 B';
  
  const progress = typeof data.progress === 'number' ? data.progress : 0;
  const bytesDownloaded = typeof data.bytesDownloaded === 'number' ? data.bytesDownloaded : 0;
  const totalBytes = typeof data.totalBytes === 'number' && data.totalBytes > 0 ? data.totalBytes : 0;
  
  const downloadedFormatted = formatBytes(bytesDownloaded);
  const totalFormatted = formatBytes(totalBytes);
  
  return `${progress}% • ${downloadedFormatted} / ${totalFormatted}`;
};

export const getDisplayName = (filename: string) => {
  return filename.split('.')[0];
};

export const getActiveDownloadsCount = (downloads: any): number => {
  if (!downloads) return 0;
  return Object.values(downloads).filter((download: any) => 
    download.status !== 'completed' && download.status !== 'failed'
  ).length;
}; 