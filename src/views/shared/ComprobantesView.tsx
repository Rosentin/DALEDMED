import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { 
  FileText, 
  Download, 
  Mail, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Send,
  Loader2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ComprobantesView() {
  const { orders, patients } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<Record<string, { success: boolean; message: string }>>({});
  const [emailModalId, setEmailModalId] = useState<string | null>(null);
  const [customEmail, setCustomEmail] = useState('');

  // Get only orders that have been paid or are further in the process
  const paidOrders = orders.filter(o => 
    o.estadoPago === 'Pagado' || 
    ['Pagado', 'En preparación', 'En reparto', 'Entregado'].includes(o.estado)
  ).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const getPatientName = (pacienteId: string) => {
    const p = patients.find(pat => pat.id === pacienteId);
    return p ? p.name : 'Paciente Desconocido';
  };

  const getPatientDni = (pacienteId: string) => {
    const p = patients.find(pat => pat.id === pacienteId);
    return p ? p.dni : '';
  };

  const getPatientEmail = (pacienteId: string) => {
    const p = patients.find(pat => pat.id === pacienteId);
    return p ? p.email || '' : '';
  };

  const calculateOrderTotal = (order: any) => {
    const medsCost = (order.medicamentos || []).reduce((acc: number, m: any) => acc + (m.precioFinal || m.precioParticular || 0), 0);
    const prodCost = (order.productosAdicionales || []).reduce((acc: number, p: any) => acc + (p.precioFinal || p.precioParticular || 0), 0);
    return medsCost + prodCost + (order.costoLogistico || 0);
  };

  const handleDownloadPdf = (orderId: string) => {
    window.open(`/api/receipt/pdf/${orderId}`, '_blank');
  };

  const handleSendEmail = async (orderId: string, recipientEmail?: string) => {
    setSendingEmailId(orderId);
    try {
      const response = await fetch(`/api/receipt/send-email/${orderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: recipientEmail || undefined
        })
      });

      const result = await response.json();
      if (response.ok) {
        setEmailStatus(prev => ({
          ...prev,
          [orderId]: { success: true, message: 'Enviado con éxito.' }
        }));
        // Auto clear after 4 seconds
        setTimeout(() => {
          setEmailStatus(prev => {
            const copy = { ...prev };
            delete copy[orderId];
            return copy;
          });
        }, 4000);
      } else {
        setEmailStatus(prev => ({
          ...prev,
          [orderId]: { success: false, message: result.error || 'Fallo de SMTP.' }
        }));
      }
    } catch (err: any) {
      setEmailStatus(prev => ({
        ...prev,
        [orderId]: { success: false, message: 'Error de red.' }
      }));
    } finally {
      setSendingEmailId(null);
      setEmailModalId(null);
      setCustomEmail('');
    }
  };

  const openEmailModal = (order: any) => {
    const patientEmail = getPatientEmail(order.pacienteId);
    setCustomEmail(patientEmail);
    setEmailModalId(order.id);
  };

  const filteredOrders = paidOrders.filter(o => {
    const pName = getPatientName(o.pacienteId).toLowerCase();
    const pDni = getPatientDni(o.pacienteId);
    const orderIdLower = o.id.toLowerCase();
    const term = searchTerm.toLowerCase();

    return pName.includes(term) || pDni.includes(term) || orderIdLower.includes(term);
  });

  const totalCollected = paidOrders.reduce((acc, o) => acc + calculateOrderTotal(o), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Módulo de Comprobantes</h2>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">
            Resúmenes de operación y envío automático de comprobantes de pago
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
          <DollarSign className="text-emerald-600" size={20} />
          <div>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Total Cobrado (Resúmenes)</p>
            <p className="text-lg font-bold text-slate-900">${totalCollected.toLocaleString('es-AR')}</p>
          </div>
        </div>
      </div>

      {/* Grid search and total count */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <Search className="text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Buscar por ID de Pedido, Nombre del Paciente o DNI..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 text-sm bg-transparent border-none outline-none text-slate-800 placeholder-slate-400"
        />
        <div className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
          {filteredOrders.length} comprobantes
        </div>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <FileText size={40} className="mx-auto text-slate-300" />
              <p className="font-medium text-slate-500">No se encontraron comprobantes de pago</p>
              <p className="text-xs">Asegúrate de registrar cobros en la Gestión de Pedidos</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">ID Pedido</th>
                  <th className="py-4 px-4">Fecha</th>
                  <th className="py-4 px-4">Paciente</th>
                  <th className="py-4 px-4 text-right">Total Abonado</th>
                  <th className="py-4 px-4 text-center">Método</th>
                  <th className="py-4 px-4 text-center">Estado de Email</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700 font-medium">
                {filteredOrders.map(order => {
                  const total = calculateOrderTotal(order);
                  const pName = getPatientName(order.pacienteId);
                  const pDni = getPatientDni(order.pacienteId);
                  const status = emailStatus[order.id];

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900">
                        <Link to={`/orders/${order.id}`} className="text-blue-600 hover:underline">
                          #{order.id}
                        </Link>
                      </td>
                      <td className="py-4 px-4 text-slate-500 text-xs font-mono">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400" />
                          {order.fecha ? new Date(order.fecha).toLocaleDateString('es-AR') : '-'}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div>{pName}</div>
                        {pDni && <div className="text-[11px] font-mono text-slate-400 mt-0.5">DNI {pDni}</div>}
                      </td>
                      <td className="py-4 px-4 text-right font-black text-slate-900">
                        ${total.toLocaleString('es-AR')}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          {order.metodoPago || 'Link'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {status ? (
                          status.success ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-emerald-50 text-emerald-700">
                              <CheckCircle2 size={12} /> {status.message}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-rose-50 text-rose-700">
                              <AlertCircle size={12} /> Error
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-500 bg-slate-100">
                            <Clock size={12} className="text-slate-400" /> Listo para enviar
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => handleDownloadPdf(order.id)}
                          title="Descargar Comprobante PDF"
                        >
                          <Download size={14} className="mr-1" />
                          PDF
                        </Button>
                        <Button 
                          variant="primary" 
                          size="sm" 
                          onClick={() => openEmailModal(order)}
                          disabled={sendingEmailId === order.id}
                          title="Enviar por Correo SMTP"
                        >
                          {sendingEmailId === order.id ? (
                            <Loader2 size={14} className="animate-spin mr-1" />
                          ) : (
                            <Mail size={14} className="mr-1" />
                          )}
                          Enviar Mail
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Mini email input modal */}
      {emailModalId && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Enviar Comprobante por Email</h3>
              <p className="text-xs text-slate-500 leading-normal">
                Ingrese la dirección de correo electrónico del paciente o destinatario para remitir el comprobante PDF oficial de forma automatizada por SMTP Gmail.
              </p>
              
              <Input 
                label="Email del destinatario" 
                type="email"
                placeholder="ejemplo@correo.com"
                value={customEmail}
                onChange={e => setCustomEmail(e.target.value)}
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setEmailModalId(null)}>
                  Cancelar
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => handleSendEmail(emailModalId, customEmail)}
                  disabled={!customEmail.trim()}
                >
                  <Send size={14} className="mr-1.5" />
                  Enviar Ahora
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
