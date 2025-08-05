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
}

const WEB_APP_URL = process.env.NODE_ENV === 'production'
  ? 'https://inferra.me'
  : 'http://localhost:3000'; 
  
export const submitReport = async (reportData: ReportData): Promise<void> => {
  try {
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
  } catch (error) {
    console.error('Error submitting report:', error);
    throw error;
  }
};
