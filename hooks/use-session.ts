"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface SessionState {
  user: User | null;
  isLoading: boolean;
}

/**
 * Subscribes to Supabase auth state changes.
 * Returns current user, loading flag, and a signOut helper.
 */
export function useSession() {
  const [state, setState] = useState<SessionState>({ user: null, isLoading: true });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Get initial session.
    supabase.auth.getUser().then(({ data }) => {
      setState({ user: data.user ?? null, isLoading: false });
    }).catch(() => {
      setState({ user: null, isLoading: false });
    });

    // Subscribe to auth changes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, isLoading: false });
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    // device_id in localStorage intentionally preserved for guest continuity.
  }

  return { user: state.user, isLoading: state.isLoading, signOut };
}
