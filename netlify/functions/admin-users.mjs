// Gerenciamento de usuários (somente administradores).
// Usa a service_role do Supabase, que NUNCA vai para o navegador.
import { createClient } from '@supabase/supabase-js';
import {
  internalEmail, normalizeUsername, passwordError, usernameError,
} from '../../shared/auth.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const BAN_FOREVER = '876000h'; // ~100 anos

export default async (req) => {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const domain = process.env.VITE_AUTH_EMAIL_DOMAIN || process.env.AUTH_EMAIL_DOMAIN;
    if (!url || !serviceKey) {
      throw new HttpError(500, 'Servidor sem configuração: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Netlify.');
    }
    const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // 1) Quem está chamando? Valida o token e exige perfil de administrador ativo.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new HttpError(401, 'Sessão ausente. Entre novamente.');
    const { data: auth, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !auth?.user) throw new HttpError(401, 'Sessão inválida ou expirada. Entre novamente.');
    const { data: me } = await sb.from('profiles').select('id, role, active').eq('id', auth.user.id).maybeSingle();
    if (!me || !me.active || me.role !== 'admin') throw new HttpError(403, 'Acesso restrito a administradores.');

    let body;
    try { body = await req.json(); } catch { throw new HttpError(400, 'Requisição inválida.'); }

    const countOtherActiveAdmins = async (exceptId) => {
      const { count, error } = await sb.from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin').eq('active', true).neq('id', exceptId);
      if (error) throw new HttpError(500, 'Não foi possível verificar os administradores.');
      return count ?? 0;
    };
    const getTarget = async (id) => {
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Usuário inválido.');
      const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
      if (error) throw new HttpError(500, 'Não foi possível consultar o usuário.');
      if (!data) throw new HttpError(404, 'Usuário não encontrado.');
      return data;
    };
    const cleanName = (v) => {
      const n = String(v ?? '').trim().replace(/\s+/g, ' ');
      if (n.length < 2 || n.length > 120) throw new HttpError(400, 'Informe o nome completo (2 a 120 caracteres).');
      return n;
    };
    const cleanRole = (v) => {
      if (v !== 'admin' && v !== 'user') throw new HttpError(400, 'Perfil inválido.');
      return v;
    };

    switch (body.action) {
      case 'list': {
        const { data: profiles, error } = await sb.from('profiles').select('*').order('full_name');
        if (error) throw new HttpError(500, 'Não foi possível listar os usuários.');
        const lastSeen = new Map();
        for (let page = 1; page <= 20; page++) {
          const { data, error: e2 } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
          if (e2 || !data?.users?.length) break;
          for (const u of data.users) lastSeen.set(u.id, u.last_sign_in_at ?? null);
          if (data.users.length < 1000) break;
        }
        return json(200, { users: profiles.map((p) => ({ ...p, last_sign_in_at: lastSeen.get(p.id) ?? null })) });
      }

      case 'create': {
        const username = normalizeUsername(body.username);
        const e1 = usernameError(username); if (e1) throw new HttpError(400, e1);
        const e2 = passwordError(body.password); if (e2) throw new HttpError(400, e2);
        const full_name = cleanName(body.full_name);
        const role = cleanRole(body.role ?? 'user');

        const { data: dup } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
        if (dup) throw new HttpError(409, 'Já existe um usuário com esse login.');

        const { data: created, error } = await sb.auth.admin.createUser({
          email: internalEmail(username, domain),
          password: body.password,
          email_confirm: true,
        });
        if (error || !created?.user) {
          const msg = String(error?.message || '');
          if (/already|registered|exists/i.test(msg)) throw new HttpError(409, 'Já existe um usuário com esse login.');
          if (/invalid/i.test(msg) && /email/i.test(msg)) {
            throw new HttpError(500, 'O Supabase recusou o identificador interno do login. Defina VITE_AUTH_EMAIL_DOMAIN com um domínio válido (veja o README).');
          }
          throw new HttpError(500, 'Não foi possível criar o acesso.');
        }
        const { data: profile, error: pErr } = await sb.from('profiles')
          .insert({ id: created.user.id, username, full_name, role, active: true, created_by: me.id })
          .select().single();
        if (pErr) {
          await sb.auth.admin.deleteUser(created.user.id);
          throw new HttpError(500, 'Não foi possível salvar o perfil do usuário.');
        }
        return json(201, { user: profile });
      }

      case 'update': {
        const target = await getTarget(body.id);
        const patch = {};
        if (body.full_name !== undefined) patch.full_name = cleanName(body.full_name);
        if (body.role !== undefined) {
          patch.role = cleanRole(body.role);
          if (target.role === 'admin' && patch.role === 'user') {
            if (target.id === me.id) throw new HttpError(400, 'Você não pode remover o seu próprio perfil de administrador.');
            if (target.active && (await countOtherActiveAdmins(target.id)) === 0) {
              throw new HttpError(400, 'É preciso manter ao menos um administrador ativo.');
            }
          }
        }
        let newUsername = null;
        if (body.username !== undefined && normalizeUsername(body.username) !== target.username) {
          newUsername = normalizeUsername(body.username);
          const e = usernameError(newUsername); if (e) throw new HttpError(400, e);
          const { data: dup } = await sb.from('profiles').select('id').eq('username', newUsername).maybeSingle();
          if (dup) throw new HttpError(409, 'Já existe um usuário com esse login.');
          const { error } = await sb.auth.admin.updateUserById(target.id, {
            email: internalEmail(newUsername, domain), email_confirm: true,
          });
          if (error) throw new HttpError(500, 'Não foi possível alterar o login.');
          patch.username = newUsername;
        }
        if (Object.keys(patch).length === 0) return json(200, { user: target });
        patch.updated_at = new Date().toISOString();
        const { data, error } = await sb.from('profiles').update(patch).eq('id', target.id).select().single();
        if (error) {
          if (newUsername) {
            await sb.auth.admin.updateUserById(target.id, { email: internalEmail(target.username, domain), email_confirm: true });
          }
          throw new HttpError(500, 'Não foi possível salvar as alterações.');
        }
        return json(200, { user: data });
      }

      case 'reset_password': {
        const target = await getTarget(body.id);
        const e = passwordError(body.password); if (e) throw new HttpError(400, e);
        const { error } = await sb.auth.admin.updateUserById(target.id, { password: body.password });
        if (error) throw new HttpError(500, 'Não foi possível redefinir a senha.');
        return json(200, { ok: true });
      }

      case 'set_active': {
        const target = await getTarget(body.id);
        const active = body.active === true;
        if (!active) {
          if (target.id === me.id) throw new HttpError(400, 'Você não pode desativar o próprio acesso.');
          if (target.role === 'admin' && target.active && (await countOtherActiveAdmins(target.id)) === 0) {
            throw new HttpError(400, 'É preciso manter ao menos um administrador ativo.');
          }
        }
        const { error } = await sb.auth.admin.updateUserById(target.id, { ban_duration: active ? 'none' : BAN_FOREVER });
        if (error) throw new HttpError(500, 'Não foi possível alterar o acesso.');
        const { data, error: pErr } = await sb.from('profiles')
          .update({ active, updated_at: new Date().toISOString() }).eq('id', target.id).select().single();
        if (pErr) throw new HttpError(500, 'Não foi possível salvar o status do usuário.');
        return json(200, { user: data });
      }

      case 'delete': {
        const target = await getTarget(body.id);
        if (target.id === me.id) throw new HttpError(400, 'Você não pode excluir o próprio acesso.');
        if (target.role === 'admin' && target.active && (await countOtherActiveAdmins(target.id)) === 0) {
          throw new HttpError(400, 'É preciso manter ao menos um administrador ativo.');
        }
        const { error } = await sb.auth.admin.deleteUser(target.id);
        if (error) throw new HttpError(500, 'Não foi possível excluir o acesso.');
        return json(200, { ok: true });
      }

      default:
        throw new HttpError(400, 'Ação desconhecida.');
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error('admin-users', e);
    return json(500, { error: 'Erro interno. Tente novamente.' });
  }
};

export const config = { path: '/api/admin-users' };
