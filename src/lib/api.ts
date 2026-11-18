import { supabase } from './supabase';
import type { AdminUser, Profile, Role } from './types';

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  let res: Response;
  try {
    res = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique sua internet.');
  }
  const text = await res.text();
  let body: { error?: string } & Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    if (res.status === 404 || (!body.error && text.startsWith('<'))) {
      throw new Error('A função de gerenciamento de usuários não está publicada neste ambiente. Publique o site no Netlify (ou use "netlify dev").');
    }
    throw new Error(body.error || 'Não foi possível concluir a ação.');
  }
  return body as T;
}

export const usersApi = {
  list: () => call<{ users: AdminUser[] }>({ action: 'list' }).then((r) => r.users),
  create: (v: { username: string; full_name: string; password: string; role: Role }) =>
    call<{ user: Profile }>({ action: 'create', ...v }).then((r) => r.user),
  update: (id: string, v: { username?: string; full_name?: string; role?: Role }) =>
    call<{ user: Profile }>({ action: 'update', id, ...v }).then((r) => r.user),
  resetPassword: (id: string, password: string) => call<{ ok: true }>({ action: 'reset_password', id, password }),
  setActive: (id: string, active: boolean) => call<{ user: Profile }>({ action: 'set_active', id, active }).then((r) => r.user),
  remove: (id: string) => call<{ ok: true }>({ action: 'delete', id }),
};
