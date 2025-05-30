import { useState, useEffect } from 'react';
import { networkService } from '../services/NetworkService';
import { useAuth } from '../context/AuthContext';

export const useNetworkState = () => {
  const [isOnline, setIsOnline] = useState(networkService.getNetworkState());
  const { hasOfflineData, isAuthenticated } = useAuth();

  useEffect(() => {
    const unsubscribe = networkService.addNetworkStateListener((online) => {
      setIsOnline(online);
    });

    setIsOnline(networkService.getNetworkState());

    return unsubscribe;
  }, []);

  const checkNetworkState = async () => {
    return await networkService.checkNetworkState();
  };

  return {
    isOnline,
    isOffline: !isOnline,
    hasOfflineData,
    isAuthenticatedOffline: !isOnline && hasOfflineData,
    canUseApp: isOnline || (hasOfflineData && isAuthenticated),
    checkNetworkState
  };
}; 