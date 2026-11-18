import { Link } from 'react-router-dom';
import { CalendarDays, ExternalLink, HardDrive } from 'lucide-react';
import { iconFor, toneForType } from '../lib/icons';
import { useCatalog } from '../lib/catalog';
import { fmtBytes, fmtDate, providerLabel } from '../lib/utils';
import type { DocumentRow } from '../lib/types';

export function DocTile({ typeKey, size }: { typeKey: string; size?: number }) {
  const { typeOf } = useCatalog();
  const Icon = iconFor(typeOf(typeKey)?.icon);
  return <div className={`tile ${toneForType(typeKey)}`} aria-hidden="true"><Icon size={size ?? 22} /></div>;
}

export function sourceLabel(d: DocumentRow) {
  return d.source_kind === 'link' ? providerLabel(d.external_provider, d.external_url) : 'Arquivo';
}

export function DocumentCard({ doc }: { doc: DocumentRow }) {
  const { catName, typeOf } = useCatalog();
  const cat = catName(doc.category_id);
  return (
    <Link to={`/documentos/${doc.id}`} className="card doc-card">
      <div className="top">
        <DocTile typeKey={doc.type_key} />
        <div>
          <h3>{doc.title}</h3>
          <div className="meta" style={{ marginTop: 4 }}><span>{typeOf(doc.type_key)?.label ?? doc.type_key}</span></div>
        </div>
      </div>
      {doc.description && <p className="desc">{doc.description}</p>}
      <div className="meta">
        {cat && <span className="chip">{cat}</span>}
        <span className="chip chip--teal">{doc.source_kind === 'link' ? <ExternalLink size={13} /> : <HardDrive size={13} />}{sourceLabel(doc)}{doc.file_size ? ` · ${fmtBytes(doc.file_size)}` : ''}</span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CalendarDays size={14} /> {fmtDate(doc.created_at)}</span>
      </div>
    </Link>
  );
}
