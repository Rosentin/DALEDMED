export type Role = 'team' | 'admin' | 'pharma' | 'maipumed';

export interface User {
  id: string;
  role: Role;
  name: string;
  code: string;
  permissions?: string[];
}


export interface Patient {
  id: string;
  name: string;
  dni: string;
  phone: string;
  email?: string;
  obraSocial: string;
  numeroAfiliado: string;
  address: string;
  history: string[]; // Order IDs
  consentGiven: boolean;
}

export interface MedicationRequest {
  id: string;
  nombre: string;
  presentacion: string | null;
  dosis: string | null;
  cantidad: string | null;
  
  // Pharma filled
  validado?: boolean;
  laboratorio?: string;
  stock?: boolean;
  precioLista?: number;
  descuentoObraSocial?: number;
  descuentoAdicional?: number;
  costoFarmacia?: number;
  precioParticular?: number;
  descuento?: number;
  faltantes?: boolean;
  alternativas?: string;
  tiempoPreparacion?: string;
  notasFarmacia?: string;
  
  // DALEDMED filled
  margenAplicado?: number;
  precioFinal?: number;
}

export interface Order {
  id: string;
  fecha: string;
  pacienteId: string;
  pacienteNombre?: string;
  pacienteEmail?: string;
  dni?: string;
  numeroAfiliado?: string;
  medico: string | null;
  matriculaMedico?: string;
  consultorio?: string;
  obraSocial: string;
  
  token: string | null;
  recetaUrl?: string; // We'll mock the URL for the MVP
  diagnostico?: string;
  
  medicamentos: MedicationRequest[];
  productosAdicionales: any[];
  
  estado: OrderState;
  
  direccionEntrega: string;
  distanciaKm: number;
  costoLogistico: number;
  waypoints?: string[];
  destLat?: number;
  destLng?: number;
  driverLat?: number | null;
  driverLng?: number | null;
  driverLastUpdated?: string | null;
  linkPagoUrl?: string;
  qrString?: string;
  recetaLink?: string;
  detallesPago?: string;
  bankInfoUsada?: string;
  localidad?: string;
  
  metodoPago?: 'QR' | 'Transferencia' | 'Efectivo' | 'Credito' | 'Debito' | 'Link';
  estadoPago: 'Pendiente' | 'Pagado' | 'Rechazado' | 'Anulado' | 'Reintegrado';
  
  creadoPor: string;
  pharmaUser?: string;
  
  historialCambios: AuditLog[];
}

export type OrderState = 
  | 'Nuevo' 
  | 'Revisión Farmacéutica' 
  | 'Cotizado' 
  | 'Aceptado por paciente' 
  | 'Pago Pendiente' 
  | 'Pagado' 
  | 'En preparación' 
  | 'Listo para retirar' 
  | 'En camino' 
  | 'En reparto'
  | 'Entregado' 
  | 'Cancelado';

export interface AuditLog {
  timestamp: string;
  userId: string;
  action: string;
  details: string;
}
