import { Component, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { CatalogProvider } from './lib/catalog';
import { isConfigured } from './lib/supabase';
import { Layout } from './components/Layout';
import { EmptyState, Loading, ToastProvider } from './components/ui';
import { Login, SetupNeeded } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Documents } from './pages/Documents';
import { DocumentDetail } from './pages/DocumentDetail';
import { Faq } from './pages/Faq';
import { Categories } from './pages/Categories';
import { Contributions } from './pages/Contributions';
import { Users } from './pages/Users';
import { History } from './pages/History';
import { SearchPage } from './pages/Search';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="setup"><EmptyState title="Algo deu errado nesta página" action={<button className="btn" onClick={() => location.assign('/')}>Voltar ao início</button>}>Recarregue a página. Se o problema continuar, avise o administrador.</EmptyState></div>;
  }
}

function Gate() {
  const { status, isAdmin } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'anon') return <Login />;
  return (
    <CatalogProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="documentos" element={<Documents />} />
          <Route path="documentos/:id" element={<DocumentDetail />} />
          <Route path="faq" element={<Faq />} />
          <Route path="categorias" element={<Categories />} />
          <Route path="contribuicoes" element={<Contributions />} />
          <Route path="busca" element={<SearchPage />} />
          <Route path="usuarios" element={isAdmin ? <Users /> : <Navigate to="/" replace />} />
          <Route path="historico" element={isAdmin ? <History /> : <Navigate to="/" replace />} />
          <Route path="*" element={<EmptyState icon={<SearchX size={30} />} title="Página não encontrada" action={<a className="btn" href="/">Ir para o início</a>}>O endereço não existe ou foi movido.</EmptyState>} />
        </Route>
      </Routes>
    </CatalogProvider>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />;
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
