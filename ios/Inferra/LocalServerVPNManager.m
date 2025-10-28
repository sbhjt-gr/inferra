#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <NetworkExtension/NetworkExtension.h>

static NSString *const kLocalServerVPNEvent = @"LocalServerVPNStatusChanged";
static NSString *const kLocalServerVPNBundleId = @"com.gorai.inferra.InferraServerExtension";

@interface LocalServerVPNManager : RCTEventEmitter <RCTBridgeModule>
@end

@interface LocalServerVPNManager ()
@property (nonatomic, strong) NETunnelProviderManager *tunnelManager;
@property (nonatomic, assign) NEVPNStatus cachedStatus;
@end

@implementation LocalServerVPNManager

RCT_EXPORT_MODULE();

- (instancetype)init
{
    self = [super init];
    if (self) {
        _cachedStatus = NEVPNStatusInvalid;
        [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(handleStatusChange) name:NEVPNStatusDidChangeNotification object:nil];
    }
    return self;
}

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[kLocalServerVPNEvent];
}

- (void)startObserving
{
    [self sendStatusEvent];
}

- (void)stopObserving
{
}

+ (BOOL)requiresMainQueueSetup
{
    return YES;
}

RCT_EXPORT_METHOD(startVPNServer:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self loadManagerWithCompletion:^(NETunnelProviderManager *manager, NSError *error) {
        if (error) {
            reject(@"vpn_load_failed", error.localizedDescription, error);
            return;
        }
        if (!manager) {
            reject(@"vpn_missing_manager", @"Manager unavailable", nil);
            return;
        }
        NETunnelProviderProtocol *configuration = [NETunnelProviderProtocol new];
        configuration.providerBundleIdentifier = kLocalServerVPNBundleId;
        configuration.serverAddress = @"127.0.0.1";
        configuration.providerConfiguration = [self normalizedConfigurationFromOptions:options];
        manager.protocolConfiguration = configuration;
        manager.localizedDescription = @"Inferra Local Server";
        manager.enabled = YES;
        [manager saveToPreferencesWithCompletionHandler:^(NSError *saveError) {
            if (saveError) {
                reject(@"vpn_save_failed", saveError.localizedDescription, saveError);
                return;
            }
            NSError *startError = nil;
            NSDictionary<NSString *, NSObject *> *startOptions = [self normalizedStartOptionsFromOptions:options];
            BOOL started = [manager.connection startVPNTunnelWithOptions:startOptions andReturnError:&startError];
            if (!started || startError) {
                reject(@"vpn_start_failed", startError.localizedDescription ?: @"Unable to start tunnel", startError);
                return;
            }
            self.tunnelManager = manager;
            self.cachedStatus = manager.connection.status;
            [self sendStatusEvent];
            NSMutableDictionary *payload = [NSMutableDictionary dictionary];
            payload[@"success"] = @YES;
            payload[@"status"] = [self statusStringForStatus:self.cachedStatus];
            id urlValue = options[@"url"];
            if (urlValue) {
                payload[@"url"] = urlValue;
            }
            resolve(payload);
        }];
    }];
}

RCT_EXPORT_METHOD(stopVPNServer:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self loadManagerWithCompletion:^(NETunnelProviderManager *manager, NSError *error) {
        if (error) {
            reject(@"vpn_load_failed", error.localizedDescription, error);
            return;
        }
        if (!manager) {
            resolve(@{ @"success": @NO });
            return;
        }
        [manager.connection stopVPNTunnel];
        self.cachedStatus = manager.connection.status;
        [self sendStatusEvent];
        resolve(@{ @"success": @YES });
    }];
}

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self loadManagerWithCompletion:^(NETunnelProviderManager *manager, NSError *error) {
        if (error) {
            reject(@"vpn_load_failed", error.localizedDescription, error);
            return;
        }
        NEVPNStatus status = manager ? manager.connection.status : self.cachedStatus;
        NSDictionary *info = [self statusPayloadForManager:manager status:status];
        resolve(info);
    }];
}

RCT_EXPORT_METHOD(updateVPNConfiguration:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self loadManagerWithCompletion:^(NETunnelProviderManager *manager, NSError *error) {
        if (error) {
            reject(@"vpn_load_failed", error.localizedDescription, error);
            return;
        }
        if (!manager) {
            resolve(@{ @"success": @NO });
            return;
        }
        NETunnelProviderProtocol *protocol = (NETunnelProviderProtocol *)manager.protocolConfiguration;
        if (!protocol) {
            protocol = [NETunnelProviderProtocol new];
        }
        protocol.providerBundleIdentifier = kLocalServerVPNBundleId;
        protocol.serverAddress = @"127.0.0.1";
        NSMutableDictionary *providerConfig = [NSMutableDictionary dictionaryWithDictionary:protocol.providerConfiguration ?: @{}];
        id urlValue = options[@"url"];
        if (urlValue) {
            providerConfig[@"url"] = urlValue;
        }
        protocol.providerConfiguration = providerConfig;
        manager.protocolConfiguration = protocol;
        manager.enabled = YES;
        [manager saveToPreferencesWithCompletionHandler:^(NSError *saveError) {
            if (saveError) {
                reject(@"vpn_save_failed", saveError.localizedDescription, saveError);
                return;
            }
            resolve(@{ @"success": @YES });
        }];
    }];
}

RCT_EXPORT_METHOD(requestVPNPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self loadManagerWithCompletion:^(NETunnelProviderManager *manager, NSError *error) {
        if (error) {
            reject(@"vpn_permission_failed", error.localizedDescription, error);
            return;
        }
        if (!manager) {
            reject(@"vpn_permission_failed", @"Manager unavailable", nil);
            return;
        }
        NETunnelProviderProtocol *protocol = (NETunnelProviderProtocol *)manager.protocolConfiguration;
        if (!protocol) {
            protocol = [NETunnelProviderProtocol new];
        }
        protocol.providerBundleIdentifier = kLocalServerVPNBundleId;
        protocol.serverAddress = @"127.0.0.1";
        if (!protocol.providerConfiguration) {
            protocol.providerConfiguration = @{};
        }
        manager.protocolConfiguration = protocol;
        manager.enabled = NO;
        [manager saveToPreferencesWithCompletionHandler:^(NSError *saveError) {
            if (saveError) {
                reject(@"vpn_permission_failed", saveError.localizedDescription, saveError);
                return;
            }
            [manager loadFromPreferencesWithCompletionHandler:^(NSError *loadError) {
                if (loadError) {
                    reject(@"vpn_permission_failed", loadError.localizedDescription, loadError);
                    return;
                }
                self.cachedStatus = manager.connection.status;
                resolve(@{ @"success": @YES, @"status": [self statusStringForStatus:self.cachedStatus] });
            }];
        }];
    }];
}

- (void)loadManagerWithCompletion:(void (^)(NETunnelProviderManager *manager, NSError *error))completion
{
    [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> *managers, NSError *error) {
        if (error) {
            completion(nil, error);
            return;
        }
        NETunnelProviderManager *matched = nil;
        for (NETunnelProviderManager *candidate in managers) {
            NETunnelProviderProtocol *protocol = (NETunnelProviderProtocol *)candidate.protocolConfiguration;
            if (protocol && [protocol.providerBundleIdentifier isEqualToString:kLocalServerVPNBundleId]) {
                matched = candidate;
                break;
            }
        }
        if (!matched) {
            matched = [NETunnelProviderManager new];
        }
        self.tunnelManager = matched;
        self.cachedStatus = matched.connection.status;
        completion(matched, nil);
    }];
}

- (NSDictionary *)normalizedConfigurationFromOptions:(NSDictionary *)options
{
    NSMutableDictionary *config = [NSMutableDictionary dictionary];
    NSNumber *port = options[@"port"];
    if (port) {
        config[@"port"] = port;
    }
    id urlValue = options[@"url"];
    if (urlValue) {
        config[@"url"] = urlValue;
    }
    return config;
}

- (NSDictionary<NSString *, NSObject *> *)normalizedStartOptionsFromOptions:(NSDictionary *)options
{
    NSMutableDictionary<NSString *, NSObject *> *result = [NSMutableDictionary dictionary];
    NSNumber *port = options[@"port"];
    if (port) {
        result[@"port"] = port;
    }
    NSString *urlValue = options[@"url"];
    if (urlValue) {
        result[@"url"] = urlValue;
    }
    return result.count > 0 ? result : nil;
}

- (NSString *)statusStringForStatus:(NEVPNStatus)status
{
    switch (status) {
        case NEVPNStatusConnected:
            return @"connected";
        case NEVPNStatusConnecting:
            return @"connecting";
        case NEVPNStatusDisconnected:
            return @"disconnected";
        case NEVPNStatusDisconnecting:
            return @"disconnecting";
        case NEVPNStatusInvalid:
            return @"invalid";
        case NEVPNStatusReasserting:
            return @"reasserting";
    }
    return @"unknown";
}

- (NSDictionary *)statusPayloadForManager:(NETunnelProviderManager *)manager status:(NEVPNStatus)status
{
    NSMutableDictionary *info = [NSMutableDictionary dictionary];
    info[@"isRunning"] = @((status == NEVPNStatusConnected) || (status == NEVPNStatusConnecting));
    info[@"status"] = [self statusStringForStatus:status];
    NETunnelProviderProtocol *protocol = (NETunnelProviderProtocol *)manager.protocolConfiguration;
    NSString *urlValue = (NSString *)protocol.providerConfiguration[@"url"];
    if (urlValue) {
        info[@"url"] = urlValue;
    }
    return info;
}

- (void)sendStatusEvent
{
    NETunnelProviderManager *manager = self.tunnelManager;
    NEVPNStatus status = manager ? manager.connection.status : self.cachedStatus;
    NSDictionary *payload = [self statusPayloadForManager:manager status:status];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:kLocalServerVPNEvent body:payload];
    });
}

- (void)handleStatusChange
{
    NETunnelProviderManager *manager = self.tunnelManager;
    if (manager) {
        self.cachedStatus = manager.connection.status;
    }
    [self sendStatusEvent];
}

@end
