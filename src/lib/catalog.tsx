import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Category, CategoryStat, DocType, Profile } from './types';

interface CatalogCtx {
  loading: boolean;
  categories: Category[];
  docTypes: DocType[];
  stats: Map<string, CategoryStat>;
  people: Map<string, Profile>;
  /** Lista plana com recuo: pais seguidos das suas subcategorias. */
  flat: { cat: Category; depth: number }[];
  catName: (id: string | null | undefined) => string | null;
  typeOf: (key: string) => DocType | undefined;
  personName: (id: string | null | undefined) => string;
  /** Id da categoria + ids das suas subcategorias. */
  withChildren: (id: string) => string[];
  refresh: () => Promise<void>;
}
const Ctx = createContext<CatalogCtx | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [stats, setStats] = useState<Map<string, CategoryStat>>(new Map());
  const [people, setPeople] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [c, t, s, p] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('document_types').select('*').order('sort_order'),
      supabase.from('category_stats').select('*'),
      supabase.from('profiles').select('*'),
    ]);
    setCategories((c.data ?? []) as Category[]);
    setDocTypes((t.data ?? []) as DocType[]);
    setStats(new Map(((s.data ?? []) as CategoryStat[]).map((r) => [r.category_id, { ...r, documents: Number(r.documents), faqs: Number(r.faqs) }])));
    setPeople(new Map(((p.data ?? []) as Profile[]).map((r) => [r.id, r])));
    setLoading(false);
  }, []);

  useEffect(() => { if (status === 'ready') refresh(); }, [status, refresh]);

  const value = useMemo<CatalogCtx>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const tops = categories.filter((c) => !c.parent_id);
    const flat = tops.flatMap((t) => [
      { cat: t, depth: 0 },
      ...categories.filter((c) => c.parent_id === t.id).map((c) => ({ cat: c, depth: 1 })),
    ]);
    return {
      loading, categories, docTypes, stats, people, flat,
      catName: (id) => (id ? byId.get(id)?.name ?? null : null),
      typeOf: (k) => docTypes.find((t) => t.key === k),
      personName: (id) => (id ? people.get(id)?.full_name ?? 'Usuário removido' : 'Sistema'),
      withChildren: (id) => [id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)],
      refresh,
    };
  }, [loading, categories, docTypes, stats, people, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCatalog fora do CatalogProvider');
  return v;
}
