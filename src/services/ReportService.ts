interface ReportData {
  messageContent: string;
  provider: string;
  category: string;
  description: string;
  email: string;
  userId?: string | null;
  timestamp: string;
  appVersion: string;
  platform: string;
  attachments?: Array<{
    uri: string;
    type: 'image' | 'video';
    fileName: string;
    fileSize: number;
  }>;
}

const WEB_APP_URL = process.env.NODE_ENV === 'production'
  ? 'https://inferra.me'
  : 'http://localhost:3000'; 
  
export const submitReport = async (reportData: ReportData): Promise<void> => {
  try {
    if (reportData.attachments && reportData.attachments.length > 0) {
      // Handle multipart form data for file uploads
      const formData = new FormData();
      
      // Add text data
      formData.append('messageContent', reportData.messageContent);
      formData.append('provider', reportData.provider);
      formData.append('category', reportData.category);
      formData.append('description', reportData.description);
      formData.append('email', reportData.email);
      formData.append('timestamp', reportData.timestamp);
      formData.append('appVersion', reportData.appVersion);
      formData.append('platform', reportData.platform);
      
      if (reportData.userId) {
        formData.append('userId', reportData.userId);
      }
      
      // Add file attachments
      for (let i = 0; i < reportData.attachments.length; i++) {
        const attachment = reportData.attachments[i];
        const fileType = attachment.type === 'image' ? 'image/jpeg' : 'video/mp4';
        
        formData.append('attachments', {
          uri: attachment.uri,
          type: fileType,
          name: attachment.fileName,
        } as any);
        
        formData.append(`attachment_${i}_type`, attachment.type);
        formData.append(`attachment_${i}_fileName`, attachment.fileName);
        formData.append(`attachment_${i}_fileSize`, attachment.fileSize.toString());
      }
      
      const response = await fetch(`${WEB_APP_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit report');
      }
    } else {
      // Handle JSON for text-only reports
      const response = await fetch(`${WEB_APP_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit report');
      }
    }
  } catch (error) {
    console.error('Error submitting report:', error);
    throw error;
  }
};
