import { supabase } from '../supabase';
import { must } from './shared';
import type { PushBackend } from './types';

export const supabasePush: PushBackend = {
  async saveSubscription(keys, member) {
    must(
      await supabase.rpc('save_push_subscription', {
        p_endpoint: keys.endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_member: member,
      }),
    );
  },
  async deleteSubscription(endpoint) {
    must(await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint }));
  },
};
