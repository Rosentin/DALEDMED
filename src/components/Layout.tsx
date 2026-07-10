import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { cn } from '../utils';
import { LayoutDashboard, ShoppingBag, PlusCircle, Inbox, LogOut, Menu, X, Map } from 'lucide-react';
import AssistantWidget from './AssistantWidget';
import { useState } from 'react';

export default function Layout() {
  const { currentUser, logout } = useAppStore();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  if (!currentUser) return null;

  return (
    <div className="flex bg-slate-50 min-h-[100dvh] text-slate-900 overflow-hidden relative">
      {/* Mobile Header overlay for menu button */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">D</div>
          <h1 className="text-xl font-bold text-white tracking-tight">DALED<span className="text-blue-400">MED</span></h1>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-300 p-2 focus:outline-none"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-30 md:hidden backdrop-blur-sm" 
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out h-full pt-16 md:pt-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="hidden md:block p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">D</div>
            <h1 className="text-xl font-bold text-white tracking-tight">DALED<span className="text-blue-400">MED</span></h1>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">Grupo Dáled Platform</p>
        </div>
        
        <nav className="flex-1 py-4 flex flex-col overflow-y-auto">
          <div className="px-6 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Operaciones</div>
          {currentUser.permissions?.includes('dashboard') && (
            <NavLink to="/dashboard" onClick={closeMobileMenu} className={({isActive}) => cn("flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors", isActive ? "bg-blue-600/10 text-blue-400 border-r-4 border-blue-600" : "hover:bg-slate-800")}>
              <LayoutDashboard size={20} />
              Dashboard
            </NavLink>
          )}
          
          {(currentUser.role === 'maipumed' || currentUser.role === 'team' || currentUser.role === 'admin' || currentUser.permissions?.includes('dashboard')) && (
            <NavLink to="/monitoring" onClick={closeMobileMenu} className={({isActive}) => cn("flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors", isActive ? "bg-blue-600/10 text-blue-400 border-r-4 border-blue-600" : "hover:bg-slate-800")}>
              <Map size={20} />
              Monitoreo GPS
            </NavLink>
          )}
          
          {currentUser.permissions?.includes('orders') && (
            <>
              <NavLink to="/orders/new" onClick={closeMobileMenu} className={({isActive}) => cn("flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors", isActive ? "bg-blue-600/10 text-blue-400 border-r-4 border-blue-600" : "hover:bg-slate-800")}>
                <PlusCircle size={20} />
                Nuevo Pedido
              </NavLink>
            </>
          )}

          {currentUser.permissions?.includes('queue') && (
            <NavLink to="/queue" onClick={closeMobileMenu} className={({isActive}) => cn("flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors", isActive ? "bg-blue-600/10 text-blue-400 border-r-4 border-blue-600" : "hover:bg-slate-800")}>
              <Inbox size={20} />
              Farmacia
            </NavLink>
          )}

          {currentUser.permissions?.includes('orders') && (
            <NavLink to="/orders" onClick={closeMobileMenu} className={({isActive}) => cn("flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors", isActive ? "bg-blue-600/10 text-blue-400 border-r-4 border-blue-600" : "hover:bg-slate-800")}>
              <ShoppingBag size={20} />
              Gestión de Pedidos
            </NavLink>
          )}

          {(currentUser.permissions?.includes('config') || currentUser.permissions?.includes('users')) && (
             <>
               <div className="px-6 py-6 mt-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-t border-slate-800">Configuración</div>
               
               {currentUser.permissions?.includes('config') && (
                 <NavLink to="/config" onClick={closeMobileMenu} className={({isActive}) => cn("flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors", isActive ? "bg-blue-600/10 text-blue-400 border-r-4 border-blue-600" : "hover:bg-slate-800")}>
                   <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                   Márgenes y Costos
                 </NavLink>
               )}
               {currentUser.permissions?.includes('users') && (
                 <NavLink to="/users" onClick={closeMobileMenu} className={({isActive}) => cn("flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors", isActive ? "bg-blue-600/10 text-blue-400 border-r-4 border-blue-600" : "hover:bg-slate-800")}>
                   <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                   Usuarios y Permisos
                 </NavLink>
               )}
             </>
          )}
        </nav>
        
        <div className="p-6 bg-slate-950 mt-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-slate-300">
              {currentUser.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-[10px] text-blue-400 font-mono tracking-tighter uppercase">ID: {currentUser.code} • {currentUser.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden pt-16 md:pt-0">
        <div className="flex-1 overflow-y-auto w-full p-4 md:p-8">
          <Outlet />
        </div>
      </main>
      <AssistantWidget />
    </div>
  );
}
