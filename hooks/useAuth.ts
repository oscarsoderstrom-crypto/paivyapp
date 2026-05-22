import { useState, useEffect } from 'react';
import { supabase }            from '../lib/supabase';
import type { Profile }        from '../lib/types';

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) fetchProfile(session.user.id);
        else { setProfile(null); setLoading(false); }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, team:teams(*)')
      .eq('id', userId)
      .single();
    setProfile(data as Profile);
    setLoading(false);
  };

  const signOut = () => supabase.auth.signOut();

  return { profile, loading, signOut };
}
