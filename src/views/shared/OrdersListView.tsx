import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { OrderState } from '../../types';

export default function OrdersListView() {
  const orders = useAppStore(state => state.orders);

  const [filterDate, setFilterDate] = useState('');
  const [filterID, setFilterID] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterMedication, setFilterMedication] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filteredOrders = orders.filter(o => {
    if (filterDate && !o.fecha.startsWith(filterDate)) return false;
    if (filterID && !o.id.toLowerCase().includes(filterID.toLowerCase())) return false;
    if (filterPatient && !o.pacienteId.toLowerCase().includes(filterPatient.toLowerCase())) return false;
    if (filterStatus && o.estado !== filterStatus) return false;
    if (filterMedication) {
      const hasMed = o.medicamentos.some(m => m.nombre.toLowerCase().includes(filterMedication.toLowerCase()));
      if (!hasMed) return false;
    }
    return true;
  });

  const statePriority: Record<OrderState, number> = {
    'Cotizado': 1,
    'En reparto': 2,
    'Nuevo': 3,
    'Revisión Farmacéutica': 3,
    'Pago Pendiente': 3,
    'Pagado': 3,
    'En preparación': 3,
    'Listo para retirar': 3,
    'Aceptado por paciente': 3,
    'En camino': 2,
    'Entregado': 4,
    'Cancelado': 5,
  };

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const priorityA = statePriority[a.estado] || 99;
    const priorityB = statePriority[b.estado] || 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
  });

  const getBadgeStyle = (s: OrderState) => {
    switch(s) {
      case 'Nuevo':
        return 'bg-sky-100 text-sky-800 border border-sky-200';
      case 'Revisión Farmacéutica':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'Cotizado':
        return 'bg-purple-100 text-purple-800 border border-purple-200';
      case 'Pago Pendiente':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'Pagado':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'En preparación':
        return 'bg-cyan-100 text-cyan-800 border border-cyan-200';
      case 'En reparto':
        return 'bg-indigo-600 text-white border border-indigo-700 animate-pulse font-extrabold';
      case 'Entregado':
        return 'bg-emerald-600 text-white border border-emerald-700 font-extrabold';
      case 'Cancelado':
        return 'bg-rose-100 text-rose-800 border border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Gestión de Pedidos</h2>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Historial de órdenes DALEDMED</p>
        </div>
        <Link to="/orders/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-blue-500 transition shadow-lg shadow-blue-900/40">
          Nuevo Pedido
        </Link>
      </div>

      <Card className="p-4 bg-slate-50/50 border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Input 
            placeholder="Filtrar por Fecha..." 
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
          />
          <Input 
            placeholder="Buscar ID..." 
            value={filterID}
            onChange={e => setFilterID(e.target.value)}
          />
          <Input 
            placeholder="Buscar Paciente..." 
            value={filterPatient}
            onChange={e => setFilterPatient(e.target.value)}
          />
          <Input 
            placeholder="Buscar Medicamento..." 
            value={filterMedication}
            onChange={e => setFilterMedication(e.target.value)}
          />
          <select 
            className="flex h-10 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">Todos los Estados</option>
            <option value="Nuevo">Nuevo</option>
            <option value="Cotizado">Cotizado</option>
            <option value="Pago Pendiente">Pago Pendiente</option>
            <option value="Pagado">Pagado</option>
            <option value="En preparación">En preparación</option>
          </select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase tracking-widest font-bold">
              <tr>
                <th className="px-6 py-4">ID Pedido</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Paciente</th>
                <th className="px-6 py-4">Medicamento(s)</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No hay pedidos que coincidan con los filtros.
                  </td>
                </tr>
              ) : null}
              {sortedOrders.map(o => (
                <tr 
                  key={o.id} 
                  className={`transition-colors hover:bg-slate-100/90 ${
                    o.estado === 'Cotizado' 
                      ? 'bg-purple-50/40 border-l-4 border-l-purple-500' 
                      : o.estado === 'En reparto' || o.estado === 'En camino'
                      ? 'bg-indigo-50/40 border-l-4 border-l-indigo-600 font-bold' 
                      : o.estado === 'Entregado'
                      ? 'bg-emerald-50/20 opacity-80 border-l-4 border-l-emerald-500'
                      : 'border-l-4 border-l-slate-300'
                  }`}
                >
                  <td className="px-6 py-4 font-mono font-bold text-xs bg-slate-100 px-3 py-1 rounded inline-block m-4 text-slate-900">{o.id}</td>
                  <td className="px-6 py-4">{format(new Date(o.fecha), 'dd/MM/yy HH:mm')}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{o.pacienteId || 'Sin asignar'}</td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600 truncate max-w-[200px]" title={o.medicamentos.map(m => m.nombre).join(', ')}>
                    {o.medicamentos.map(m => m.nombre).join(', ')}
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={getBadgeStyle(o.estado)}>{o.estado}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/orders/${o.id}`} className="text-blue-600 hover:text-blue-700 font-bold text-[10px] uppercase tracking-widest bg-blue-50 px-3 py-2 rounded transition-colors inline-block">
                      Detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
