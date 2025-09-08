import { usageTrackingService } from '../services/UsageTrackingService';
import { inAppReviewService } from '../services/InAppReviewService';

async function testInAppReview() {
  console.log('Testing In-App Review Service...');

  const initialData = await usageTrackingService.getUsageData();
  console.log('Initial usage data:', initialData);

  await usageTrackingService.startSession();
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await usageTrackingService.endSession();

  const updatedData = await usageTrackingService.getUsageData();
  console.log('Updated usage data:', updatedData);

  const shouldShow = await usageTrackingService.shouldShowInAppReview();
  console.log('Should show in-app review:', shouldShow);

  if (shouldShow) {
    console.log('Checking in-app review...');
    const result = await inAppReviewService.checkAndRequestReview();
    console.log('In-app review result:', result);
  }

  console.log('Test completed successfully!');
}

testInAppReview().catch(console.error);