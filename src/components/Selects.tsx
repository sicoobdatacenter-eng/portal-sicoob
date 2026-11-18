import { useMemo, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import type { DocumentRow } from '../lib/types';
import { norm } from '../lib/utils';

export function CategorySelect({ value, onChange, id, allLabel, excludeId, onlyTop, required }: {
  value: string; onChange: (v: string) => void; id?: string; allLabel?: string; excludeId?: string; onlyTop?: boolean; required?: boolean;
}) {
  const { flat } = useCatalog();
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{allLabel ?? 'Sem categoria'}</option>
      {flat.filter((f) => f.cat.id !== excludeId && (!onlyTop || f.depth === 0)).map(({ cat, depth }) => (
        <option key={cat.id} value={cat.id}>{depth ? '— ' : ''}{cat.name}</option>
      ))}
    </select>
  );
}

export function DocPicker({ docs, selected, onChange }: { docs: DocumentRow[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => docs.filter((d) => !q || norm(d.title).includes(norm(q))), [docs, q]);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <div>
      <input className="input" type="search" placeholder="Filtrar documentos pelo título" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} aria-label="Filtrar documentos" />
      <div className="doc-checklist">
        {list.length === 0 && <div className="hint" style={{ padding: 8 }}>Nenhum documento encontrado.</div>}
        {list.map((d) => (
          <label key={d.id}>
            <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
            <span>{d.title}</span>
          </label>
        ))}
      </div>
      <span className="hint">{selected.length} selecionado(s)</span>
    </div>
  );
}
