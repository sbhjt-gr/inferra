import * as Network from 'expo-network';
import { enableFirestoreNetwork, disableFirestoreNetwork } from './FirebaseService';

class NetworkService {
  private isOnline: boolean = true;
  private networkStateListeners: ((isOnline: boolean) => void)[] = [];

  constructor() {
    this.initializeNetworkMonitoring();
  }

  private async initializeNetworkMonitoring() {
    try {
      const networkState = await Network.getNetworkStateAsync();
      this.isOnline = networkState.isConnected && networkState.isInternetReachable;
      
      Network.addNetworkStateListener(this.handleNetworkStateChange);
      
      this.updateFirestoreNetworkState(this.isOnline);
    } catch (error) {
      console.error('Error initializing network monitoring:', error);
    }
  }

  private handleNetworkStateChange = async (networkState: Network.NetworkState) => {
    const wasOnline = this.isOnline;
    this.isOnline = networkState.isConnected && networkState.isInternetReachable;
    
    if (wasOnline !== this.isOnline) {
      console.log(`Network state changed: ${this.isOnline ? 'Online' : 'Offline'}`);
      
      this.updateFirestoreNetworkState(this.isOnline);
      
      this.networkStateListeners.forEach(listener => {
        try {
          listener(this.isOnline);
        } catch (error) {
          console.error('Error in network state listener:', error);
        }
      });
    }
  };

  private async updateFirestoreNetworkState(isOnline: boolean) {
    try {
      if (isOnline) {
        await enableFirestoreNetwork();
      } else {
        await disableFirestoreNetwork();
      }
    } catch (error) {
      console.error('Error updating Firestore network state:', error);
    }
  }

  public addNetworkStateListener(listener: (isOnline: boolean) => void) {
    this.networkStateListeners.push(listener);
    
    return () => {
      const index = this.networkStateListeners.indexOf(listener);
      if (index > -1) {
        this.networkStateListeners.splice(index, 1);
      }
    };
  }

  public getNetworkState(): boolean {
    return this.isOnline;
  }

  public async checkNetworkState(): Promise<boolean> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const isOnline = networkState.isConnected && networkState.isInternetReachable;
      
      if (this.isOnline !== isOnline) {
        this.isOnline = isOnline;
        this.updateFirestoreNetworkState(this.isOnline);
        
        this.networkStateListeners.forEach(listener => {
          try {
            listener(this.isOnline);
          } catch (error) {
            console.error('Error in network state listener:', error);
          }
        });
      }
      
      return isOnline;
    } catch (error) {
      console.error('Error checking network state:', error);
      return false;
    }
  }
}

export const networkService = new NetworkService(); 