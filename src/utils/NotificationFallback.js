


const NotificationPresenterModule = {
  getPresentedNotifications: async () => {
    console.log('Fallback: getPresentedNotifications called');
    return [];
  },
  dismissNotification: async (identifier) => {
    console.log('Fallback: dismissNotification called with', identifier);
    return null;
  },
  dismissAllNotifications: async () => {
    console.log('Fallback: dismissAllNotifications called');
    return null;
  },
  
};


export default NotificationPresenterModule; 