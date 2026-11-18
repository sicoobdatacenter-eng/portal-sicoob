import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { internalEmail, normalizeUsername } from '../../shared/auth.js';
import { supabase } from './supabase';
import type { Profile } from './types';

const DOMAIN = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || undefined;

interface AuthCtx {
  status: 'loading' | 'anon' | 'ready';
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  notice: string | null;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<string | null>;
  clearNotice: () => void;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthCtx['status']>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (session === undefined) return;
    if (!uid) { setProfile(null); setStatus('anon'); return; }
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (!alive) return;
      if (error || !data || !data.active) {
        setNotice(data && !data.active
          ? 'Este acesso está desativado. Fale com o administrador do portal.'
          : 'Não foi possível validar o seu acesso. Tente novamente ou fale com o administrador.');
        await supabase.auth.signOut();
        return;
      }
      setProfile(data as Profile);
      setStatus('ready');
    })();
    return () => { alive = false; };
  }, [uid, session]);

  const signIn = useCallback(async (username: string, password: string) => {
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email: internalEmail(normalizeUsername(username), DOMAIN), password });
    if (error) {
      if (/rate|too many/i.test(error.message)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
      if (/fetch|network/i.test(error.message)) return 'Sem conexão com o servidor. Verifique sua internet.';
      if (/banned|disabled/i.test(error.message)) return 'Este acesso está desativado. Fale com o administrador do portal.';
      return 'Usuário ou senha incorretos.';
    }
    return null;
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    if (!profile) return 'Sessão expirada.';
    const check = await supabase.auth.signInWithPassword({ email: internalEmail(profile.username, DOMAIN), password: current });
    if (check.error) return 'A senha atual está incorreta.';
    const { error } = await supabase.auth.updateUser({ password: next });
    return error ? 'Não foi possível alterar a senha. Tente novamente.' : null;
  }, [profile]);

  const value = useMemo<AuthCtx>(() => ({
    status, session: session ?? null, profile, isAdmin: profile?.role === 'admin', notice,
    signIn, signOut, changePassword, clearNotice: () => setNotice(null),
  }), [status, session, profile, notice, signIn, signOut, changePassword]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}
