import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Lockup } from '../components/Brand';

export function Login() {
  const { signIn, notice, clearNotice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    clearNotice(); setErr(null);
    if (!username.trim() || !password) return setErr('Informe o usuário e a senha.');
    setBusy(true);
    const r = await signIn(username, password);
    setBusy(false);
    if (r) setErr(r);
  }
  const message = err ?? notice;

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <h1>Conhecimento do projeto, num só lugar</h1>
        <p>Entregas, processos, tutoriais e respostas do projeto Sicoob e UnB, reunidos para consulta e construídos pela própria equipe.</p>
        <div className="rack">
          <div className="unit"><i className="on" /><i className="on2" /><i /><i className="on3" /><i /><i /><i className="on2" /><i /></div>
          <div className="unit"><i /><i className="on3" /><i className="on" /><i /><i className="on2" /><i /><i /><i className="on" /></div>
          <div className="unit"><i className="on2" /><i /><i /><i className="on" /><i /><i className="on3" /><i className="on2" /><i /></div>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-card">
          <Lockup sicoobH={46} unbH={52} />
          <h2>Entrar no portal</h2>
          <p className="sub">Use o usuário e a senha que o administrador passou para você.</p>
          <form onSubmit={submit} noValidate>
            {message && <div className="form-error" role="alert">{message}</div>}
            <div className="field">
              <label htmlFor="l-user">Usuário</label>
              <input id="l-user" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
            </div>
            <div className="field">
              <label htmlFor="l-pass">Senha</label>
              <div className="input-group">
                <input id="l-pass" className="input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                <button type="button" className="btn btn--ghost btn--icon" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button className="btn btn--teal" style={{ width: '100%', minHeight: 48 }} disabled={busy}><LogIn size={18} /> {busy ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <p className="login-help">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
        </div>
      </section>
    </div>
  );
}

export function SetupNeeded() {
  return (
    <div className="setup card card-pad">
      <h1 style={{ fontSize: '1.6rem', marginBottom: 12 }}>Falta conectar o Supabase</h1>
      <p style={{ marginBottom: 10 }}>Este ambiente não tem as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.</p>
      <p>No Netlify, cadastre as duas em <b>Site configuration &gt; Environment variables</b> e publique de novo. Localmente, copie <code>.env.example</code> para <code>.env.local</code> e preencha. O passo a passo completo está no <code>README.md</code>.</p>
    </div>
  );
}
