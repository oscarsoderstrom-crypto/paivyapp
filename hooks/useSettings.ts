import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Org-wide settings, controlled by an HR admin. Read by every authenticated
// client; written only through the set_time_tracking() RPC. A realtime
// subscription keeps employees' apps in sync when HR flips the switch.
export function useSettings() {
  const [timeTracking, setTimeTrackingState] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('time_tracking_enabled')
      .eq('id', true)
      .single();
    if (data) setTimeTrackingState(!!data.time_tracking_enabled);
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel('app-settings')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        (payload) => {
          const row = payload.new as { time_tracking_enabled?: boolean };
          if (row && typeof row.time_tracking_enabled === 'boolean') {
            setTimeTrackingState(row.time_tracking_enabled);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // HR-admin only (enforced in the database by set_time_tracking()).
  const setTimeTracking = async (enabled: boolean): Promise<{ error?: Error }> => {
    const { error } = await supabase.rpc('set_time_tracking', { p_enabled: enabled });
    if (error) return { error };
    setTimeTrackingState(enabled);
    return {};
  };

  return { timeTracking, loading, setTimeTracking };
}
