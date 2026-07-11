import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { 
  Search, Clock, AlertCircle, Truck, DollarSign, TrendingUp, Package, 
  Activity, FileText, CheckCircle, ShieldAlert, CreditCard, ChevronRight, 
  Filter, Award, Clipboard, Wallet, BarChart3, PieChart, Map, Navigation, Compass, Info, X
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { OrderState, Order } from '../../types';

const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-api-script';

function loadGoogleMapsScript(apiKey: string, callback: () => void) {
  if ((window as any).google?.maps) {
    callback();
    return;
  }
  const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement;
  if (existingScript) {
    const srcUrl = existingScript.src || '';
    if (srcUrl.includes(`key=${apiKey}`)) {
      existingScript.addEventListener('load', callback);
      if (existingScript.dataset.loaded === 'true' || (window as any).google?.maps) {
        callback();
      }
      return;
    } else {
      existingScript.remove();
    }
  }
  const script = document.createElement('script');
  script.id = GOOGLE_MAPS_SCRIPT_ID;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es`;
  script.async = true;
  script.defer = true;
  script.addEventListener('load', () => {
    script.dataset.loaded = 'true';
    callback();
  });
  document.head.appendChild(script);
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getDeterministicMendozaCoords(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const baseLat = -32.8895;
  const baseLng = -68.8458;
  const latOffset = ((Math.abs(hash) % 100) / 4000) - 0.012;
  const lngOffset = (((Math.abs(hash) >> 8) % 100) / 4000) - 0.012;
  return { lat: baseLat + latOffset, lng: baseLng + lngOffset };
}

export default function DashboardView() {
  const allOrders = useAppStore(state => state.orders);
  const currentUser = useAppStore(state => state.currentUser);
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState('');
  const isMaipumedUser = currentUser?.role === 'maipumed' || currentUser?.name === 'maipumed';
  const [maipumedTab, setMaipumedTab] = useState<'overview' | 'revenue' | 'modules' | 'map'>(isMaipumedUser ? 'modules' : 'overview');
  const [adminTab, setAdminTab] = useState<'recipes' | 'overview' | 'revenue' | 'modules'>('recipes');
  const [revenueConceptFilter, setRevenueConceptFilter] = useState<string>('todos');
  const [transactionSearch, setTransactionSearch] = useState('');

  const googleMapsApiKey = useAppStore(state => state.googleMapsApiKey);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const activeMarkersRef = useRef<any[]>([]);
  const activePolylinesRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);

  useEffect(() => {
    if (maipumedTab !== 'map') return;
    
    const apiKeyToUse = googleMapsApiKey || (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!apiKeyToUse) return;
    
    loadGoogleMapsScript(apiKeyToUse, () => {
      setMapsLoaded(true);
    });
  }, [maipumedTab, googleMapsApiKey]);

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || maipumedTab !== 'map') return;
    
    const google = (window as any).google;
    const mendozaCenter = { lat: -32.8895, lng: -68.8458 };
    
    const map = new google.maps.Map(mapRef.current, {
      center: mendozaCenter,
      zoom: 12,
      styles: [
        {
          "featureType": "all",
          "elementType": "labels.text.fill",
          "stylers": [{"color": "#7c93a3"}]
        }
      ],
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
    
    mapInstanceRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
    
    return () => {
      mapInstanceRef.current = null;
      infoWindowRef.current = null;
    };
  }, [mapsLoaded, maipumedTab]);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || maipumedTab !== 'map') return;
    
    const google = (window as any).google;
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;
    
    activeMarkersRef.current.forEach(m => m.setMap(null));
    activeMarkersRef.current = [];
    
    activePolylinesRef.current.forEach(p => p.setMap(null));
    activePolylinesRef.current = [];
    
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    const pharmaCenter = { lat: -32.8895, lng: -68.8458 };
    const pharmacyMarker = new google.maps.Marker({
      position: pharmaCenter,
      map: map,
      title: 'Farmacia Central DáledMed',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      }
    });
    activeMarkersRef.current.push(pharmacyMarker);
    bounds.extend(pharmaCenter);
    hasPoints = true;

    pharmacyMarker.addListener('click', () => {
      infoWindow.setContent(`
        <div style="font-family: sans-serif; padding: 6px; color: #1e293b; max-width: 200px;">
          <span style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #3b82f6; letter-spacing: 0.05em;">Centro de Despacho</span>
          <h4 style="margin: 2px 0 4px 0; font-size: 13px; font-weight: 800; color: #0f172a;">Farmacia Central</h4>
          <p style="margin: 0; font-size: 11px; color: #64748b;">Origen de repartos DáledMed.</p>
        </div>
      `);
      infoWindow.open(map, pharmacyMarker);
    });

    const directionsService = new google.maps.DirectionsService();

    allOrders.forEach(order => {
      if (order.estado === 'Cancelado') return;
      if (!order.destLat || !order.destLng) return;

      const destPos = { lat: order.destLat, lng: order.destLng };
      const isDelivered = order.estado === 'Entregado';
      
      const marker = new google.maps.Marker({
        position: destPos,
        map: map,
        title: `${order.pacienteNombre} (${order.estado})`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: isDelivered ? '#10b981' : '#ef4444',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        }
      });
      
      activeMarkersRef.current.push(marker);
      bounds.extend(destPos);
      hasPoints = true;

      marker.addListener('click', () => {
        setSelectedOrder(order);
        const content = `
          <div style="font-family: sans-serif; padding: 6px; color: #1e293b; max-width: 220px;">
            <span style="font-size: 9px; font-weight: bold; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Paciente</span>
            <h4 style="margin: 2px 0 6px 0; font-size: 14px; font-weight: 800; color: #0f172a;">${order.pacienteNombre || 'Sin nombre'}</h4>
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #475569;">${order.direccionEntrega}</p>
            <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10px; font-weight: 700; color: ${isDelivered ? '#10b981' : '#ef4444'};">${order.estado.toUpperCase()}</span>
              <span style="font-size: 10px; font-weight: bold; color: #3b82f6; font-family: monospace;">#${order.id.slice(0, 5)}</span>
            </div>
          </div>
        `;
        infoWindow.setContent(content);
        infoWindow.open(map, marker);
      });

      if (order.driverLat && order.driverLng && order.estado === 'En reparto') {
        const driverPos = { lat: order.driverLat, lng: order.driverLng };
        
        const driverMarker = new google.maps.Marker({
          position: driverPos,
          map: map,
          title: `Repartidor: ${order.pacienteNombre}`,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 8,
            fillColor: '#3b82f6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: 0
          }
        });
        
        activeMarkersRef.current.push(driverMarker);
        bounds.extend(driverPos);

        driverMarker.addListener('click', () => {
          setSelectedOrder(order);
          infoWindow.setContent(`
            <div style="font-family: sans-serif; padding: 6px; color: #1e293b; max-width: 220px;">
              <span style="font-size: 9px; font-weight: bold; text-transform: uppercase; color: #3b82f6; letter-spacing: 0.05em;">Repartidor GPS</span>
              <h4 style="margin: 2px 0 4px 0; font-size: 13px; font-weight: 800; color: #0f172a;">Entregando a ${order.pacienteNombre}</h4>
              <p style="margin: 0; font-size: 11px; color: #64748b;">Transmitiendo ubicación satelital en vivo...</p>
            </div>
          `);
          infoWindow.open(map, driverMarker);
        });

        directionsService.route({
          origin: pharmaCenter,
          destination: destPos,
          waypoints: [{ location: driverPos, stopover: true }],
          travelMode: google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && result) {
            const poly = new google.maps.Polyline({
              path: result.routes[0].overview_path,
              geodesic: true,
              strokeColor: '#3b82f6',
              strokeOpacity: 0.85,
              strokeWeight: 4,
              map: map
            });
            activePolylinesRef.current.push(poly);
          } else {
            // Fallback straight lines
            const poly = new google.maps.Polyline({
              path: [pharmaCenter, driverPos, destPos],
              geodesic: true,
              strokeColor: '#3b82f6',
              strokeOpacity: 0.8,
              strokeWeight: 3.5,
              map: map
            });
            activePolylinesRef.current.push(poly);
          }
        });
      }
    });

    if (hasPoints) {
      map.fitBounds(bounds);
      const listener = google.maps.event.addListener(map, 'bounds_changed', () => {
        if (map.getZoom() > 14) map.setZoom(14);
        google.maps.event.removeListener(listener);
      });
    }
  }, [mapsLoaded, allOrders, maipumedTab]);

  const isMaipumed = currentUser?.role === 'maipumed' || currentUser?.name === 'maipumed';

  const getBadgeForState = (state: OrderState) => {
    switch (state) {
      case 'Nuevo':
        return { className: 'bg-sky-100 text-sky-800 border border-sky-200', label: 'Nuevo' };
      case 'Revisión Farmacéutica':
        return { className: 'bg-amber-100 text-amber-800 border border-amber-200', label: 'Por Validar' };
      case 'Cotizado':
        return { className: 'bg-purple-100 text-purple-800 border border-purple-200', label: 'Cotizado' };
      case 'Pago Pendiente':
        return { className: 'bg-yellow-100 text-yellow-800 border border-yellow-200', label: 'Esperando Pago' };
      case 'Pagado':
        return { className: 'bg-emerald-100 text-emerald-800 border border-emerald-200', label: 'Pagado' };
      case 'En preparación':
        return { className: 'bg-cyan-100 text-cyan-800 border border-cyan-200', label: 'En Preparación' };
      case 'En reparto':
        return { className: 'bg-indigo-600 text-white border border-indigo-700 animate-pulse font-extrabold', label: 'En Reparto' };
      case 'Entregado':
        return { className: 'bg-emerald-600 text-white border border-emerald-700 font-extrabold', label: 'Entregado' };
      case 'Cancelado':
        return { className: 'bg-rose-100 text-rose-800 border border-rose-200', label: 'Cancelado' };
      default:
        return { className: 'bg-slate-100 text-slate-800 border border-slate-200', label: state };
    }
  };

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

  const orders = allOrders
    .filter(o => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const badgeLabel = getBadgeForState(o.estado).label.toLowerCase();
      
      if (
        (o.pacienteNombre || o.pacienteId || '').toLowerCase().includes(term) ||
        o.id.toLowerCase().includes(term) ||
        badgeLabel.includes(term)
      ) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const priorityA = statePriority[a.estado] || 99;
      const priorityB = statePriority[b.estado] || 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
    });

  // Calculate operational stats
  const totalOrders = allOrders.length;
  const completedOrders = allOrders.filter(o => o.estado === 'Entregado').length;
  const deliveryRate = totalOrders ? ((completedOrders / totalOrders) * 100).toFixed(0) : 0;

  const validacionCount = allOrders.filter(o => o.estado === 'Revisión Farmacéutica' || o.estado === 'Nuevo').length;
  const pagoCount = allOrders.filter(o => o.estado === 'Cotizado' || o.estado === 'Pago Pendiente').length;
  const repartoCount = allOrders.filter(o => o.estado === 'En reparto').length;

  // Calculate financial stats for paid orders ('Pagado', 'En preparación', 'En reparto', 'Entregado')
  const paidOrders = allOrders.filter(o => ['Pagado', 'En preparación', 'En reparto', 'Entregado'].includes(o.estado));
  
  const totalFacturado = paidOrders.reduce((sum, o) => {
    const medsCost = o.medicamentos.reduce((acc, m) => acc + (m.precioFinal || 0), 0);
    return sum + medsCost + (o.costoLogistico || 0);
  }, 0);

  const totalMedicamentosFacturado = paidOrders.reduce((sum, o) => {
    return sum + o.medicamentos.reduce((acc, m) => acc + (m.precioFinal || 0), 0);
  }, 0);

  const totalLogisticaFacturado = paidOrders.reduce((sum, o) => sum + (o.costoLogistico || 0), 0);

  const totalGananciaMedicamentos = paidOrders.reduce((sum, o) => {
    return sum + o.medicamentos.reduce((acc, m) => acc + ((m.precioFinal || 0) - (m.costoFarmacia || 0)), 0);
  }, 0);

  const totalGanancia = totalGananciaMedicamentos;

  // --- Maipumed Audit & Classification Helpers ---
  const getMedicationCategory = (medName: string): 'Medicamentos' | 'Perfumeria' | 'Venta Libre' => {
    const name = medName.toLowerCase();
    if (
      name.includes('shampoo') || name.includes('crema') || name.includes('perfume') || 
      name.includes('colonia') || name.includes('desodorante') || name.includes('jabón') || 
      name.includes('jabon') || name.includes('protector') || name.includes('skincare') ||
      name.includes('pasta') || name.includes('dental')
    ) {
      return 'Perfumeria';
    }
    if (
      name.includes('paracetamol') || name.includes('ibuprofeno') || name.includes('aspirina') || 
      name.includes('gasa') || name.includes('termómetro') || name.includes('curita') || 
      name.includes('venta libre') || name.includes('venda') || name.includes('algodón') || 
      name.includes('algodon') || name.includes('parche')
    ) {
      return 'Venta Libre';
    }
    return 'Medicamentos';
  };

  // Classify all incoming revenues by concept
  let revenueMedicamentos = 0;
  let revenuePerfumeria = 0;
  let revenueVentaLibre = 0;
  let revenueLogistica = 0;

  paidOrders.forEach(o => {
    revenueLogistica += (o.costoLogistico || 0);
    o.medicamentos.forEach(med => {
      const val = med.precioFinal || 0;
      const cat = getMedicationCategory(med.nombre);
      if (cat === 'Perfumeria') {
        revenuePerfumeria += val;
      } else if (cat === 'Venta Libre') {
        revenueVentaLibre += val;
      } else {
        revenueMedicamentos += val;
      }
    });
  });

  const totalRevenueCalculated = revenueMedicamentos + revenuePerfumeria + revenueVentaLibre + revenueLogistica;

  // Create itemized transaction stream
  const itemizedTransactions = paidOrders.flatMap(o => {
    const txs = [];
    if (o.costoLogistico > 0) {
      txs.push({
        id: `${o.id}-LOG`,
        orderId: o.id,
        paciente: o.pacienteNombre || o.pacienteId || 'Sin Nombre',
        fecha: o.fecha,
        concepto: 'Logística' as const,
        detalle: 'Envío y Distribución DáledMed',
        monto: o.costoLogistico,
        metodoPago: o.metodoPago || 'Link',
        estado: o.estado
      });
    }
    o.medicamentos.forEach((med, idx) => {
      const cat = getMedicationCategory(med.nombre);
      txs.push({
        id: `${o.id}-M${idx}`,
        orderId: o.id,
        paciente: o.pacienteNombre || o.pacienteId || 'Sin Nombre',
        fecha: o.fecha,
        concepto: cat,
        detalle: `${med.nombre} ${med.presentacion ? `(${med.presentacion})` : ''} x${med.cantidad || 1}`,
        monto: med.precioFinal || 0,
        metodoPago: o.metodoPago || 'Link',
        estado: o.estado
      });
    });
    return txs;
  });

  const filteredTransactions = itemizedTransactions.filter(tx => {
    const matchesConcept = revenueConceptFilter === 'todos' || tx.concepto.toLowerCase() === revenueConceptFilter.toLowerCase();
    const term = transactionSearch.toLowerCase();
    const matchesSearch = !term || 
      tx.orderId.toLowerCase().includes(term) ||
      tx.paciente.toLowerCase().includes(term) ||
      tx.detalle.toLowerCase().includes(term);
    return matchesConcept && matchesSearch;
  });

  // Calculate percentages
  const pctMedicamentos = totalRevenueCalculated ? ((revenueMedicamentos / totalRevenueCalculated) * 100).toFixed(1) : '0';
  const pctPerfumeria = totalRevenueCalculated ? ((revenuePerfumeria / totalRevenueCalculated) * 100).toFixed(1) : '0';
  const pctVentaLibre = totalRevenueCalculated ? ((revenueVentaLibre / totalRevenueCalculated) * 100).toFixed(1) : '0';
  const pctLogistica = totalRevenueCalculated ? ((revenueLogistica / totalRevenueCalculated) * 100).toFixed(1) : '0';

  if (isMaipumed) {
    return (
      <div className="space-y-8 pb-12">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-blue-500/30">
              <Activity size={14} className="animate-pulse" /> Monitoreo Operativo Central
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">
              Control Panel <span className="text-blue-400">Maipumed</span>
            </h1>
            <p className="text-slate-400 text-sm max-w-xl">
              Consola de monitoreo unificado de módulos DáledMed en tiempo real.
            </p>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        </div>

        {/* Console Navigation Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            className="px-6 py-3 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 border-blue-600 text-blue-600"
          >
            <Clipboard size={16} /> Módulos DáledMed
          </button>
          <button
            onClick={() => navigate('/monitoring')}
            className="px-6 py-3 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 border-transparent text-slate-500 hover:text-slate-900"
          >
            <Map size={16} /> Monitoreo GPS y Entregas
          </button>
        </div>

        {/* Tab content: Módulos DáledMed (Summary of active operations - Purely Operational, NO dollars/ledger) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Module 1 & 2 */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center">1</span>
                  Módulo de Recepción (Carga de Recetas)
                </h3>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded text-slate-500 font-bold">Activo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{validacionCount}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Esperando Validación</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    {allOrders.filter(o => o.estado === 'Nuevo').length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Recetas Nuevas</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Últimas Recetas Ingresadas</p>
                <div className="divide-y divide-slate-100">
                  {allOrders.slice(0, 3).map(o => (
                    <div key={o.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{o.pacienteNombre || o.pacienteId}</p>
                        <p className="text-slate-400">ID #{o.id} • {o.obraSocial}</p>
                      </div>
                      <Badge variant="info">{o.estado}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-teal-50 text-teal-600 text-xs font-bold flex items-center justify-center">2</span>
                  Módulo de Farmacia (Validación & Cotización)
                </h3>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded text-slate-500 font-bold">Activo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    {allOrders.filter(o => o.estado === 'Cotizado').length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Medicamentos Cotizados</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    {allOrders.filter(o => o.estado === 'Aceptado por paciente').length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Aceptados por Paciente</p>
                </div>
              </div>
              <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0 animate-pulse"></div>
                <p className="text-[11px] font-semibold text-teal-800 leading-relaxed">
                  Sincronización directa de vademécum médico con coberturas de obra social y auditorías farmacéuticas automáticas de receta.
                </p>
              </div>
            </div>
          </div>

          {/* Module 3 & 4 */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-amber-50 text-amber-600 text-xs font-bold flex items-center justify-center">3</span>
                  Módulo de Cobranzas y Transacciones
                </h3>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded text-slate-500 font-bold">Activo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{paidOrders.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Órdenes Pagadas</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    {allOrders.filter(o => o.estado === 'Pago Pendiente').length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Pendientes de Pago</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Distribución de Métodos de Pago (Unidades)</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <p className="font-bold text-slate-900">{paidOrders.filter(o => o.metodoPago === 'QR').length}</p>
                    <p className="text-[9px] text-slate-400">QR / Transfer</p>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <p className="font-bold text-slate-900">{paidOrders.filter(o => o.metodoPago === 'Link' || !o.metodoPago).length}</p>
                    <p className="text-[9px] text-slate-400">Pago Link</p>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <p className="font-bold text-slate-900">{paidOrders.filter(o => o.metodoPago === 'Efectivo').length}</p>
                    <p className="text-[9px] text-slate-400">Efectivo</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center">4</span>
                  Módulo de Logística & Envío Satelital
                </h3>
                <span className="text-xs bg-emerald-100 px-2.5 py-1 rounded text-emerald-700 font-bold">Satelital On</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{repartoCount}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">En Reparto Activo</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{completedOrders}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Entregados</p>
                </div>
              </div>
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <p className="text-[11px] font-semibold text-indigo-800 text-center">
                  Optimización automática de ruteo con mapas interactivos y monitoreo GPS satelital en tiempo real para repartidores.
                </p>
              </div>
              <Button
                onClick={() => navigate('/monitoring')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase tracking-wider py-3 flex items-center justify-center gap-2 border-none"
              >
                <Map size={14} /> Abrir Mapa de Monitoreo GPS
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 rounded-2xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-blue-500/30">
            <ShieldAlert size={14} className="animate-pulse" /> Consola de Monitoreo Central
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Team <span className="text-blue-400">Admin</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xl">
            Gestión de recetas, ruteo satelital de pedidos, auditorías de ingresos y libro diario en tiempo real.
          </p>
        </div>
        <div className="relative z-10 flex flex-col items-end text-right md:bg-white/5 md:p-4 rounded-xl border border-white/5">
          <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total Recaudado</span>
          <span className="text-3xl md:text-4xl font-black text-emerald-400">${totalRevenueCalculated.toLocaleString()}</span>
          <span className="text-[10px] text-slate-500 mt-1">Sincronizado con Firebase</span>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Tabs navigation for Team Admin */}
      <div className="flex border-b border-slate-200 overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => setAdminTab('recipes')}
          className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
            adminTab === 'recipes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText size={16} /> Gestión de Recetas
        </button>
        <button
          onClick={() => setAdminTab('overview')}
          className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
            adminTab === 'overview'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart3 size={16} /> Resumen de Auditoría
        </button>
        <button
          onClick={() => setAdminTab('revenue')}
          className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
            adminTab === 'revenue'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Wallet size={16} /> Libro Diario
        </button>
        <button
          onClick={() => setAdminTab('modules')}
          className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 flex items-center gap-2 ${
            adminTab === 'modules'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Clipboard size={16} /> Módulos DáledMed
        </button>
      </div>

      {/* Tab Contents */}
      {adminTab === 'recipes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Listado de Recetas (Left Panel) */}
          <div className="lg:col-span-5 h-[calc(100vh-8rem)]">
            <Card className="h-full flex flex-col shadow-sm border-slate-200">
              <div className="p-6 border-b border-slate-100 flex-shrink-0">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold text-slate-900 text-lg">Listado de Recetas</h2>
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{orders.length} Activas</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Buscar paciente o ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <select 
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 text-sm focus:outline-none focus:border-blue-500 text-slate-600"
                    onChange={(e) => setSearchTerm(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="Validar">Validar</option>
                    <option value="Pago">Esperando Pago</option>
                    <option value="Reparto">En Reparto</option>
                  </select>
                </div>
              </div>
              
              <div className="overflow-y-auto p-6 space-y-4 flex-1 bg-slate-50">
                {orders.length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-8">
                    No hay recetas que coincidan con la búsqueda.
                  </div>
                )}
                {orders.map(order => {
                  const badge = getBadgeForState(order.estado);
                  const isEnReparto = order.estado === 'En reparto';
                  
                  let deliveryMetrics = null;
                  if (isEnReparto) {
                    const dLat = order.destLat || getDeterministicMendozaCoords(order.id).lat;
                    const dLng = order.destLng || getDeterministicMendozaCoords(order.id).lng;
                    let remDist = order.distanciaKm;
                    if (order.driverLat && order.driverLng) {
                      remDist = Math.min(order.distanciaKm, Math.round(haversineDistance(order.driverLat, order.driverLng, dLat, dLng) * 10) / 10);
                    }
                    const remMin = remDist <= 0.05 ? 0 : Math.ceil(remDist * 1.3 + 3);
                    let etaStr = '--:-- hs';
                    if (remMin > 0) {
                      const d = new Date();
                      d.setMinutes(d.getMinutes() + remMin);
                      etaStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' hs';
                    }
                    
                    deliveryMetrics = { remDist, remMin, etaStr };
                  }

                  return (
                    <Link key={order.id} to={`/orders/${order.id}`}>
                      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            TKN {order.token || 'N/A'} • {order.obraSocial}
                          </p>
                          <Badge className={badge.className}>{badge.label}</Badge>
                        </div>
                        <p className="font-bold text-slate-900 text-lg tracking-tight mb-1">{order.pacienteNombre || order.pacienteId}</p>
                        <p className="text-xs text-slate-500">
                          ID {order.id} • {order.medicamentos.length} med(s)
                        </p>
                        {deliveryMetrics && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-600 bg-blue-50/40 -mx-4 -mb-4 p-2.5 rounded-b-xl">
                            <span className="flex items-center gap-1 text-slate-500"><Truck size={12} className="text-blue-500 shrink-0" /> {deliveryMetrics.remDist} km rest.</span>
                            <span className="text-emerald-600">{deliveryMetrics.remMin} min</span>
                            <span className="text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-[9px]">{deliveryMetrics.etaStr}</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Right Panel */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Header Stats */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-bold flex items-center gap-2 mb-1">
                  <span className="text-blue-400">👤</span> Panel de Control General
                </h2>
                <p className="text-slate-400 text-sm font-medium mb-8">Resumen operativo de Clínica y Farmacia (Mendoza)</p>
                
                <div className="flex gap-4">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 px-6 border border-white/10">
                    <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest mb-1">Total Procesadas</p>
                    <p className="text-3xl font-bold tracking-tight">{totalOrders}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 px-6 border border-white/10">
                    <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest mb-1">Tasa de Entrega</p>
                    <p className="text-3xl font-bold tracking-tight text-blue-400">{deliveryRate}%</p>
                  </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="absolute bottom-0 right-32 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl translate-y-1/2"></div>
            </div>

            {/* Action Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6 h-full flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="font-bold text-slate-900 text-lg">Validación</h3>
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
                      <Clock size={16} />
                    </div>
                  </div>
                  <div>
                    <p className="text-4xl font-black text-slate-900 tracking-tighter mb-1">{validacionCount}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Pendientes</p>
                    <p className="text-sm text-slate-500">Recetas nuevas esperando revisión.</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6 h-full flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="font-bold text-slate-900 text-lg">Cobranza</h3>
                    <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
                      <AlertCircle size={16} />
                    </div>
                  </div>
                  <div>
                    <p className="text-4xl font-black text-slate-900 tracking-tighter mb-1">{pagoCount}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Aguardando Pago</p>
                    <p className="text-sm text-slate-500">Links de pago enviados a pacientes.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Financial Panel */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-emerald-700 mb-2">
                    <DollarSign size={16} />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest">Facturado</h3>
                  </div>
                  <p className="text-xl font-black text-slate-900">${totalFacturado.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Package size={16} />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest">Medicamentos</h3>
                  </div>
                  <p className="text-xl font-bold text-slate-700">${totalMedicamentosFacturado.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Truck size={16} />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest">Logística</h3>
                  </div>
                  <p className="text-xl font-bold text-slate-700">${totalLogisticaFacturado.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-indigo-200 bg-indigo-50/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-indigo-700 mb-2">
                    <TrendingUp size={16} />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest">Ganancia</h3>
                  </div>
                  <p className="text-xl font-black text-indigo-900">${totalGanancia.toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            {/* Logistics Panel */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-r from-blue-50/50 to-white">
              <CardContent className="p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex gap-6 items-center">
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Truck size={28} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-1">Logística en Reparto</h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900 tracking-tighter">{repartoCount}</span>
                      <span className="text-sm font-medium text-slate-600">paquetes en tránsito</span>
                    </div>
                  </div>
                </div>
                <Button 
                  variant="primary" 
                  className="shadow-lg shadow-blue-500/30 px-8 whitespace-nowrap"
                  onClick={() => navigate('/orders')}
                >
                  Ver Entregas
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {adminTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* Core KPI Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <Badge variant="info">Módulo 1</Badge>
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900">{totalOrders}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Recetas Cargadas</p>
                <p className="text-xs text-slate-500 mt-2">Nuevas por validar: <span className="font-bold text-slate-900">{validacionCount}</span></p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <Activity size={20} />
                </div>
                <Badge variant="success">Módulo 2</Badge>
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900">
                  {allOrders.filter(o => o.estado !== 'Nuevo' && o.estado !== 'Revisión Farmacéutica').length}
                </p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Recetas Cotizadas</p>
                <p className="text-xs text-slate-500 mt-2">Tasa de aceptación óptima</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <Badge variant="warning">Módulo 3</Badge>
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900">{pagoCount}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Links en Cobro</p>
                <p className="text-xs text-slate-500 mt-2">Transacciones pagadas: <span className="font-bold text-slate-900">{paidOrders.length}</span></p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <Badge variant="info">Módulo 4</Badge>
              </div>
              <div>
                <p className="text-3xl font-black text-slate-900">{deliveryRate}%</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Efectividad Reparto</p>
                <p className="text-xs text-slate-500 mt-2">En tránsito: <span className="font-bold text-slate-900">{repartoCount}</span></p>
              </div>
            </div>
          </div>

          {/* Income Concept Quickview & Visual Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Concept breakdown cards */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="font-bold text-slate-900 text-lg uppercase tracking-tight flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Distribución de Ingresos
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Medicamentos</span>
                    <span className="text-xs font-bold text-slate-400">{pctMedicamentos}%</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900">${revenueMedicamentos.toLocaleString()}</p>
                  <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${pctMedicamentos}%` }}></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Perfumería</span>
                    <span className="text-xs font-bold text-slate-400">{pctPerfumeria}%</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900">${revenuePerfumeria.toLocaleString()}</p>
                  <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                    <div className="bg-purple-600 h-full rounded-full" style={{ width: `${pctPerfumeria}%` }}></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Venta Libre</span>
                    <span className="text-xs font-bold text-slate-400">{pctVentaLibre}%</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900">${revenueVentaLibre.toLocaleString()}</p>
                  <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pctVentaLibre}%` }}></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Logística / Envío</span>
                    <span className="text-xs font-bold text-slate-400">{pctLogistica}%</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900">${revenueLogistica.toLocaleString()}</p>
                  <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pctLogistica}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Graphical distribution donut chart (pure CSS SVG representation) */}
            <div className="lg:col-span-5">
              <Card className="h-full border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="p-6 pb-2">
                  <h3 className="font-bold text-slate-950 text-base flex items-center gap-2">
                    <PieChart size={18} className="text-blue-600" /> Relación de Ingresos
                  </h3>
                  <p className="text-slate-400 text-xs">Porcentaje relativo de cada concepto facturado.</p>
                </div>
                <div className="p-6 flex flex-col items-center justify-center flex-1">
                  <div className="relative w-44 h-44 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      {/* Background ring */}
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3.2" />
                      
                      {/* Medicamentos: Blue */}
                      <circle 
                        cx="18" cy="18" r="15.915" fill="none" stroke="#2563eb" strokeWidth="3.2" 
                        strokeDasharray={`${pctMedicamentos} ${100 - parseFloat(pctMedicamentos)}`}
                        strokeDashoffset="0"
                      />
                      {/* Perfumeria: Purple */}
                      <circle 
                        cx="18" cy="18" r="15.915" fill="none" stroke="#9333ea" strokeWidth="3.2" 
                        strokeDasharray={`${pctPerfumeria} ${100 - parseFloat(pctPerfumeria)}`}
                        strokeDashoffset={`-${pctMedicamentos}`}
                      />
                      {/* Venta Libre: Amber */}
                      <circle 
                        cx="18" cy="18" r="15.915" fill="none" stroke="#f59e0b" strokeWidth="3.2" 
                        strokeDasharray={`${pctVentaLibre} ${100 - parseFloat(pctVentaLibre)}`}
                        strokeDashoffset={`-${parseFloat(pctMedicamentos) + parseFloat(pctPerfumeria)}`}
                      />
                      {/* Logistica: Emerald */}
                      <circle 
                        cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3.2" 
                        strokeDasharray={`${pctLogistica} ${100 - parseFloat(pctLogistica)}`}
                        strokeDashoffset={`-${100 - parseFloat(pctLogistica)}`}
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Facturación</span>
                      <span className="text-lg font-black text-slate-900">${totalRevenueCalculated.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-6 w-full text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 block shrink-0"></span>
                      <span className="text-slate-600 truncate">Meds ({pctMedicamentos}%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-600 block shrink-0"></span>
                      <span className="text-slate-600 truncate">Perf ({pctPerfumeria}%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block shrink-0"></span>
                      <span className="text-slate-600 truncate">Libre ({pctVentaLibre}%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block shrink-0"></span>
                      <span className="text-slate-600 truncate">Envíos ({pctLogistica}%)</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Audit Log Tracker / Transparency Feed (Moved permanently to Team Admin only!) */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-950 text-base">Registro de Auditoría Operacional (Libro de Audiometría)</h3>
                <p className="text-slate-400 text-xs">Monitoreo transparente de todas las acciones del sistema. Exclusivo para Team Admin.</p>
              </div>
              <Badge variant="info" className="px-3 font-mono">DáledMed Ledger</Badge>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {allOrders.length === 0 ? (
                <p className="text-sm text-slate-500 p-6 text-center italic">No hay historial disponible.</p>
              ) : (
                allOrders.flatMap(o => o.historialCambios.map(log => ({ ...log, orderId: o.id, paciente: o.pacienteNombre || o.pacienteId }))).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15).map((log, index) => (
                  <div key={index} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between text-sm">
                    <div className="flex gap-4 items-center">
                      <span className="font-mono text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded">
                        Pedido #{log.orderId}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">{log.action === 'Created' ? '📝 Pedido Creado' : `⚡ Modificación: ${log.details}`}</p>
                        <p className="text-xs text-slate-400">Paciente: <span className="font-bold">{log.paciente}</span> • Operador ID: {log.userId}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-mono shrink-0 ml-4">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {adminTab === 'revenue' && (
        <Card className="border-slate-200 shadow-sm overflow-hidden animate-fade-in">
          <div className="p-6 border-b border-slate-200 bg-slate-50 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-950 text-lg">Libro Diario de Ingresos</h3>
                <p className="text-xs text-slate-400">Detalle granular e individualizado de ingresos segmentados por concepto.</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                <span className="bg-emerald-100 text-emerald-800 font-mono font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                  <CheckCircle size={14} /> Total Auditoría: ${totalRevenueCalculated.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Filtering Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Buscar por ID, Paciente o Detalle..."
                  value={transactionSearch}
                  onChange={(e) => setTransactionSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Filter className="text-slate-400" size={16} />
                <select
                  value={revenueConceptFilter}
                  onChange={(e) => setRevenueConceptFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 text-slate-600 font-bold"
                >
                  <option value="todos">Todos los Conceptos</option>
                  <option value="medicamentos">Concepto: Medicamentos</option>
                  <option value="perfumeria">Concepto: Perfumería</option>
                  <option value="venta libre">Concepto: Venta Libre</option>
                  <option value="logística">Concepto: Logística</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs tracking-wider uppercase">
                <tr>
                  <th className="px-6 py-4">ID Transacción</th>
                  <th className="px-6 py-4">ID Pedido</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Paciente</th>
                  <th className="px-6 py-4">Concepto</th>
                  <th className="px-6 py-4">Detalle / Ítem</th>
                  <th className="px-6 py-4">Metodo Pago</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                      No se encontraron registros financieros que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{tx.id}</td>
                      <td className="px-6 py-4 font-mono text-xs font-bold text-blue-600">
                        <Link to={`/orders/${tx.orderId}`} className="hover:underline">
                          #{tx.orderId}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{new Date(tx.fecha).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{tx.paciente}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          tx.concepto === 'Medicamentos' ? 'bg-blue-100 text-blue-800' :
                          tx.concepto === 'Perfumeria' ? 'bg-purple-100 text-purple-800' :
                          tx.concepto === 'Venta Libre' ? 'bg-amber-100 text-amber-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {tx.concepto}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={tx.detalle}>{tx.detalle}</td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-mono">
                          {tx.metodoPago}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-950 font-mono">${tx.monto.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {adminTab === 'modules' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
          {/* Module 1 & 2 */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center">1</span>
                  Módulo de Recepción (Carga de Recetas)
                </h3>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded text-slate-500 font-bold">Activo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{validacionCount}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Esperando Validación</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    {allOrders.filter(o => o.estado === 'Nuevo').length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Recetas Nuevas</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Últimas Recetas Ingresadas</p>
                <div className="divide-y divide-slate-100">
                  {allOrders.slice(0, 3).map(o => (
                    <div key={o.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{o.pacienteNombre || o.pacienteId}</p>
                        <p className="text-slate-400">ID #{o.id} • {o.obraSocial}</p>
                      </div>
                      <Badge variant="info">{o.estado}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-teal-50 text-teal-600 text-xs font-bold flex items-center justify-center">2</span>
                  Módulo de Farmacia (Validación & Cotización)
                </h3>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded text-slate-500 font-bold">Activo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    {allOrders.filter(o => o.estado === 'Cotizado').length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Medicamentos Cotizados</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    {allOrders.filter(o => o.estado === 'Aceptado por paciente').length}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Aceptados por Paciente</p>
                </div>
              </div>
              <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0"></div>
                <p className="text-[11px] font-semibold text-teal-800">
                  Sincronización directa de vademécum con márgenes de medicamentos del 20%, perfumería del 35% y venta libre del 25%.
                </p>
              </div>
            </div>
          </div>

          {/* Module 3 & 4 */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-amber-50 text-amber-600 text-xs font-bold flex items-center justify-center">3</span>
                  Módulo de Cobranzas y Transacciones
                </h3>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded text-slate-500 font-bold">Activo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{paidOrders.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Órdenes Pagadas</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">
                    ${(totalRevenueCalculated ? totalRevenueCalculated / (paidOrders.length || 1) : 0).toFixed(0)}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Ticket Promedio</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Distribución de Métodos de Pago</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <p className="font-bold text-slate-900">{paidOrders.filter(o => o.metodoPago === 'QR').length}</p>
                    <p className="text-[9px] text-slate-400">QR / Transfer</p>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <p className="font-bold text-slate-900">{paidOrders.filter(o => o.metodoPago === 'Link' || !o.metodoPago).length}</p>
                    <p className="text-[9px] text-slate-400">Pago Link</p>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <p className="font-bold text-slate-900">{paidOrders.filter(o => o.metodoPago === 'Efectivo').length}</p>
                    <p className="text-[9px] text-slate-400">Efectivo</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center">4</span>
                  Módulo de Logística (Envío)
                </h3>
                <span className="text-xs bg-slate-100 px-2.5 py-1 rounded text-slate-500 font-bold">Activo</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{repartoCount}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">En Reparto Activo</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <p className="text-2xl font-black text-slate-900">{completedOrders}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Entregados</p>
                </div>
              </div>
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900 uppercase">Costo Logístico Promedio:</span>
                <span className="font-mono text-xs font-bold text-indigo-900">${(totalLogisticaFacturado / (paidOrders.length || 1)).toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
