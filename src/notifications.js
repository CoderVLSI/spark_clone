import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Schedules a local daily reminder. The notification only nudges you to open
// the app; the update itself is fetched when the app opens.
export async function scheduleDailyReminder(hour, minute) {
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily', {
      name: 'Daily update',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Your daily Shraddha update', body: 'Tap to read today\'s news.' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: 'daily',
    },
  });
  return true;
}

export async function cancelDailyReminder() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
