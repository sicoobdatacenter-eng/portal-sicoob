import { useState, type FormEvent } from 'react';
import { Ban, CheckCircle2, Copy, Eye, EyeOff, KeyRound, Pencil, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { usersApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errMsg, fmtDateTime, generatePassword } from '../lib/utils';
import { normalizeUsername, passwordError, usernameError } from '../../shared/auth.js';
import type { AdminUser, Role } from '../lib/types';
import { ConfirmDialog, EmptyState, Field, Loading, Modal, PageHead, useAsync, useToast } from '../components/ui';

function PasswordField({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} htmlFor={id} hint="Mínimo de 8 caracteres. Você passa a senha diretamente para a pessoa.">
      <div className="input-group">
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" required />
        <button type="button" className="btn btn--ghost btn--icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
      <div><button type="button" className="link-btn" onClick={() => { onChange(generatePassword()); setShow(true); }}><RefreshCw size={13} style={{ verticalAlign: -1 }} /> Gerar senha</button></div>
    </Field>
  );
}

function Credentials({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(`Usuário: ${username}\nSenha: ${password}`); toast.ok('Credenciais copiadas.'); }
    catch { toast.error('Não foi possível copiar. Selecione o texto manualmente.'); }
  }
  return (
    <Modal title="Acesso pronto para entregar" onClose={onClose} narrow footer={<><button className="btn btn--ghost" onClick={copy}><Copy size={16} /> Copiar</button><button className="btn" onClick={onClose}>Concluir</button></>}>
      <div className="credentials">
        <div>Usuário</div><code>{username}</code>
        <div>Senha</div><code>{password}</code>
      </div>
      <p className="hint" style={{ color: 'var(--muted)' }}>Passe estas credenciais diretamente à pessoa. Por segurança, a senha não ficará visível depois que você fechar esta janela. Se ela esquecer, redefina em Gerenciar usuários.</p>
    </Modal>
  );
}

function UserFormModal({ user, onClose, onDone }: { user?: AdminUser; onClose: () => void; onDone: (r?: { username: string; password: string }) => void }) {
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'user');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const u = normalizeUsername(username);
    const ue = usernameError(u); if (ue) return setErr(ue);
    if (fullName.trim().length < 2) return setErr('Informe o nome completo.');
    if (!user) { const pe = passwordError(password); if (pe) return setErr(pe); }
    setBusy(true); setErr(null);
    try {
      if (user) {
        await usersApi.update(user.id, { full_name: fullName.trim(), username: u, role });
        toast.ok('Usuário atualizado.');
        onDone();
      } else {
        await usersApi.create({ full_name: fullName.trim(), username: u, password, role });
        onDone({ username: u, password });
      }
    } catch (ex) { setErr(errMsg(ex)); setBusy(false); }
  }
  return (
    <Modal title={user ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} closeDisabled={busy}
      footer={<><button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn" form="user-form" disabled={busy}>{busy ? 'Salvando…' : user ? 'Salvar alterações' : 'Criar acesso'}</button></>}>
      <form id="user-form" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label="Nome completo" htmlFor="u-name"><input id="u-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required /></Field>
        <Field label="Usuário (login)" htmlFor="u-login" hint={user ? 'Se mudar o login, avise a pessoa.' : 'Letras minúsculas, números, ponto, hífen ou sublinhado. Ex.: maria.silva'}>
          <input id="u-login" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} required />
        </Field>
        {!user && <PasswordField id="u-pass" label="Senha inicial" value={password} onChange={setPassword} />}
        <Field label="Perfil de acesso" htmlFor="u-role">
          <select id="u-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">Usuário: consulta, FAQ e sugestões</option>
            <option value="admin">Administrador: acesso completo</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function ResetModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const pe = passwordError(pw); if (pe) return setErr(pe);
    setBusy(true); setErr(null);
    try { await usersApi.resetPassword(user.id, pw); onDone(pw); } catch (ex) { setErr(errMsg(ex)); setBusy(false); }
  }
  return (
    <Modal title={`Redefinir senha de ${user.full_name}`} onClose={onClose} narrow closeDisabled={busy}
      footer={<><button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn" form="reset-form" disabled={busy}>{busy ? 'Salvando…' : 'Redefinir senha'}</button></>}>
      <form id="reset-form" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <PasswordField id="r-pass" label="Nova senha" value={pw} onChange={setPw} />
      </form>
    </Modal>
  );
}

export function Users() {
  const { profile } = useAuth();
  const toast = useToast();
  const list = useAsync(() => usersApi.list(), []);
  const [form, setForm] = useState<{ user?: AdminUser } | null>(null);
  const [reset, setReset] = useState<AdminUser | null>(null);
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [del, setDel] = useState<AdminUser | null>(null);
  const [toggle, setToggle] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  async function doToggle() {
    if (!toggle) return;
    setBusy(true);
    try {
      await usersApi.setActive(toggle.id, !toggle.active);
      toast.ok(toggle.active ? 'Acesso desativado.' : 'Acesso reativado.');
      setToggle(null); list.reload();
    } catch (ex) { toast.error(errMsg(ex)); }
    setBusy(false);
  }
  async function doDelete() {
    if (!del) return;
    setBusy(true);
    try { await usersApi.remove(del.id); toast.ok('Acesso excluído.'); setDel(null); list.reload(); }
    catch (ex) { toast.error(errMsg(ex)); }
    setBusy(false);
  }

  const users = list.data ?? [];
  const Actions = ({ u }: { u: AdminUser }) => (
    <div className="actions">
      <button className="btn btn--ghost btn--small" onClick={() => setForm({ user: u })}><Pencil size={14} /> Editar</button>
      <button className="btn btn--ghost btn--small" onClick={() => setReset(u)}><KeyRound size={14} /> Senha</button>
      {u.id !== profile?.id && <>
        <button className="btn btn--ghost btn--small" onClick={() => setToggle(u)} title={u.active ? 'Desativar acesso' : 'Reativar acesso'}>{u.active ? <><Ban size={14} /> Desativar</> : <><CheckCircle2 size={14} /> Reativar</>}</button>
        <button className="btn btn--ghost btn--small btn--icon" aria-label={`Excluir ${u.full_name}`} onClick={() => setDel(u)}><Trash2 size={14} /></button>
      </>}
    </div>
  );
  const roleChip = (u: AdminUser) => <span className={`chip ${u.role === 'admin' ? 'chip--lime' : ''}`}>{u.role === 'admin' ? 'Administrador' : 'Usuário'}</span>;
  const statusChip = (u: AdminUser) => <span className={`chip ${u.active ? 'chip--green' : 'chip--danger'}`}>{u.active ? 'Ativo' : 'Desativado'}</span>;

  return (
    <>
      <PageHead title="Gerenciar usuários" actions={<button className="btn btn--teal" onClick={() => setForm({})}><UserPlus size={18} /> Novo usuário</button>}>
        Só administradores criam acessos. Cada pessoa entra com usuário e senha, sem e-mail. Se alguém esquecer a senha, redefina aqui.
      </PageHead>

      {list.loading ? <Loading /> : list.error ? <div className="form-error" role="alert">{list.error} <button className="link-btn" onClick={list.reload}>Tentar de novo</button></div> : users.length === 0 ? (
        <EmptyState title="Nenhum usuário" action={<button className="btn btn--teal" onClick={() => setForm({})}><Plus size={18} /> Novo usuário</button>} />
      ) : (
        <>
          <div className="card table-wrap">
            <table className="tbl">
              <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.full_name}</b>{u.id === profile?.id && <span className="chip" style={{ marginLeft: 8 }}>você</span>}</td>
                    <td>@{u.username}</td><td>{roleChip(u)}</td><td>{statusChip(u)}</td>
                    <td>{u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : 'Nunca entrou'}</td>
                    <td><Actions u={u} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="user-cards">
            {users.map((u) => (
              <div key={u.id} className="card user-card">
                <div><b>{u.full_name}</b> {u.id === profile?.id && <span className="chip">você</span>}<div style={{ color: 'var(--muted)' }}>@{u.username}</div></div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{roleChip(u)}{statusChip(u)}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Último acesso: {u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : 'nunca entrou'}</div>
                <Actions u={u} />
              </div>
            ))}
          </div>
        </>
      )}

      {form && <UserFormModal user={form.user} onClose={() => setForm(null)} onDone={(r) => { setForm(null); list.reload(); if (r) setCreds(r); }} />}
      {reset && <ResetModal user={reset} onClose={() => setReset(null)} onDone={(pw) => { setCreds({ username: reset.username, password: pw }); setReset(null); }} />}
      {creds && <Credentials {...creds} onClose={() => setCreds(null)} />}
      {toggle && (
        <ConfirmDialog title={toggle.active ? 'Desativar acesso' : 'Reativar acesso'} confirmLabel={toggle.active ? 'Desativar' : 'Reativar'} danger={toggle.active} busy={busy} onClose={() => setToggle(null)} onConfirm={doToggle}>
          <p>{toggle.active ? `${toggle.full_name} deixa de conseguir entrar no portal. O que ela criou continua salvo.` : `${toggle.full_name} volta a conseguir entrar com o mesmo usuário e senha.`}</p>
        </ConfirmDialog>
      )}
      {del && (
        <ConfirmDialog title="Excluir acesso" confirmLabel="Excluir acesso" danger busy={busy} onClose={() => setDel(null)} onConfirm={doDelete}>
          <p>O acesso de {del.full_name} (@{del.username}) será excluído definitivamente. Perguntas e materiais que ela enviou continuam no portal, sem autoria.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
