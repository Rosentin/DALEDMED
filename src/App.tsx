import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore, initFirebaseSync } from './store';
import { useEffect } from 'react';
import LoginView from './views/LoginView';
import Layout from './components/Layout';
import DashboardView from './views/team/DashboardView';
import ConfigView from './views/team/ConfigView';
import UsersView from './views/team/UsersView';
import OrdersListView from './views/shared/OrdersListView';
import CreateOrderView from './views/admin/CreateOrderView';
import PharmaQueueView from './views/pharma/PharmaQueueView';
import OrderDetailView from './views/shared/OrderDetailView';
import MonitoringView from './views/shared/MonitoringView';

function ProtectedRoute({ children, allowedRoles, allowedPermission }: { children: React.ReactNode, allowedRoles?: string[], allowedPermission?: string }) {
  const currentUser = useAppStore(state => state.currentUser);
  
  if (!currentUser) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    // legacy check
  }
  
  if (allowedPermission) {
    if (!currentUser.permissions?.includes(allowedPermission)) {
       return <Navigate to="/" replace />;
    }
  } else if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  const currentUser = useAppStore(state => state.currentUser);

  useEffect(() => {
    const unsub = initFirebaseSync();
    return () => unsub();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginView />} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          {/* Default redirect based on first available permission */}
          <Route index element={
            currentUser?.permissions?.includes('dashboard') ? <Navigate to="/dashboard" replace /> :
            currentUser?.permissions?.includes('queue') ? <Navigate to="/queue" replace /> :
            <Navigate to="/orders" replace />
          } />
          
          {/* Team Routes */}
          <Route path="dashboard" element={
            <ProtectedRoute allowedPermission="dashboard"><DashboardView /></ProtectedRoute>
          } />
          <Route path="monitoring" element={
            <ProtectedRoute allowedRoles={['maipumed', 'team', 'admin']}><MonitoringView /></ProtectedRoute>
          } />
          <Route path="config" element={
            <ProtectedRoute allowedPermission="config"><ConfigView /></ProtectedRoute>
          } />
          <Route path="users" element={
            <ProtectedRoute allowedPermission="users"><UsersView /></ProtectedRoute>
          } />
          
          {/* Shared Routes */}
          <Route path="orders" element={
            <ProtectedRoute allowedPermission="orders"><OrdersListView /></ProtectedRoute>
          } />
          <Route path="orders/:id" element={
            <ProtectedRoute allowedPermission="orders"><OrderDetailView /></ProtectedRoute>
          } />
          
          {/* Admin Routes */}
          <Route path="orders/new" element={
            <ProtectedRoute allowedPermission="orders"><CreateOrderView /></ProtectedRoute>
          } />
          
          {/* Pharma Routes */}
          <Route path="queue" element={
            <ProtectedRoute allowedPermission="queue"><PharmaQueueView /></ProtectedRoute>
          } />
          <Route path="queue/:id" element={
            <ProtectedRoute allowedPermission="queue"><OrderDetailView /></ProtectedRoute>
          } />
          
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
