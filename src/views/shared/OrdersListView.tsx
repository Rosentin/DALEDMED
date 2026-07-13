import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Order, OrderState, MedicationRequest } from '../../types';
import { Edit3, Trash2, X, Plus, Save, ChevronDown, Check, Filter } from 'lucide-react';
import { SecurityCodeModal } from '../../components/SecurityCodeModal';

const AVAILABLE_STATES: OrderState[] = [
  'Nuevo',
  'Revisión Farmacéutica',
  'Cotizado',
  'Aceptado por paciente',
  'Pago Pendiente',
  'Pagado',
  'En preparación',
  'Listo para retirar',
  'En camino',
  'En reparto',
  'Entregado',
  'Cancelado'
];

export default function OrdersListView() {
  const { orders, deleteOrder, updateOrder } = useAppStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [filterDate, setFilterDate] = useState('');
  const [filterID, setFilterID] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterMedication, setFilterMedication] = useState('');
  const [selectedStates, setSelectedStates] = useState<OrderState[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      if (statusParam === 'RepartoYEntregado') {
        setSelectedStates(['En reparto', 'Entregado']);
      } else {
        const matchingState = AVAILABLE_STATES.find(
          s => s.toLowerCase() === statusParam.toLowerCase()
        );
        if (matchingState) {
          setSelectedStates([matchingState]);
        }
      }
    } else {
      setSelectedStates([]);
    }
  }, [searchParams]);

  const toggleState = (state: OrderState) => {
    if (selectedStates.includes(state)) {
      setSelectedStates(selectedStates.filter(s => s !== state));
    } else {
      setSelectedStates([...selectedStates, state]);
    }
  };

  const clearAllStates = () => {
    setSelectedStates([]);
  };

  const selectAllStates = () => {
    setSelectedStates([...AVAILABLE_STATES]);
  };

  const [selectedOrderToEdit, setSelectedOrderToEdit] = useState<Order | null>(null);

  // Security code states
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [securityAction, setSecurityAction] = useState<'edit' | 'delete' | null>(null);
  const [targetOrder, setTargetOrder] = useState<Order | null>(null);

  const filteredOrders = orders.filter(o => {
    if (filterDate && !o.fecha.startsWith(filterDate)) return false;
    if (filterID && !o.id.toLowerCase().includes(filterID.toLowerCase())) return false;
    if (filterPatient && !o.pacienteId.toLowerCase().includes(filterPatient.toLowerCase())) return false;
    if (selectedStates.length > 0 && !selectedStates.includes(o.estado)) return false;
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
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex h-10 w-full items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 font-bold hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 select-none text-left"
            >
              <div className="flex items-center gap-2 truncate">
                <Filter size={14} className="text-slate-400 shrink-0" />
                <span className="truncate">
                  {selectedStates.length === 0
                    ? 'Todos los Estados'
                    : selectedStates.length === 1
                    ? selectedStates[0]
                    : `Estados: ${selectedStates.length}`}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedStates.length > 0 && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      clearAllStates();
                    }}
                    className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Limpiar filtros"
                  >
                    <X size={12} />
                  </span>
                )}
                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full mt-1.5 left-0 right-0 md:w-72 md:left-auto md:right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <div className="p-2 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Seleccionar Estados</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllStates}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline px-1 py-0.5 rounded transition"
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={clearAllStates}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-600 hover:underline px-1 py-0.5 rounded transition"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
                  {AVAILABLE_STATES.map((state) => {
                    const isChecked = selectedStates.includes(state);
                    const count = orders.filter(o => o.estado === state).length;
                    return (
                      <button
                        key={state}
                        type="button"
                        onClick={() => toggleState(state)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-colors text-left ${
                          isChecked 
                            ? 'bg-blue-50/70 text-blue-900' 
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                            isChecked 
                              ? 'bg-blue-600 border-blue-600 text-white' 
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}>
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>
                          <span className="truncate">{state}</span>
                        </div>
                        {count > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                            isChecked
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className={`transition-colors hover:bg-slate-100/90 cursor-pointer ${
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
                    <span className="bg-slate-100 px-3 py-1 rounded text-slate-900">{o.id}</span>
                  </td>
                  <td className="px-6 py-4">{format(new Date(o.fecha), 'dd/MM/yy HH:mm')}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{o.pacienteNombre || o.pacienteId || 'Sin asignar'}</td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600 truncate max-w-[200px]" title={o.medicamentos.map(m => m.nombre).join(', ')}>
                    {o.medicamentos.map(m => m.nombre).join(', ')}
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={getBadgeStyle(o.estado)}>{o.estado}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="text-blue-600 hover:text-blue-700 font-bold text-[10px] uppercase tracking-widest bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded transition-colors"
                      >
                        Detalle
                      </button>
                      <button
                        onClick={() => {
                          setTargetOrder(o);
                          setSecurityAction('edit');
                          setIsSecurityModalOpen(true);
                        }}
                        className="text-amber-600 hover:text-amber-700 font-bold text-[10px] uppercase tracking-widest bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded transition-colors flex items-center gap-1"
                        title="Modificar Pedido"
                      >
                        <Edit3 size={12} />
                        Modificar
                      </button>
                      <button
                        onClick={() => {
                          setTargetOrder(o);
                          setSecurityAction('delete');
                          setIsSecurityModalOpen(true);
                        }}
                        className="text-red-600 hover:text-red-700 font-bold text-[10px] uppercase tracking-widest bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded transition-colors flex items-center gap-1"
                        title="Eliminar Pedido"
                      >
                        <Trash2 size={12} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Security Code Verification Modal */}
      <SecurityCodeModal
        isOpen={isSecurityModalOpen}
        onClose={() => {
          setIsSecurityModalOpen(false);
          setSecurityAction(null);
          setTargetOrder(null);
        }}
        onConfirm={() => {
          setIsSecurityModalOpen(false);
          if (securityAction === 'edit' && targetOrder) {
            setSelectedOrderToEdit(targetOrder);
          } else if (securityAction === 'delete' && targetOrder) {
            deleteOrder(targetOrder.id);
          }
          setSecurityAction(null);
          setTargetOrder(null);
        }}
        actionLabel={securityAction === 'delete' ? 'Eliminar' : 'Modificar'}
      />

      {/* Modal para Modificar Pedido */}
      {selectedOrderToEdit && (
        <EditOrderModal
          order={selectedOrderToEdit}
          onClose={() => setSelectedOrderToEdit(null)}
          onSave={(updatedOrder) => {
            updateOrder(selectedOrderToEdit.id, updatedOrder);
            setSelectedOrderToEdit(null);
          }}
        />
      )}
    </div>
  );
}

export interface EditOrderModalProps {
  order: Order;
  onClose: () => void;
  onSave: (updated: Partial<Order>) => void;
}

export function EditOrderModal({ order, onClose, onSave }: EditOrderModalProps) {
  const [pacienteId, setPacienteId] = useState(order.pacienteId || '');
  const [pacienteNombre, setPacienteNombre] = useState(order.pacienteNombre || '');
  const [dni, setDni] = useState(order.dni || '');
  const [obraSocial, setObraSocial] = useState(order.obraSocial || '');
  const [numeroAfiliado, setNumeroAfiliado] = useState(order.numeroAfiliado || '');
  const [medico, setMedico] = useState(order.medico || '');
  const [matriculaMedico, setMatriculaMedico] = useState(order.matriculaMedico || '');
  const [token, setToken] = useState(order.token || '');
  const [diagnostico, setDiagnostico] = useState(order.diagnostico || '');
  const [estado, setEstado] = useState<OrderState>(order.estado);
  const [direccionEntrega, setDireccionEntrega] = useState(order.direccionEntrega || '');
  const [distanciaKm, setDistanciaKm] = useState(order.distanciaKm || 0);
  const [costoLogistico, setCostoLogistico] = useState(order.costoLogistico || 0);
  const [estadoPago, setEstadoPago] = useState(order.estadoPago || 'Pendiente');
  const [metodoPago, setMetodoPago] = useState(order.metodoPago || 'QR');
  
  // Medications state
  const [medicamentos, setMedicamentos] = useState<MedicationRequest[]>(order.medicamentos || []);

  const handleMedChange = (index: number, field: keyof MedicationRequest, val: any) => {
    const updated = [...medicamentos];
    updated[index] = { ...updated[index], [field]: val };
    setMedicamentos(updated);
  };

  const handleAddMed = () => {
    setMedicamentos([...medicamentos, {
      id: 'med_' + Math.random().toString(36).substr(2, 9),
      nombre: '',
      presentacion: '',
      dosis: '',
      cantidad: '1'
    }]);
  };

  const handleRemoveMed = (index: number) => {
    setMedicamentos(medicamentos.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      pacienteId: pacienteId.trim().toUpperCase(),
      pacienteNombre: pacienteNombre.trim().toUpperCase(),
      dni: dni.trim().toUpperCase(),
      obraSocial: obraSocial.trim().toUpperCase(),
      numeroAfiliado: numeroAfiliado.trim().toUpperCase(),
      medico: medico ? medico.trim().toUpperCase() : null,
      matriculaMedico: matriculaMedico.trim().toUpperCase(),
      token: token.trim().toUpperCase(),
      diagnostico: diagnostico.trim().toUpperCase(),
      estado,
      direccionEntrega,
      distanciaKm: Number(distanciaKm),
      costoLogistico: Number(costoLogistico),
      estadoPago,
      metodoPago,
      medicamentos: medicamentos.map(m => ({
        ...m,
        nombre: m.nombre.trim().toUpperCase(),
        presentacion: m.presentacion ? m.presentacion.trim().toUpperCase() : '',
        dosis: m.dosis ? m.dosis.trim().toUpperCase() : ''
      }))
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col my-8 max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="font-black text-[9px] uppercase tracking-widest text-slate-400 font-mono">Modificación de Pedido</h3>
            <h4 className="font-extrabold text-base text-white tracking-tight">Editar Pedido #{order.id}</h4>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800 text-sm font-bold">
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre del Paciente</label>
              <Input value={pacienteNombre} onChange={e => setPacienteNombre(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">DNI</label>
              <Input value={dni} onChange={e => setDni(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ID Paciente</label>
              <Input value={pacienteId} onChange={e => setPacienteId(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Obra Social</label>
              <Input value={obraSocial} onChange={e => setObraSocial(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Número de Afiliado</label>
              <Input value={numeroAfiliado} onChange={e => setNumeroAfiliado(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Médico</label>
              <Input value={medico} onChange={e => setMedico(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Matrícula Médico</label>
              <Input value={matriculaMedico} onChange={e => setMatriculaMedico(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Token de Receta</label>
              <Input value={token} onChange={e => setToken(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Diagnóstico</label>
              <Input value={diagnostico} onChange={e => setDiagnostico(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Estado del Pedido</label>
              <select
                className="flex h-10 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                value={estado}
                onChange={e => setEstado(e.target.value as OrderState)}
              >
                <option value="Nuevo">Nuevo</option>
                <option value="Revisión Farmacéutica">Revisión Farmacéutica</option>
                <option value="Cotizado">Cotizado</option>
                <option value="Aceptado por paciente">Aceptado por paciente</option>
                <option value="Pago Pendiente">Pago Pendiente</option>
                <option value="Pagado">Pagado</option>
                <option value="En preparación">En preparación</option>
                <option value="Listo para retirar">Listo para retirar</option>
                <option value="En camino">En camino</option>
                <option value="En reparto">En reparto</option>
                <option value="Entregado">Entregado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Método de Pago</label>
              <select
                className="flex h-10 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                value={metodoPago}
                onChange={e => setMetodoPago(e.target.value as any)}
              >
                <option value="QR">QR</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Credito">Crédito</option>
                <option value="Debito">Débito</option>
                <option value="Link">Link de Pago</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Estado de Pago</label>
              <select
                className="flex h-10 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                value={estadoPago}
                onChange={e => setEstadoPago(e.target.value as any)}
              >
                <option value="Pendiente">Pendiente</option>
                <option value="Pagado">Pagado</option>
                <option value="Rechazado">Rechazado</option>
                <option value="Anulado">Anulado</option>
                <option value="Reintegrado">Reintegrado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dirección de Entrega</label>
              <Input value={direccionEntrega} onChange={e => setDireccionEntrega(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Distancia (km)</label>
              <Input type="number" step="0.1" value={distanciaKm} onChange={e => setDistanciaKm(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Costo Logístico ($)</label>
              <Input type="number" step="1" value={costoLogistico} onChange={e => setCostoLogistico(Number(e.target.value))} />
            </div>
          </div>

          {/* Medications edit section */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex justify-between items-center mb-3">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Medicamentos Solicitados</h5>
              <button
                type="button"
                onClick={handleAddMed}
                className="text-xs text-blue-600 hover:text-blue-500 font-bold flex items-center gap-1 transition-colors"
              >
                <Plus size={14} /> Agregar Medicamento
              </button>
            </div>
            
            <div className="space-y-3">
              {medicamentos.map((med, index) => (
                <div key={med.id || index} className="flex gap-2 items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Nombre del medicamento"
                      className="flex h-8 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                      value={med.nombre}
                      onChange={e => handleMedChange(index, 'nombre', e.target.value)}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Presentación (Ej: comprimidos)"
                      className="flex h-8 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={med.presentacion || ''}
                      onChange={e => handleMedChange(index, 'presentacion', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Dosis (Ej: 50mg)"
                      className="flex h-8 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={med.dosis || ''}
                      onChange={e => handleMedChange(index, 'dosis', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Cantidad"
                      className="flex h-8 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={med.cantidad || ''}
                      onChange={e => handleMedChange(index, 'cantidad', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMed(index)}
                    className="text-red-500 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {medicamentos.length === 0 && (
                <p className="text-xs text-slate-400 italic">No hay medicamentos en la lista. Agrega al menos uno.</p>
              )}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white">
              <Save size={14} /> Guardar Cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
