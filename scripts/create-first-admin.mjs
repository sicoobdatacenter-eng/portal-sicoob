#!/usr/bin/env node
// Cria o PRIMEIRO administrador do portal (procedimento único de configuração inicial).
// Nenhuma credencial fica no código: login e senha são digitados aqui, no seu terminal.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run setup:admin
//
// Também lê essas variáveis de um arquivo .env.local (que não vai para o Git).
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  DEFAULT_EMAIL_DOMAIN, internalEmail, normalizeUsername, passwordError, usernameError,
} from '../shared/auth.js';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.VITE_AUTH_EMAIL_DOMAIN || process.env.AUTH_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN;
const die = (msg) => { console.error('\n✖ ' + msg + '\n'); process.exit(1); };

if (!url || !serviceKey) {
  die('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (Supabase > Project Settings > API) antes de executar.');
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));
const askHidden = (q) => new Promise((resolve) => {
  if (!process.stdin.isTTY) { rl.question(q, resolve); return; }
  process.stdout.write(q);
  const stdin = process.stdin;
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  let buf = '';
  const onData = (ch) => {
    for (const c of ch) {
      if (c === '\r' || c === '\n' || c === '\u0004') {
        stdin.setRawMode(false); stdin.removeListener('data', onData);
        process.stdout.write('\n'); resolve(buf); return;
      }
      if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
      if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
      else buf += c;
    }
  };
  stdin.on('data', onData);
});

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 1) O schema precisa ter sido aplicado.
const probe = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
if (probe.error) {
  die('Não consegui ler a tabela "profiles". Execute antes supabase/migrations/001_schema.sql no SQL Editor.\n  Detalhe: ' + probe.error.message);
}
if ((probe.count ?? 0) > 0) {
  die('Já existe um administrador. Novas contas devem ser criadas pelo portal, em "Gerenciar usuários".');
}

console.log('\nPortal Sicoob | UnB — criação do administrador principal\n');
const username = normalizeUsername(process.env.ADMIN_USERNAME || (await ask('Login do administrador: ')));
const uErr = usernameError(username); if (uErr) die(uErr);
const fullName = (process.env.ADMIN_FULL_NAME || (await ask('Nome completo: '))).trim();
if (fullName.length < 2) die('Informe o nome completo.');
let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await askHidden('Senha (mín. 8 caracteres): ');
  const again = await askHidden('Repita a senha: ');
  if (password !== again) die('As senhas não conferem.');
}
const pErr = passwordError(password); if (pErr) die(pErr);
rl.close();

const { data: created, error } = await sb.auth.admin.createUser({
  email: internalEmail(username, domain), password, email_confirm: true,
});
if (error || !created?.user) {
  const hint = /invalid/i.test(error?.message || '')
    ? `\n  O Supabase recusou o identificador interno "${internalEmail(username, domain)}".\n  Defina VITE_AUTH_EMAIL_DOMAIN com outro domínio válido (o mesmo no Netlify) e tente de novo.`
    : '';
  die('Falha ao criar o usuário no Supabase Auth: ' + (error?.message || 'erro desconhecido') + hint);
}
const { error: pe } = await sb.from('profiles').insert({
  id: created.user.id, username, full_name: fullName, role: 'admin', active: true,
});
if (pe) {
  await sb.auth.admin.deleteUser(created.user.id);
  die('Falha ao criar o perfil: ' + pe.message);
}
console.log(`\n✔ Administrador "${username}" criado. Entre no portal com esse login e a senha informada.\n`);
