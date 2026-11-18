export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Termo seguro para usar em ilike (escapa % _ \ e vírgulas/parênteses do filtro .or). */
export const likeTerm = (s: string) =>
  norm(s).replace(/[\\%_]/g, (c) => '\\' + c).replace(/[,()"]/g, ' ').replace(/\s+/g, ' ').trim();

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)).replace('.', '') : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

export function fmtBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

export function isHttpUrl(v: string): boolean {
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export interface Provider { key: string; label: string; }
export function detectProvider(url: string): Provider {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { /* ignore */ }
  if (host.endsWith('figma.com')) return { key: 'figma', label: 'Figma' };
  if (host.endsWith('diagrams.net') || host.endsWith('draw.io')) return { key: 'drawio', label: 'draw.io' };
  if (host === 'drive.google.com') return { key: 'drive', label: 'Google Drive' };
  if (host === 'docs.google.com') {
    if (/\/spreadsheets\//.test(url)) return { key: 'gsheets', label: 'Google Planilhas' };
    if (/\/presentation\//.test(url)) return { key: 'gslides', label: 'Google Apresentações' };
    return { key: 'gdocs', label: 'Google Docs' };
  }
  if (host.endsWith('youtube.com') || host === 'youtu.be') return { key: 'youtube', label: 'YouTube' };
  if (host.endsWith('sharepoint.com') || host.endsWith('office.com') || host.endsWith('onedrive.live.com')) return { key: 'microsoft', label: 'Microsoft 365' };
  if (host.endsWith('notion.so') || host.endsWith('notion.site')) return { key: 'notion', label: 'Notion' };
  return { key: 'web', label: host.replace(/^www\./, '') || 'Link externo' };
}
export const providerLabel = (key: string | null | undefined, url?: string | null) => {
  const map: Record<string, string> = { figma: 'Figma', drawio: 'draw.io', drive: 'Google Drive', gdocs: 'Google Docs', gsheets: 'Google Planilhas', gslides: 'Google Apresentações', youtube: 'YouTube', microsoft: 'Microsoft 365', notion: 'Notion' };
  if (key && map[key]) return map[key];
  return url ? detectProvider(url).label : 'Link externo';
};

/** Sugere o tipo de material a partir da extensão do arquivo ou do provedor do link. */
export function suggestType(opts: { fileName?: string; mime?: string; provider?: string }): string | null {
  const ext = opts.fileName?.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(ext)) return 'excel';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext) || opts.mime?.startsWith('video/')) return 'video';
  if (opts.provider === 'figma') return 'prototipo';
  if (opts.provider === 'drawio') return 'fluxograma';
  if (opts.provider === 'youtube') return 'video';
  if (opts.provider === 'gsheets') return 'excel';
  if (opts.provider === 'gdocs') return 'word';
  return null;
}

/** URL de incorporação (iframe) quando o provedor permite. */
export function embedUrl(url: string): string | null {
  const p = detectProvider(url);
  try {
    const u = new URL(url);
    if (p.key === 'figma') {
      return `https://www.figma.com/embed?embed_host=portal-sicoob-unb&url=${encodeURIComponent(url)}`;
    }
    if (p.key === 'gdocs' || p.key === 'gsheets' || p.key === 'gslides') {
      const m = u.pathname.match(/^(\/(?:document|spreadsheets|presentation)\/d\/[^/]+)/);
      return m ? `https://docs.google.com${m[1]}/preview` : null;
    }
    if (p.key === 'drive') {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null; // pastas não incorporam
    }
    if (p.key === 'youtube') {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
      return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
  } catch { /* ignore */ }
  return null;
}

export function safeStorageName(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (base || 'arquivo').slice(-120);
}

const PW_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePassword(len = 12): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => PW_CHARS[n % PW_CHARS.length]).join('');
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const errMsg = (e: unknown, fallback = 'Algo deu errado. Tente novamente.') => {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const m = (e as { message: string }).message;
    if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.';
    if (/duplicate key|already exists|categories_unique_name/i.test(m)) return 'Já existe um item com esse nome.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.';
    return m;
  }
  return fallback;
};
