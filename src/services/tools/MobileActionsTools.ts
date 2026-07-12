import * as Calendar from 'expo-calendar';
import * as Contacts from 'expo-contacts';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import {
  getReminderChannelId,
  initReminderNotifications,
  requestReminderPermission,
} from '../adapters/ReminderNotificationAdapter';
import { toolRegistry, type ToolSchema } from './ToolRegistry';

const TOOL_NAMES = [
  'open_url',
  'send_email',
  'open_map',
  'open_settings',
  'call_phone',
  'send_sms',
  'create_contact',
  'create_calendar_event',
] as const;

export type MobileActionLog = {
  tool: string;
  summary: string;
  createdAt: number;
};

type MobileActionsOptions = {
  onAction?: (entry: MobileActionLog) => void;
};

const OPEN_URL_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'open_url',
    description: 'Open a safe web URL in the device browser.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'An http or https URL to open.',
        },
      },
      required: ['url'],
    },
  },
};

const SEND_EMAIL_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'send_email',
    description: 'Open the device mail app with a drafted message.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'The destination email address.',
        },
        subject: {
          type: 'string',
          description: 'The email subject.',
        },
        body: {
          type: 'string',
          description: 'The email body text.',
        },
      },
      required: ['to'],
    },
  },
};

const OPEN_MAP_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'open_map',
    description: 'Open the device maps app for a given location query.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'A location, address, or place query.',
        },
      },
      required: ['location'],
    },
  },
};

const OPEN_SETTINGS_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'open_settings',
    description: 'Open the device settings app.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const CALL_PHONE_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'call_phone',
    description: 'Open the phone dialer with a phone number ready to call.',
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'The phone number to call.',
        },
      },
      required: ['phoneNumber'],
    },
  },
};

const SEND_SMS_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'send_sms',
    description: 'Open the SMS app with a drafted text message.',
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'The phone number to text.',
        },
        body: {
          type: 'string',
          description: 'The SMS body text.',
        },
      },
      required: ['phoneNumber'],
    },
  },
};

const CREATE_CONTACT_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'create_contact',
    description: 'Open the native contact form with prefilled contact details.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full display name for the contact.',
        },
        firstName: {
          type: 'string',
          description: 'First name for the contact.',
        },
        lastName: {
          type: 'string',
          description: 'Last name for the contact.',
        },
        company: {
          type: 'string',
          description: 'Company name for the contact.',
        },
        phoneNumber: {
          type: 'string',
          description: 'Phone number for the contact.',
        },
        email: {
          type: 'string',
          description: 'Email address for the contact.',
        },
      },
    },
  },
};

const CREATE_CALENDAR_EVENT_TOOL: ToolSchema = {
  type: 'function',
  function: {
    name: 'create_calendar_event',
    description: 'Open the native calendar event composer with prefilled event details.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the event.',
        },
        start: {
          type: 'string',
          description: 'Event start time in ISO 8601 format.',
        },
        end: {
          type: 'string',
          description: 'Event end time in ISO 8601 format.',
        },
        location: {
          type: 'string',
          description: 'Location of the event.',
        },
        notes: {
          type: 'string',
          description: 'Optional notes or agenda for the event.',
        },
        url: {
          type: 'string',
          description: 'Optional URL associated with the event.',
        },
        allDay: {
          type: 'boolean',
          description: 'Whether the event should be marked as all day.',
        },
      },
      required: ['title', 'start'],
    },
  },
};

const isSafeUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const normalizePhoneNumber = (value: string): string => value.trim().replace(/[^\d+]/g, '');

const buildSmsUrl = (phoneNumber: string, body: string): string => {
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const query = body ? `${separator}body=${encodeURIComponent(body)}` : '';
  return `sms:${encodeURIComponent(phoneNumber)}${query}`;
};

const openExternalUrl = async (url: string) => {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('unavailable_url');
  }
  await Linking.openURL(url);
};

const parseDateValue = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const buildContactPayload = (params: Record<string, any>): Contacts.Contact => {
  const firstName = String(params.firstName || '').trim();
  const lastName = String(params.lastName || '').trim();
  const name = String(params.name || '').trim();
  const company = String(params.company || '').trim();
  const phoneNumber = String(params.phoneNumber || '').trim();
  const email = String(params.email || '').trim();
  const displayName = name || [firstName, lastName].filter(Boolean).join(' ') || company || phoneNumber || email;

  if (!displayName) {
    throw new Error('invalid_contact');
  }

  return {
    contactType: company && !firstName && !lastName ? Contacts.ContactTypes.Company : Contacts.ContactTypes.Person,
    name: displayName,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    company: company || undefined,
    phoneNumbers: phoneNumber
      ? [
          {
            label: 'mobile',
            number: phoneNumber,
          },
        ]
      : undefined,
    emails: email
      ? [
          {
            label: 'work',
            email,
          },
        ]
      : undefined,
  };
};

const ensureContactsPermission = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('contacts_permission_denied');
  }
};

const ensureCalendarPermission = async () => {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) {
    throw new Error('calendar_permission_denied');
  }
};

const ensureNotificationPermission = async () => {
  const granted = await requestReminderPermission();
  if (!granted) {
    throw new Error('notification_permission_denied');
  }
};

const parseTriggerAt = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDateTrigger = (target: Date): Notifications.NotificationTriggerInput => {
  const minLeadMs = 15_000;
  let fireAt = target;
  if (fireAt.getTime() - Date.now() < minLeadMs) {
    fireAt = new Date(Date.now() + minLeadMs);
    console.log('notify_lead_bump', { iso: fireAt.toISOString() });
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: fireAt,
  };
};

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parseDayDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
};

export const executeMobileActionIntent = async (
  intent: string,
  parameters: Record<string, any> = {},
  onAction?: (entry: MobileActionLog) => void,
): Promise<string> => {
  const name = String(intent || '').trim().toLowerCase();
  const params = normalizeRecord(parameters);

  if (name === 'open_url') {
    const value = String(params.url || '').trim();
    if (!isSafeUrl(value)) {
      throw new Error('unsafe_url');
    }
    await openExternalUrl(value);
    onAction?.({ tool: 'open_url', summary: value, createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'send_email') {
    const recipient = String(params.to || params.extra_email || '').trim();
    if (!isValidEmail(recipient)) {
      throw new Error('invalid_email');
    }
    const subject = String(params.subject || params.extra_subject || '');
    const body = String(params.body || params.extra_text || '');
    const emailUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await openExternalUrl(emailUrl);
    onAction?.({ tool: 'send_email', summary: recipient, createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'open_map') {
    const query = String(params.location || '').trim();
    if (!query) {
      throw new Error('invalid_location');
    }
    const mapUrl = Platform.OS === 'ios'
      ? `https://maps.apple.com/?q=${encodeURIComponent(query)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    await openExternalUrl(mapUrl);
    onAction?.({ tool: 'open_map', summary: query, createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'open_settings') {
    await Linking.openSettings();
    onAction?.({ tool: 'open_settings', summary: 'Device settings', createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'call_phone') {
    const phoneNumber = normalizePhoneNumber(String(params.phoneNumber || ''));
    if (!phoneNumber) {
      throw new Error('invalid_phone');
    }

    await openExternalUrl(`tel:${encodeURIComponent(phoneNumber)}`);
    onAction?.({ tool: 'call_phone', summary: phoneNumber, createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'send_sms') {
    const phoneNumber = normalizePhoneNumber(String(params.phoneNumber || ''));
    if (!phoneNumber) {
      throw new Error('invalid_phone');
    }

    const body = String(params.body || '');
    await openExternalUrl(buildSmsUrl(phoneNumber, body));
    onAction?.({ tool: 'send_sms', summary: phoneNumber, createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'create_contact') {
    const contact = buildContactPayload(params);
    await ensureContactsPermission();
    await Contacts.presentFormAsync(null, contact);
    onAction?.({ tool: 'create_contact', summary: contact.name, createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'create_calendar_event') {
    const title = String(params.title || '').trim();
    const startDate = parseDateValue(params.start || params.begin_time);
    if (!title || !startDate) {
      throw new Error('invalid_event');
    }

    const allDay = Boolean(params.allDay);
    const requestedEndDate = parseDateValue(params.end || params.end_time);
    const endDate = requestedEndDate || new Date(startDate.getTime() + (allDay ? 24 : 1) * 60 * 60 * 1000);
    const notes = String(params.notes || params.description || '').trim() || undefined;

    await ensureCalendarPermission();
    await Calendar.createEventInCalendarAsync({
      title,
      startDate,
      endDate,
      location: String(params.location || '').trim() || undefined,
      notes,
      url: String(params.url || '').trim() || undefined,
      allDay,
    });
    onAction?.({ tool: 'create_calendar_event', summary: title, createdAt: Date.now() });
    return 'succeeded';
  }

  if (name === 'get_current_date_and_time') {
    const now = new Date();
    const payload = {
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 8),
      dayOfWeek: dayNames[now.getDay()],
      iso: now.toISOString(),
    };
    onAction?.({ tool: 'get_current_date_and_time', summary: payload.date, createdAt: Date.now() });
    return JSON.stringify(payload);
  }

  if (name === 'read_calendar_events') {
    const dateValue = String(params.date || '').trim();
    const day = parseDayDate(dateValue);
    if (!day) {
      throw new Error('invalid_date');
    }

    await ensureCalendarPermission();
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const startDate = new Date(day);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(day);
    endDate.setHours(23, 59, 59, 999);
    const events = await Calendar.getEventsAsync(
      calendars.map(calendar => calendar.id),
      startDate,
      endDate,
    );
    const payload = events.map(event => ({
      title: event.title,
      start: event.startDate,
      end: event.endDate,
      location: event.location,
      notes: event.notes,
      allDay: event.allDay,
    }));
    onAction?.({ tool: 'read_calendar_events', summary: dateValue, createdAt: Date.now() });
    return JSON.stringify(payload);
  }

  if (name === 'schedule_notification') {
    const title = String(params.title || '').trim();
    const message = String(params.message || '').trim();
    const hour = Number(params.hour);
    const minute = Number(params.minute ?? 0);
    const repeatDaily = Boolean(params.repeat_daily);

    if (!title || !message) {
      throw new Error('invalid_notification');
    }

    await ensureNotificationPermission();
    await initReminderNotifications();

    let trigger: Notifications.NotificationTriggerInput;
    const triggerAt = parseTriggerAt(params.trigger_at);
    if (triggerAt) {
      trigger = buildDateTrigger(triggerAt);
      console.log('notify_trigger_at', { iso: triggerAt.toISOString() });
    } else if (repeatDaily) {
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        throw new Error('invalid_notification');
      }
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      };
    } else {
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        throw new Error('invalid_notification');
      }
      const year = Number(params.year);
      const month = Number(params.month);
      const day = Number(params.day);
      const target = !Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)
        ? new Date(year, month - 1, day, hour, minute, 0, 0)
        : new Date();
      if (Number.isNaN(year)) {
        target.setHours(hour, minute, 0, 0);
        if (target.getTime() <= Date.now()) {
          target.setDate(target.getDate() + 1);
        }
      } else if (target.getTime() <= Date.now()) {
        target.setDate(target.getDate() + 1);
        console.log('notify_day_bump');
      }
      trigger = buildDateTrigger(target);
      console.log('notify_trigger_parts', {
        iso: target.toISOString(),
        year,
        month,
        day,
        hour,
        minute,
      });
    }

    const channelId = getReminderChannelId();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: message,
        sound: true,
        ...(channelId ? { channelId } : {}),
        data: {
          taskId: params.task_id,
          modelName: params.model_name,
          deeplink: params.deeplink,
        },
      },
      trigger,
    });
    console.log('notify_scheduled', { id });
    onAction?.({ tool: 'schedule_notification', summary: title, createdAt: Date.now() });
    return JSON.stringify({
      id,
      fireAt: triggerAt?.toISOString()
        || (trigger && 'date' in trigger && trigger.date instanceof Date
          ? trigger.date.toISOString()
          : undefined),
    });
  }

  throw new Error('unsupported_intent');
};

const OWNER = 'mobile_actions';

export const unregisterMobileActionTools = () => {
  toolRegistry.unregisterByOwner(OWNER);
};

export const registerMobileActionTools = ({ onAction }: MobileActionsOptions = {}) => {
  unregisterMobileActionTools();

  const wrap = (
    name: (typeof TOOL_NAMES)[number],
    schema: ToolSchema,
    risk: 'read' | 'write' | 'destructive',
    run: (args: Record<string, unknown>) => Promise<string>,
  ) => {
    toolRegistry.register(
      name,
      schema,
      async args => run(args),
      { ownerId: OWNER, source: 'stock', risk },
    );
  };

  wrap('open_url', OPEN_URL_TOOL, 'write', async ({ url }) =>
    executeMobileActionIntent('open_url', { url }, onAction),
  );
  wrap('send_email', SEND_EMAIL_TOOL, 'write', async ({ to, subject, body }) =>
    executeMobileActionIntent('send_email', { to, subject, body }, onAction),
  );
  wrap('open_map', OPEN_MAP_TOOL, 'read', async ({ location }) =>
    executeMobileActionIntent('open_map', { location }, onAction),
  );
  wrap('open_settings', OPEN_SETTINGS_TOOL, 'read', async () =>
    executeMobileActionIntent('open_settings', {}, onAction),
  );
  wrap('call_phone', CALL_PHONE_TOOL, 'write', async ({ phoneNumber }) =>
    executeMobileActionIntent('call_phone', { phoneNumber }, onAction),
  );
  wrap('send_sms', SEND_SMS_TOOL, 'write', async ({ phoneNumber, body }) =>
    executeMobileActionIntent('send_sms', { phoneNumber, body }, onAction),
  );
  wrap('create_contact', CREATE_CONTACT_TOOL, 'write', async parameters =>
    executeMobileActionIntent('create_contact', parameters, onAction),
  );
  wrap('create_calendar_event', CREATE_CALENDAR_EVENT_TOOL, 'write', async parameters =>
    executeMobileActionIntent('create_calendar_event', parameters, onAction),
  );
};
