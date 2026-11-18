// Regras de login compartilhadas entre a interface, as Netlify Functions e o script de setup.
// O Supabase Auth exige um e-mail por conta; aqui ele é só um identificador interno
// derivado do nome de usuário. Nenhuma mensagem é enviada para ele e o usuário nunca o vê.

export const DEFAULT_EMAIL_DOMAIN = 'portal-psp5.local';
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // limite do bcrypt

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function usernameError(value) {
  const u = normalizeUsername(value);
  if (!USERNAME_RE.test(u)) {
    return 'O login deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado, começando por letra ou número.';
  }
  return null;
}

export function passwordError(value) {
  const p = String(value ?? '');
  if (p.length < PASSWORD_MIN) return `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (new TextEncoder().encode(p).length > PASSWORD_MAX) return `A senha deve ter no máximo ${PASSWORD_MAX} caracteres.`;
  return null;
}

export function internalEmail(username, domain) {
  return `${normalizeUsername(username)}@${(domain || DEFAULT_EMAIL_DOMAIN).trim().toLowerCase()}`;
}
