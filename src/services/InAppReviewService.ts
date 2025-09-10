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
        return false;
      }

      const shouldShow = await usageTrackingService.shouldShowInAppReview();
      if (!shouldShow) {
        return false;
      }

      await usageTrackingService.markInAppReviewShown();
      
      const hasFlowFinishedSuccessfully = await InAppReview.RequestInAppReview();
      
      if (hasFlowFinishedSuccessfully) {
        await usageTrackingService.markInAppReviewRequested();
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  resetSessionCheck(): void {
    this.hasCheckedThisSession = false;
  }
}

export const inAppReviewService = new InAppReviewService();
