import React, { useState } from 'react';
import { useAppStore, ALL_PERMISSIONS } from '../../store';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

export default function UsersView() {
  const { users, updateUser } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);

  const togglePermission = (userId: string, currentPerms: string[] = [], permId: string) => {
    let newPerms;
    if (currentPerms.includes(permId)) {
      newPerms = currentPerms.filter(p => p !== permId);
    } else {
      newPerms = [...currentPerms, permId];
    }
    updateUser(userId, { permissions: newPerms });
  };
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Usuarios y Permisos</h2>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Gestión de accesos al portal</p>
        </div>
        <Button>+ Nuevo Usuario</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">Nombre de Usuario</th>
                <th className="px-6 py-4">Rol / Nivel de Acceso</th>
                <th className="px-6 py-4">Código PIN (Login)</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <React.Fragment key={u.id}>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{u.name}</td>
                    <td className="px-6 py-4">
                      <Badge variant={u.role === 'team' ? 'info' : u.role === 'pharma' ? 'warning' : 'success'}>
                        {u.role.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-500 bg-slate-100 rounded px-2 py-1 m-4 inline-block">{u.code}</td>
                    <td className="px-6 py-4 text-right">
                      <Button 
                        variant={editingId === u.id ? "primary" : "outline"} 
                        size="sm" 
                        className="mr-2"
                        onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                      >
                        {editingId === u.id ? "Cerrar" : "Editar Permisos"}
                      </Button>
                      <Button variant="danger" size="sm">Bloquear</Button>
                    </td>
                  </tr>
                  {editingId === u.id && (
                    <tr className="bg-slate-50/80 border-t border-slate-100">
                      <td colSpan={4} className="px-8 py-6">
                        <h4 className="font-bold text-slate-700 mb-4 text-xs uppercase tracking-widest">Módulos Permitidos</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          {ALL_PERMISSIONS.map(perm => {
                            const isChecked = (u.permissions || []).includes(perm.id);
                            return (
                              <label key={perm.id} className="flex items-center gap-2 p-3 bg-white rounded border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-blue-600 rounded"
                                  checked={isChecked}
                                  onChange={() => togglePermission(u.id, u.permissions, perm.id)}
                                />
                                <span className={`text-sm font-medium ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>{perm.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
