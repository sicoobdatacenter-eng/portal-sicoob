// Adaptador para a Vercel: reaproveita a mesma lógica da função da Netlify,
// assim há um único código de gerenciamento de usuários para manter.
import handler from '../netlify/functions/admin-users.mjs';

export async function POST(request) {
  return handler(request);
}
