import { StyleSheet, Text, View, FlatList } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type NotificationsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Notifications'>;
};

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
};

export default function NotificationsScreen({ navigation }: NotificationsScreenProps) {
  const notifications: Notification[] = [
    {
      id: '1',
      title: 'New Like',
      description: 'John liked your post',
      time: '2m ago',
    },
    {
      id: '2',
      title: 'New Comment',
      description: 'Sarah commented on your photo',
      time: '5m ago',
    },
    {
      id: '3',
      title: 'New Follower',
      description: 'Mike started following you',
      time: '1h ago',
    },
  ];

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.notificationItem}>
            <View style={styles.notificationContent}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
            <Text style={styles.time}>{item.time}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  description: {
    color: '#666',
    marginTop: 4,
  },
  time: {
    color: '#999',
    fontSize: 12,
  },
}); 