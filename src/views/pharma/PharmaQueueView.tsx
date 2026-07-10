import React from 'react';
import { useAppStore } from '../../store';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle, History } from 'lucide-react';
import { format } from 'date-fns';

export default function PharmaQueueView() {
  const { orders, updateOrder } = useAppStore();
  
  // Pharma cares about 'Revisión Farmacéutica' and 'En preparación'
  const pendingOrders = orders.filter(o => o.estado === 'Revisión Farmacéutica');
  const preparingOrders = orders.filter(o => o.estado === 'En preparación');
  
  const statePriority: Record<string, number> = {
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

  const historyOrders = orders.filter(o => 
    o.estado !== 'Nuevo' && 
    o.estado !== 'Revisión Farmacéutica' && 
    o.estado !== 'En preparación'
  ).sort((a, b) => {
    const priorityA = statePriority[a.estado] || 99;
    const priorityB = statePriority[b.estado] || 99;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
  });

  const getBadgeVariant = (s: string) => {
    switch(s) {
      case 'Cotizado': return 'warning';
      case 'Pago Pendiente': return 'warning';
      case 'Pagado': return 'success';
      case 'Entregado': return 'success';
      case 'Cancelado': return 'danger';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Farmacia</h2>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Pedidos pendientes de cotización y preparación</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Review */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-amber-700 pb-2 border-b border-amber-200">
            <Clock size={20} />
            <h3 className="font-semibold text-lg">Pendientes de Cotización ({pendingOrders.length})</h3>
          </div>
          
          {pendingOrders.length === 0 && (
            <p className="text-sm text-slate-500 italic">No hay pedidos pendientes de cotizar.</p>
          )}

          {pendingOrders.map(order => (
            <Card key={order.id} className="border-amber-200 hover:shadow-md transition">
              <CardContent className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-mono font-bold text-slate-400 mb-1">ID: {order.id}</p>
                    <p className="font-bold text-slate-900">{order.obraSocial || 'Sin Obra Social'}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest truncate max-w-[200px]">{order.pacienteId}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="warning" className="mb-2 block text-center">Requiere Precio</Badge>
                    {order.token && (
                      <div className="bg-slate-900 text-white px-2 py-1 rounded text-xs font-mono font-bold tracking-widest">
                        TKN: {order.token}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="bg-slate-50 p-2 rounded text-sm text-slate-700 border border-slate-200">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Medicación solicitada:</p>
                  <ul className="list-disc pl-4 space-y-1 font-medium text-slate-800">
                    {order.medicamentos.map((m, i) => (
                      <li key={i}>{m.nombre} {m.cantidad ? `(x${m.cantidad})` : ''}</li>
                    ))}
                  </ul>
                </div>
                
                <Link to={`/queue/${order.id}`}>
                  <Button className="w-full mt-2" size="sm">Cargar Cotización</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Preparing */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-blue-700 pb-2 border-b border-blue-200">
            <CheckCircle size={20} />
            <h3 className="font-semibold text-lg">En Preparación ({preparingOrders.length})</h3>
          </div>
          
          {preparingOrders.length === 0 && (
            <p className="text-sm text-slate-500 italic">No hay pedidos en preparación.</p>
          )}

          {preparingOrders.map(order => (
            <Card key={order.id} className="border-blue-200 hover:shadow-md transition">
              <CardContent className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-mono font-bold text-slate-400 mb-1">ID: {order.id}</p>
                    <p className="font-bold text-slate-900">{order.pacienteId}</p>
                  </div>
                  <Badge variant="info">Preparando</Badge>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Link to={`/queue/${order.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">Ver Detalles</Button>
                  </Link>
                  <Button 
                    className="flex-1 font-bold tracking-wider text-[10px]" 
                    size="sm"
                    onClick={() => updateOrder(order.id, { estado: 'En reparto' })}
                  >
                    MARCAR RETIRADO
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* History section below the grid */}
      <div className="mt-8">
        <div className="flex items-center gap-2 text-slate-700 pb-2 border-b border-slate-200 mb-4">
          <History size={20} />
          <h3 className="font-semibold text-lg">Historial de Pedidos ({historyOrders.length})</h3>
        </div>
        
        {historyOrders.length === 0 && (
          <p className="text-sm text-slate-500 italic">No hay historial reciente.</p>
        )}
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">ID_Pedido</th>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Fecha</th>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Obra Social</th>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Medicamentos</th>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Estado</th>
                <th className="px-6 py-4 text-right font-bold uppercase tracking-widest text-[10px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyOrders.map(o => (
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
                  <td className="px-6 py-4 font-mono font-bold text-xs">
                    <span className="bg-slate-100 px-2 py-1 rounded text-slate-700">{o.id}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{format(new Date(o.fecha), 'dd/MM/yy HH:mm')}</td>
                  <td className="px-6 py-4 font-bold text-slate-700">{o.obraSocial || '-'}</td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600 truncate max-w-[200px]" title={o.medicamentos.map(m => m.nombre).join(', ')}>
                    {o.medicamentos.map(m => m.nombre).join(', ')}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={getBadgeVariant(o.estado)}>{o.estado}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      to={`/queue/${o.id}`} 
                      className="text-blue-600 hover:text-blue-700 font-bold text-[10px] uppercase tracking-widest bg-blue-50 px-3 py-2 rounded transition-colors inline-block"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
