import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { HelpCircle, History, Home, KeyRound, Layers, LogOut, Menu, MessageSquarePlus, Search, ShieldCheck, Users, X, FolderOpen, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { initials } from '../lib/utils';
import { passwordError } from '../../shared/auth.js';
import { Lockup } from './Brand';
import { Field, Modal, useToast } from './ui';

function NavItem({ to, icon: Icon, children, count, end }: { to: string; icon: LucideIcon; children: string; count?: number; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      <Icon size={19} aria-hidden="true" />
      <span>{children}</span>
      {count ? <span className="count" aria-label={`${count} pendentes`}>{count}</span> : null}
    </NavLink>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const pe = passwordError(next);
    if (pe) return setErr(pe);
    if (next !== again) return setErr('A confirmação não confere com a nova senha.');
    if (next === cur) return setErr('A nova senha precisa ser diferente da atual.');
    setBusy(true); setErr(null);
    const r = await changePassword(cur, next);
    setBusy(false);
    if (r) return setErr(r);
    toast.ok('Senha alterada.');
    onClose();
  }
  return (
    <Modal title="Alterar minha senha" onClose={onClose} narrow closeDisabled={busy}
      footer={<>
        <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" form="pw-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha'}</button>
      </>}>
      <form id="pw-form" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label="Senha atual" htmlFor="pw-cur"><input id="pw-cur" className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
        <Field label="Nova senha" htmlFor="pw-new" hint="Mínimo de 8 caracteres."><input id="pw-new" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        <Field label="Repita a nova senha" htmlFor="pw-again"><input id="pw-again" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></Field>
      </form>
    </Modal>
  );
}

export function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [q, setQ] = useState(loc.pathname === '/busca' ? params.get('q') ?? '' : '');
  const [pending, setPending] = useState(0);

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { if (loc.pathname !== '/busca') setQ(''); }, [loc.pathname]);

  // Contador de itens aguardando o administrador
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const load = async () => {
      const [a, b] = await Promise.all([
        supabase.from('faq_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('suggestions').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      ]);
      if (alive) setPending((a.count ?? 0) + (b.count ?? 0));
    };
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener('portal:pending-changed', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('portal:pending-changed', load); };
  }, [isAdmin, loc.pathname]);

  function search(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) nav(`/busca?q=${encodeURIComponent(term)}`);
  }

  return (
    <div className="shell">
      <aside className="sidebar" data-open={open} aria-label="Menu principal">
        <Lockup />
        <nav className="nav">
          <NavItem to="/" icon={Home} end>Início</NavItem>
          <NavItem to="/documentos" icon={FolderOpen}>Documentos</NavItem>
          <NavItem to="/faq" icon={HelpCircle}>Perguntas frequentes</NavItem>
          <NavItem to="/categorias" icon={Layers}>Categorias</NavItem>
          <NavItem to="/contribuicoes" icon={MessageSquarePlus} count={isAdmin ? pending : 0}>{isAdmin ? 'Contribuições' : 'Minhas contribuições'}</NavItem>
          {isAdmin && (
            <>
              <div className="nav-heading">Administração</div>
              <NavItem to="/usuarios" icon={Users}>Gerenciar usuários</NavItem>
              <NavItem to="/historico" icon={History}>Histórico de alterações</NavItem>
            </>
          )}
        </nav>
        <div className="account">
          <div className="account-card">
            <div className="account-who">
              <div className="avatar" aria-hidden="true">{initials(profile?.full_name ?? '')}</div>
              <div>
                <div className="account-name">{profile?.full_name}</div>
                <div className="account-sub">@{profile?.username} · {isAdmin ? 'Administrador' : 'Usuário'}</div>
              </div>
            </div>
            <div className="account-actions">
              <button onClick={() => setPwOpen(true)}><KeyRound size={15} /> Senha</button>
              <button onClick={() => signOut()}><LogOut size={15} /> Sair</button>
            </div>
          </div>
        </div>
      </aside>
      <div className="scrim" data-open={open} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn--ghost btn--icon menu-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Lockup sicoobH={22} unbH={26} />
          <form className="search" role="search" onSubmit={search}>
            <Search size={18} aria-hidden="true" />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar no portal" aria-label="Pesquisa global" />
          </form>
          {isAdmin && <span className="chip chip--lime" title="Você tem acesso administrativo"><ShieldCheck size={14} /> Admin</span>}
        </header>
        <main className="content" id="conteudo"><Outlet /></main>
      </div>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}
