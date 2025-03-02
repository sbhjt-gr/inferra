/**
 * This is a fallback module to handle the missing NotificationPresenterModule
 * It provides empty implementations of the methods that might be called
 */

// Create a mock module that can be used when the real one fails
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
  // Add other methods as needed
};

// Export the mock module
export default NotificationPresenterModule; 