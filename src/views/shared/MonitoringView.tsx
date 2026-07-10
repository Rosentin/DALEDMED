import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { 
  Truck, Map, Navigation, Compass, Info, X, ChevronRight, Search, 
  Activity, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OrderState, Order } from '../../types';

const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-api-script';

function loadGoogleMapsScript(apiKey: string, callback: () => void) {
  if ((window as any).google?.maps) {
    callback();
    return;
  }
  const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
  if (existingScript) {
    existingScript.addEventListener('load', callback);
    return;
  }
  const script = document.createElement('script');
  script.id = GOOGLE_MAPS_SCRIPT_ID;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es`;
  script.async = true;
  script.defer = true;
  script.addEventListener('load', callback);
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

export default function MonitoringView() {
  const allOrders = useAppStore(state => state.orders);
  const currentUser = useAppStore(state => state.currentUser);
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState('');
  const googleMapsApiKey = useAppStore(state => state.googleMapsApiKey);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [realRouteData, setRealRouteData] = useState<Record<string, { distanceKm: number, durationMin: number, path: any[] }>>({});
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const activeMarkersRef = useRef<any[]>([]);
  const activePolylinesRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);

  useEffect(() => {
    const apiKeyToUse = googleMapsApiKey || (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!apiKeyToUse) return;
    
    loadGoogleMapsScript(apiKeyToUse, () => {
      setMapsLoaded(true);
    });
  }, [googleMapsApiKey]);

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return;
    
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
  }, [mapsLoaded]);

  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current) return;
    
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

    const activeLogisticsStates = ['En preparación', 'En reparto', 'Entregado'];
    const directionsService = new google.maps.DirectionsService();

    allOrders.forEach(order => {
      if (!activeLogisticsStates.includes(order.estado)) return;

      // DO NOT invent points! Only use coordinates if they are actual loaded coordinates in database.
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

        // Compute street-by-street directions from origin (pharmaCenter) to driver position to destination
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

            // Compute exact street distance/duration remaining (from driverPos to destination, which is leg 1)
            const legs = result.routes[0].legs;
            let remDistMeters = 0;
            let remDurationSecs = 0;
            if (legs && legs.length > 0) {
              if (legs.length === 2) {
                remDistMeters = legs[1].distance.value;
                remDurationSecs = legs[1].duration.value;
              } else {
                remDistMeters = legs[0].distance.value;
                remDurationSecs = legs[0].duration.value;
              }
            }
            const remDistKm = Math.round((remDistMeters / 1000) * 10) / 10;
            const remMin = Math.ceil(remDurationSecs / 60);

            setRealRouteData(prev => ({
              ...prev,
              [order.id]: {
                distanceKm: remDistKm,
                durationMin: remMin,
                path: result.routes[0].overview_path
              }
            }));
          } else {
            console.warn('Google Maps Directions failed, drawing fallback lines:', status);
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
  }, [mapsLoaded, allOrders]);

  // Basic stats
  const totalOrders = allOrders.length;
  const completedOrders = allOrders.filter(o => o.estado === 'Entregado').length;
  const deliveryRate = totalOrders ? Math.round((completedOrders / totalOrders) * 100) : 0;
  const repartoCount = allOrders.filter(o => o.estado === 'En reparto').length;
  const pendienteCount = allOrders.filter(o => o.estado !== 'Entregado' && o.estado !== 'Cancelado').length;

  const filteredRepartos = allOrders.filter(o => {
    if (o.estado !== 'En reparto') return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (o.pacienteNombre || '').toLowerCase().includes(term) ||
      o.id.toLowerCase().includes(term) ||
      (o.direccionEntrega || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-1.5">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-blue-500/30">
            <Activity size={14} className="animate-pulse text-blue-400" /> Monitoreo GPS Satelital
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            Módulo de Entregas <span className="text-blue-400">DáledMed</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xl">
            Centro de monitoreo unificado y georreferenciado de repartos activos, distancias restantes y tiempos de arribo estimados (ETA).
          </p>
        </div>
        <div className="relative z-10 flex gap-3 text-right">
          <div className="bg-white/5 p-3 px-4 rounded-xl border border-white/10">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-0.5">En Tránsito</span>
            <span className="text-2xl font-black text-blue-400">{repartoCount}</span>
          </div>
          <div className="bg-white/5 p-3 px-4 rounded-xl border border-white/10">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-0.5">Entregados</span>
            <span className="text-2xl font-black text-emerald-400">{completedOrders}</span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Main Grid */}
      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6 h-auto lg:h-[calc(100vh-14rem)] lg:min-h-[550px]">
        {/* Map pane (3/4 width) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative flex flex-col h-[450px] lg:h-full">
          {/* Map Header with live statistics */}
          <div className="bg-slate-900 px-6 py-4 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="font-bold text-sm uppercase tracking-wider">Consola de Control de Flota</h3>
            </div>
            <div className="flex gap-4 text-[11px] font-bold tracking-tight">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Entregas Completas: <strong className="text-white">{completedOrders}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span> Total Pendientes: <strong className="text-white">{pendienteCount}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> En Curso: <strong className="text-white">{repartoCount}</strong>
              </span>
            </div>
          </div>

          {/* Map Canvas area */}
          <div className="flex-1 relative bg-slate-950 min-h-[380px] lg:min-h-0">
            {mapsLoaded ? (
              <div ref={mapRef} className="absolute inset-0 w-full h-full min-h-[380px] lg:min-h-0" />
            ) : (
              /* SVG Fallback Map */
              <div className="absolute inset-0 flex flex-col justify-between p-6 overflow-hidden select-none">
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:32px_32px]"></div>
                
                <svg className="absolute inset-0 w-full h-full p-4 pointer-events-none opacity-15">
                  <line x1="0" y1="0" x2="100%" y2="100%" stroke="#475569" strokeWidth="2" />
                  <line x1="100%" y1="0" x2="0" y2="100%" stroke="#475569" strokeWidth="2" />
                  <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#475569" strokeWidth="2" />
                </svg>

                <div className="relative z-10 flex justify-between">
                  <Badge variant="info" className="bg-blue-500/15 text-blue-300 border border-blue-500/20 text-[9px] uppercase font-bold tracking-widest">
                    Demo Interactiva (Mendoza, Arg)
                  </Badge>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Simulador de Satélite Activo</span>
                </div>

                <div className="relative flex-1 w-full flex items-center justify-center">
                  <div className="absolute w-[95%] h-[90%] border border-slate-800/40 rounded-xl bg-slate-900/30 backdrop-blur-sm overflow-hidden">
                    <div className="absolute top-[20%] left-[20%] text-[10px] text-slate-500 font-bold uppercase opacity-30">Parque Gral. San Martín</div>
                    <div className="absolute bottom-[30%] right-[30%] text-[10px] text-slate-500 font-bold uppercase opacity-30">Mendoza Centro</div>
                    <div className="absolute top-[10%] right-[15%] text-[10px] text-slate-500 font-bold uppercase opacity-30">Farmacia Central</div>

                    {/* Central Pharmacy Marker */}
                    <div 
                      className="absolute w-5 h-5 bg-blue-600 border border-white rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg cursor-pointer transform -translate-x-1/2 -translate-y-1/2 z-20"
                      style={{ top: '25%', left: '75%' }}
                      title="Farmacia Central"
                    >
                      F
                    </div>

                    {/* Order delivery destination points */}
                    {allOrders.filter(o => ['En preparación', 'En reparto', 'Entregado'].includes(o.estado) && o.destLat && o.destLng).map(order => {
                      const coords = { lat: order.destLat!, lng: order.destLng! };
                      const yPercent = 50 - ((coords.lat - (-32.8895)) * 900);
                      const xPercent = 50 + ((coords.lng - (-68.8458)) * 900);
                      
                      const topStr = `${Math.max(10, Math.min(90, yPercent))}%`;
                      const leftStr = `${Math.max(10, Math.min(90, xPercent))}%`;
                      const isDelivered = order.estado === 'Entregado';
                      const hasDriver = order.driverLat && order.driverLng;

                      return (
                        <React.Fragment key={order.id}>
                          {/* Destination Marker */}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className={`absolute w-3.5 h-3.5 border-2 border-white rounded-full flex items-center justify-center shadow-md transform -translate-x-1/2 -translate-y-1/2 z-10 transition-transform hover:scale-125 focus:outline-none ${
                              isDelivered ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                            }`}
                            style={{ top: topStr, left: leftStr }}
                            title={`${order.pacienteNombre} - ${order.estado}`}
                          />

                          {/* Driver marker if in transit */}
                          {hasDriver && (
                            <>
                              <svg className="absolute inset-0 w-full h-full pointer-events-none animate-pulse" style={{ zIndex: 1 }}>
                                <line 
                                  x1="75%" y1="25%" 
                                  x2={leftStr} y2={topStr} 
                                  stroke="#3b82f6" 
                                  strokeWidth="1.5" 
                                  strokeDasharray="4 4" 
                                  opacity="0.4"
                                />
                              </svg>

                              <div 
                                className="absolute w-5 h-5 bg-blue-600 border border-white rounded-full flex items-center justify-center shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer animate-bounce"
                                style={{ 
                                  top: `${Math.max(10, Math.min(90, 50 - ((order.driverLat! - (-32.8895)) * 900)))}%`, 
                                  left: `${Math.max(10, Math.min(90, 50 + ((order.driverLng! - (-68.8458)) * 900)))}%` 
                                }}
                                onClick={() => setSelectedOrder(order)}
                                title={`Repartidor para ${order.pacienteNombre}`}
                              >
                                <Truck size={10} className="text-white" />
                              </div>
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                <div className="relative z-10 p-4 bg-slate-900/90 border border-slate-800 rounded-xl text-center flex items-center justify-between text-xs text-slate-400">
                  <span>💡 <strong>Tip de Simulación:</strong> Inicia un reparto en la consola de Gestión de Pedidos y vuelve a esta pantalla para ver el camión moverse en vivo.</span>
                  <Button size="sm" variant="outline" className="text-[10px] text-blue-400 py-1" onClick={() => navigate('/orders')}>Ir a Gestión de Pedidos</Button>
                </div>
              </div>
            )}

            {/* Overlaid order detail pane */}
            {selectedOrder && (
              <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-96 bg-slate-900/95 backdrop-blur-md p-4 rounded-xl border border-slate-800 text-white shadow-2xl z-30 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Detalles del Despacho</span>
                    <h4 className="text-base font-black tracking-tight">{selectedOrder.pacienteNombre || selectedOrder.pacienteId}</h4>
                  </div>
                  <button 
                    onClick={() => setSelectedOrder(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <p className="truncate"><span className="text-slate-500">Dirección:</span> <span className="text-white font-semibold">{selectedOrder.direccionEntrega}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Obra Social:</span> <span className="font-medium text-slate-200">{selectedOrder.obraSocial}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Estado:</span> <span className={`font-bold uppercase ${selectedOrder.estado === 'Entregado' ? 'text-emerald-400' : 'text-red-400'}`}>{selectedOrder.estado}</span></p>
                </div>

                {(() => {
                  const routeData = realRouteData[selectedOrder.id];
                  let remDist = routeData ? routeData.distanceKm : selectedOrder.distanciaKm;
                  let remMin = routeData ? routeData.durationMin : 0;
                  
                  if (!routeData) {
                    const dLat = selectedOrder.destLat;
                    const dLng = selectedOrder.destLng;
                    if (selectedOrder.driverLat && selectedOrder.driverLng && dLat && dLng) {
                      // Apply a 1.25 multiplier to estimate street routing instead of a straight diagonal line
                      remDist = Math.min(selectedOrder.distanciaKm, Math.round(haversineDistance(selectedOrder.driverLat, selectedOrder.driverLng, dLat, dLng) * 1.25 * 10) / 10);
                    }
                    remMin = remDist <= 0.05 ? 0 : Math.ceil(remDist * 1.3 + 3);
                  }

                  let etaStr = '--:-- hs';
                  if (remMin > 0) {
                    const d = new Date();
                    d.setMinutes(d.getMinutes() + remMin);
                    etaStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' hs';
                  } else if (selectedOrder.estado === 'Entregado') {
                    etaStr = 'Entregado';
                  }

                  return (
                    <div className="grid grid-cols-3 gap-2 text-center bg-blue-950/40 p-2.5 rounded-lg border border-blue-900/50">
                      <div>
                        <span className="block text-[8px] uppercase font-bold text-slate-500">Dist. Restante</span>
                        <span className="text-xs font-black text-white">{remDist} km</span>
                      </div>
                      <div className="border-x border-slate-800">
                        <span className="block text-[8px] uppercase font-bold text-slate-500">Tiempo Demora</span>
                        <span className="text-xs font-black text-emerald-400">{remMin} min</span>
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase font-bold text-slate-500">Hora Entrega</span>
                        <span className="text-xs font-black text-yellow-400">{etaStr}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-[10px] uppercase font-bold py-2"
                    onClick={() => navigate(currentUser?.permissions?.includes('orders') ? `/orders/${selectedOrder.id}` : currentUser?.permissions?.includes('queue') ? `/queue/${selectedOrder.id}` : '#')}
                    disabled={!currentUser?.permissions?.includes('orders') && !currentUser?.permissions?.includes('queue')}
                  >
                    Ver Detalle Completo
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Monitoring Sidebar (1/4 Column) */}
        <div className="space-y-4 flex flex-col h-[450px] lg:h-full overflow-hidden">
          {/* Dispatch overview stats card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 shrink-0">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Compass className="text-blue-500" size={14} /> Resumen Logístico
            </h4>
            
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                  <span>Eficiencia de Entrega</span>
                  <span>{deliveryRate}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full transition-all" style={{ width: `${deliveryRate}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-lg font-black text-slate-900">{completedOrders}</span>
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Entregados</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-lg font-black text-slate-900">{pendienteCount}</span>
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Pendientes</span>
                </div>
              </div>
            </div>
          </div>

          {/* List of active deliverers in transit */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex-1 flex flex-col overflow-hidden">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2 flex-shrink-0">
              <Navigation className="text-emerald-500 shrink-0" size={14} /> En Tránsito ({repartoCount})
            </h4>

            {/* Search filter for drivers */}
            <div className="mt-3 relative flex-shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por paciente o id..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 font-medium"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto flex-1 pr-1 mt-2">
              {filteredRepartos.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs flex flex-col items-center justify-center h-full gap-2">
                  <Truck size={24} className="text-slate-300" />
                  <span>No se encontraron repartos en tránsito.</span>
                </div>
              ) : (
                filteredRepartos.map(order => {
                  const routeData = realRouteData[order.id];
                  let remDist = routeData ? routeData.distanceKm : order.distanciaKm;
                  let remMin = routeData ? routeData.durationMin : 0;

                  if (!routeData) {
                    const dLat = order.destLat;
                    const dLng = order.destLng;
                    if (order.driverLat && order.driverLng && dLat && dLng) {
                      remDist = Math.min(order.distanciaKm, Math.round(haversineDistance(order.driverLat, order.driverLng, dLat, dLng) * 1.25 * 10) / 10);
                    }
                    remMin = remDist <= 0.05 ? 0 : Math.ceil(remDist * 1.3 + 3);
                  }

                  return (
                    <div 
                      key={order.id} 
                      className="py-3 flex flex-col gap-1.5 cursor-pointer hover:bg-slate-50 rounded-lg p-2 transition-colors"
                      onClick={() => {
                        setSelectedOrder(order);
                        if (mapInstanceRef.current && order.driverLat && order.driverLng) {
                          mapInstanceRef.current.panTo({ lat: order.driverLat, lng: order.driverLng });
                          mapInstanceRef.current.setZoom(14);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-xs text-slate-800 leading-tight truncate w-36">{order.pacienteNombre}</p>
                           <p className="text-[9px] text-slate-400 font-mono">ID #{order.id.slice(0, 8)}</p>
                        </div>
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded shrink-0">
                          En Tránsito
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold mt-1">
                        <span className="flex items-center gap-1"><Truck size={10} /> {remDist} km rest.</span>
                        <span className="text-emerald-600 font-bold">{remMin} minutos</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
