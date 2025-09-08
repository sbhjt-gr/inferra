import InAppReview from 'react-native-in-app-review';
import { usageTrackingService } from './UsageTrackingService';

class InAppReviewService {
  private hasCheckedThisSession = false;

  async checkAndRequestReview(): Promise<boolean> {
    if (this.hasCheckedThisSession) {
      return false;
    }

    this.hasCheckedThisSession = true;

    try {
      const isAvailable = InAppReview.isAvailable();
      if (!isAvailable) {
        console.log('In-app review not available');
        return false;
      }

      const shouldShow = await usageTrackingService.shouldShowInAppReview();
      if (!shouldShow) {
        console.log('In-app review conditions not met');
        return false;
      }

      await usageTrackingService.markInAppReviewShown();
      
      const hasFlowFinishedSuccessfully = await InAppReview.RequestInAppReview();
      
      if (hasFlowFinishedSuccessfully) {
        await usageTrackingService.markInAppReviewRequested();
        console.log('In-app review completed successfully');
        return true;
      } else {
        console.log('In-app review was not completed');
        return false;
      }
    } catch (error) {
      console.error('Error requesting in-app review:', error);
      return false;
    }
  }

  resetSessionCheck(): void {
    this.hasCheckedThisSession = false;
  }
}

export const inAppReviewService = new InAppReviewService();