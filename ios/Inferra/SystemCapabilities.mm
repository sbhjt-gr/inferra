#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <Metal/Metal.h>

@interface SystemCapabilities : NSObject <RCTBridgeModule>
@end

@implementation SystemCapabilities

RCT_EXPORT_MODULE(DeviceInfoModule)

RCT_EXPORT_METHOD(getCPUInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSUInteger coreCount = [[NSProcessInfo processInfo] activeProcessorCount];

    NSDictionary *data = @{
      @"cores": @(coreCount)
    };

    resolve(data);
  } @catch (NSException *exception) {
    reject(@"cpu_info_error", @"Failed to retrieve CPU data", nil);
  }
}

RCT_EXPORT_METHOD(getGPUInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    id<MTLDevice> metalDevice = MTLCreateSystemDefaultDevice();

    NSString *chipName = metalDevice ? metalDevice.name : @"Unknown";
    NSString *chipType = @"Apple GPU (Metal)";
    BOOL hasMetalSupport = metalDevice != nil;

    NSDictionary *data = @{
      @"renderer": chipName,
      @"vendor": @"Apple",
      @"version": @"Metal",
      @"hasAdreno": @NO,
      @"hasMali": @NO,
      @"hasPowerVR": @NO,
      @"supportsOpenCL": @NO,
      @"gpuType": chipType
    };

    resolve(data);
  } @catch (NSException *exception) {
    reject(@"gpu_info_error", @"Failed to retrieve GPU data", nil);
  }
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
