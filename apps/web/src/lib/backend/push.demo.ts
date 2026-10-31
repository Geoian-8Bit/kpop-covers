import type { CalendarDemoDb } from './calendar.demo';
import { mutate } from './demoDb';
import type { PushBackend } from './types';

export const demoPush: PushBackend = {
  saveSubscription: async (keys, member) =>
    mutate((raw) => {
      const list = ((raw as CalendarDemoDb).push_subscriptions ??= []);
      const row = list.find((s) => s.endpoint === keys.endpoint);
      if (row) row.member_id = member;
      else list.push({ endpoint: keys.endpoint, member_id: member });
    }),
  deleteSubscription: async (endpoint) =>
    mutate((raw) => {
      const db = raw as CalendarDemoDb;
      db.push_subscriptions = (db.push_subscriptions ?? []).filter((s) => s.endpoint !== endpoint);
    }),
};
