import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { MapPin, Phone, User, Activity, Loader2, ArrowRight, CheckCircle, Map, Info, AlertTriangle, RefreshCw, CreditCard, DollarSign, FileText, Clock, Truck } from 'lucide-react';
import { OrderState } from '../../types';

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
  const latOffset = ((Math.abs(hash) % 100) / 8000) - 0.00625;
  const lngOffset = (((Math.abs(hash) >> 8) % 100) / 8000) - 0.00625;
  return { lat: baseLat + latOffset, lng: baseLng + lngOffset };
}

interface WaypointInputProps {
  value: string;
  onChange: (val: string) => void;
  onRemove?: () => void;
  index: number;
  disabled: boolean;
  mapsLoaded: boolean;
}

function WaypointInput({ value, onChange, onRemove, index, disabled, mapsLoaded }: WaypointInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteInstance = useRef<any>(null);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapsLoaded || disabled || !(window as any).google?.maps?.places || !inputRef.current) return;
    
    try {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry']
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          onChangeRef.current(place.formatted_address);
        }
      });

      autocompleteInstance.current = autocomplete;
    } catch (e) {
      console.error('Error binding Google Autocomplete to waypoint:', e);
    }

    return () => {
      if (autocompleteInstance.current && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(autocompleteInstance.current);
      }
    };
  }, [mapsLoaded, disabled]);

  return (
    <div className="space-y-1 animate-fadeIn">
      <label className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
        <span>Parada {index + 1} (Intermedia)</span>
        {onRemove && (
          <button 
            type="button" 
            className="text-red-500 hover:text-red-600 text-[10px] font-bold uppercase tracking-wider text-right"
            onClick={onRemove}
          >
            Eliminar
          </button>
        )}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-900 pr-24"
          placeholder="Ej: Clínica, Sanatorio o Farmacia 2..."
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
        />
        {mapsLoaded && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
            Auto-complete
          </span>
        )}
      </div>
    </div>
  );
}

export default function OrderDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { orders, currentUser, updateOrder, margins, baseLogisticsCost, perKmLogisticsCost, googleMapsApiKey } = useAppStore();
  
  const order = orders.find(o => o.id === id);
  
  const [address, setAddress] = useState(order?.direccionEntrega || '');
  const [distance, setDistance] = useState<number>(order?.distanciaKm || 0);
  const [waypoints, setWaypoints] = useState<string[]>(order?.waypoints || []);

  const getDeliveryMetrics = () => {
    const dLat = order?.destLat || getDeterministicMendozaCoords(order?.id || '').lat;
    const dLng = order?.destLng || getDeterministicMendozaCoords(order?.id || '').lng;
    
    let remainingDist = distance;
    if (order?.driverLat && order?.driverLng) {
      remainingDist = haversineDistance(order.driverLat, order.driverLng, dLat, dLng);
      remainingDist = Math.min(distance, Math.round(remainingDist * 10) / 10);
    }
    
    const remainingMin = remainingDist <= 0.05 ? 0 : Math.ceil(remainingDist * 1.3 + 3);
    
    let etaStr = '--:-- hs';
    if (remainingMin > 0) {
      const etaDate = new Date();
      etaDate.setMinutes(etaDate.getMinutes() + remainingMin);
      etaStr = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' hs';
    } else if (order?.estado === 'Entregado') {
      etaStr = 'Entregado';
    }
    
    return {
      remainingDistance: remainingDist,
      remainingTime: remainingMin,
      eta: etaStr
    };
  };

  const metrics = getDeliveryMetrics();

  // Google Maps States
  const [apiKey, setApiKey] = useState(googleMapsApiKey || (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '');
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapsError, setMapsError] = useState(false);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const [originAddress, setOriginAddress] = useState('Maipumed');
  const [calculating, setCalculating] = useState(false);
  const autocompleteInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteInstance = useRef<any>(null);
  const originAutocompleteInputRef = useRef<HTMLInputElement | null>(null);
  const originAutocompleteInstance = useRef<any>(null);

  // Live Map refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);

  // Real-time Delivery Simulator states
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);
  const [simulationCoords, setSimulationCoords] = useState<any[]>([]);
  const [simulationStatus, setSimulationStatus] = useState<string>('');
  const simulationTimerRef = useRef<any>(null);
  const fallbackPolylineRef = useRef<any>(null);
  const fallbackMarkersRef = useRef<any[]>([]);
  const deliveryMarkerRef = useRef<any>(null);

  // Real-time GPS sharing state
  const [isSharingGPS, setIsSharingGPS] = useState(false);
  const gpsWatchIdRef = useRef<number | null>(null);

  const simulateCoordinatesFallback = (origin: string, dest: string, stopoverPoints: string[] = []) => {
    if (!mapInstanceRef.current || !(window as any).google?.maps) return;
    try {
      const google = (window as any).google;
      // Clear previous fallback drawings
      if (fallbackPolylineRef.current) fallbackPolylineRef.current.setMap(null);
      fallbackMarkersRef.current.forEach(m => m.setMap(null));
      fallbackMarkersRef.current = [];

      const geocoder = new google.maps.Geocoder();
      const allAddresses = [origin, ...stopoverPoints.filter(s => s.trim() !== ''), dest];
      const coordsPromises = allAddresses.map((addr, idx) => {
        return new Promise<any>((resolve) => {
          geocoder.geocode({ address: addr }, (results: any, status: string) => {
            if (status === 'OK' && results[0]?.geometry?.location) {
              resolve(results[0].geometry.location);
            } else {
              // Fallback based on map center so it's always centered nicely on the user's view
              const center = mapInstanceRef.current.getCenter();
              const angle = (idx / allAddresses.length) * Math.PI * 0.8 - (Math.PI * 0.4); // arc shape
              const radius = 0.012 * (idx + 1); // dynamic spreading
              const fallbackLat = center.lat() + Math.sin(angle) * radius;
              const fallbackLng = center.lng() + Math.cos(angle) * radius;
              resolve(new google.maps.LatLng(fallbackLat, fallbackLng));
            }
          });
        });
      });

      Promise.all(coordsPromises).then((coordinates) => {
        // Draw fallback polyline (dashed or styled)
        const polyline = new google.maps.Polyline({
          path: coordinates,
          geodesic: true,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map: mapInstanceRef.current
        });
        fallbackPolylineRef.current = polyline;

        // Draw custom markers for each stop
        coordinates.forEach((latLng, idx) => {
          let label = '';
          let iconUrl = '';
          let title = '';
          
          if (idx === 0) {
            label = 'O';
            title = 'Farmacia de Origen';
            iconUrl = 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
          } else if (idx === coordinates.length - 1) {
            label = 'D';
            title = 'Domicilio del Paciente';
            iconUrl = 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
          } else {
            label = `${idx}`;
            title = `Parada intermedia: ${stopoverPoints[idx - 1]}`;
            iconUrl = 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
          }

          const marker = new google.maps.Marker({
            position: latLng,
            map: mapInstanceRef.current,
            title: title,
            label: {
              text: label,
              color: 'white',
              fontWeight: 'bold'
            },
            icon: iconUrl
          });
          fallbackMarkersRef.current.push(marker);
        });

        // Fit map bounds to show all markers beautifully
        const bounds = new google.maps.LatLngBounds();
        coordinates.forEach(latLng => bounds.extend(latLng));
        mapInstanceRef.current.fitBounds(bounds);

        // Save path coordinates for the real-time simulation
        setSimulationCoords(coordinates);
      });
    } catch (err) {
      console.error('Error drawing fallback route:', err);
    }
  };

  const drawRouteOnMap = (origin: string, dest: string, stopoverPoints: string[] = []) => {
    if (!mapsLoaded || !(window as any).google?.maps) return;
    try {
      if (!directionsRendererRef.current && mapInstanceRef.current) {
        directionsRendererRef.current = new (window as any).google.maps.DirectionsRenderer({
          map: mapInstanceRef.current,
          suppressMarkers: false,
        });
      }
      
      if (directionsRendererRef.current) {
        // Clear fallback lines first
        if (fallbackPolylineRef.current) {
          fallbackPolylineRef.current.setMap(null);
          fallbackPolylineRef.current = null;
        }
        fallbackMarkersRef.current.forEach(m => m.setMap(null));
        fallbackMarkersRef.current = [];

        const directionsService = new (window as any).google.maps.DirectionsService();
        const formattedWaypoints = stopoverPoints.filter(s => s.trim() !== '').map(addr => ({
          location: addr,
          stopover: true
        }));

        directionsService.route(
          {
            origin: origin,
            destination: dest,
            waypoints: formattedWaypoints,
            optimizeWaypoints: true,
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
          },
          (result: any, status: string) => {
            if (status === 'OK') {
              setDirectionsError(null);
              directionsRendererRef.current.setDirections(result);
            } else {
              console.warn('Directions request failed due to: ' + status);
              if (status === 'REQUEST_DENIED') {
                setDirectionsError('La API Key no tiene autorizado el servicio "Directions API". Por favor habilítalo en Google Cloud Console.');
              } else {
                setDirectionsError(`Error al trazar ruta (${status}). Verifica si la "Directions API" está habilitada.`);
              }
              // Set mock coordinates between points for our visual simulator if maps request is denied!
              simulateCoordinatesFallback(origin, dest, stopoverPoints);
            }
          }
        );
      }
    } catch (err) {
      console.error('Error drawing route on map:', err);
    }
  };

  const startDeliverySimulation = () => {
    if (isSimulating) {
      stopDeliverySimulation();
      return;
    }

    if (!mapInstanceRef.current || !(window as any).google?.maps) return;
    const google = (window as any).google;

    let pathPoints: any[] = [];
    
    // Check if we can get the path from the DirectionsRenderer
    if (directionsRendererRef.current) {
      const directions = directionsRendererRef.current.getDirections();
      if (directions?.routes?.[0]?.overview_path) {
        pathPoints = directions.routes[0].overview_path;
      }
    }
    
    // If we don't have overview_path, try to use our fallback coordinates
    if (pathPoints.length === 0 && simulationCoords.length > 0) {
      const interpolated: any[] = [];
      for (let i = 0; i < simulationCoords.length - 1; i++) {
        const start = simulationCoords[i];
        const end = simulationCoords[i+1];
        // add 15 intermediate points for smoothness
        for (let j = 0; j <= 15; j++) {
          const ratio = j / 15;
          const lat = start.lat() + (end.lat() - start.lat()) * ratio;
          const lng = start.lng() + (end.lng() - start.lng()) * ratio;
          interpolated.push(new google.maps.LatLng(lat, lng));
        }
      }
      pathPoints = interpolated;
    }

    if (pathPoints.length === 0) {
      const center = mapInstanceRef.current.getCenter();
      pathPoints = [
        new google.maps.LatLng(center.lat() + 0.008, center.lng() - 0.008),
        new google.maps.LatLng(center.lat(), center.lng()),
        new google.maps.LatLng(center.lat() - 0.008, center.lng() + 0.008)
      ];
    }

    setIsSimulating(true);
    setSimulationStep(0);
    
    const activeWaypoints = waypoints.filter(w => w.trim() !== '');
    const stopsText = activeWaypoints.length > 0 ? ` pasando por ${activeWaypoints.length} paradas intermedias` : '';
    setSimulationStatus(`Iniciando despacho desde farmacia de origen${stopsText}...`);

    if (deliveryMarkerRef.current) deliveryMarkerRef.current.setMap(null);
    
    deliveryMarkerRef.current = new google.maps.Marker({
      position: pathPoints[0],
      map: mapInstanceRef.current,
      title: 'Repartidor en Tiempo Real',
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      }
    });

    let currentStep = 0;
    const intervalMs = 150;
    
    simulationTimerRef.current = setInterval(() => {
      currentStep++;
      if (currentStep >= pathPoints.length) {
        clearInterval(simulationTimerRef.current);
        setIsSimulating(false);
        setSimulationStatus('¡Reparto Completado! Los medicamentos han sido entregados con éxito en la casa del cliente.');
        if (deliveryMarkerRef.current) {
          deliveryMarkerRef.current.setPosition(pathPoints[pathPoints.length - 1]);
        }
        
        updateOrder(order.id, {
          estado: 'Entregado'
        });
        return;
      }

      setSimulationStep(currentStep);
      const pos = pathPoints[currentStep];
      if (deliveryMarkerRef.current) {
        deliveryMarkerRef.current.setPosition(pos);
      }

      // Update Firebase coordinates in real-time so other views see the driver move
      updateOrder(order.id, {
        driverLat: pos.lat(),
        driverLng: pos.lng(),
        driverLastUpdated: new Date().toISOString()
      });
      
      const percent = Math.round((currentStep / pathPoints.length) * 100);
      if (percent < 25) {
        setSimulationStatus(`Saliendo del origen. En tránsito... (${percent}%)`);
      } else if (percent >= 25 && percent < 65 && activeWaypoints.length > 0) {
        setSimulationStatus(`Arribando a parada intermedia para retiro o validación de receta... (${percent}%)`);
      } else if (percent >= 65 && percent < 90) {
        setSimulationStatus(`En camino hacia el domicilio del cliente. Reparto prioritario... (${percent}%)`);
      } else {
        setSimulationStatus(`Llegando a destino. Entregando pedido... (${percent}%)`);
      }

      mapInstanceRef.current.panTo(pos);
    }, intervalMs);
  };

  const stopDeliverySimulation = () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
    }
    setIsSimulating(false);
    setSimulationStatus('Simulación de reparto detenida.');
    if (deliveryMarkerRef.current) {
      deliveryMarkerRef.current.setMap(null);
      deliveryMarkerRef.current = null;
    }
  };

  const startRealGPSTracking = () => {
    if (isSharingGPS) {
      stopRealGPSTracking();
      return;
    }

    if (!navigator.geolocation) {
      alert("La geolocalización no está soportada por este navegador.");
      return;
    }

    setIsSharingGPS(true);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        console.log("Real GPS update received:", lat, lng);
        
        if (order) {
          updateOrder(order.id, {
            driverLat: lat,
            driverLng: lng,
            driverLastUpdated: new Date().toISOString()
          });
        }
      },
      (error) => {
        console.error("Error al obtener señal GPS:", error);
        let errorMsg = "Error al obtener señal GPS real.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = "Permiso denegado para acceder al GPS del dispositivo.";
        }
        alert(errorMsg);
        stopRealGPSTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    gpsWatchIdRef.current = watchId;
  };

  const stopRealGPSTracking = () => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setIsSharingGPS(false);
  };

  useEffect(() => {
    return () => {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
      }
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
      if (fallbackPolylineRef.current) {
        fallbackPolylineRef.current.setMap(null);
      }
      fallbackMarkersRef.current.forEach(m => m.setMap(null));
      if (deliveryMarkerRef.current) {
        deliveryMarkerRef.current.setMap(null);
      }
    };
  }, []);

  useEffect(() => {
    if (googleMapsApiKey) {
      setApiKey(googleMapsApiKey);
    }
  }, [googleMapsApiKey]);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.googleMapsApiKey) {
          setApiKey(data.googleMapsApiKey);
        }
      })
      .catch(err => console.error('Error fetching runtime config:', err));
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    try {
      loadGoogleMapsScript(apiKey, () => {
        setMapsLoaded(true);
        setMapsError(false);
      });
    } catch (e) {
      console.error('Error loading Google Maps:', e);
      setMapsError(true);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current || !(window as any).google?.maps) return;
    try {
      if (!mapInstanceRef.current) {
        const map = new (window as any).google.maps.Map(mapContainerRef.current, {
          center: { lat: -34.6037, lng: -58.3816 }, // Buenos Aires
          zoom: 12,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          styles: [
            {
              "featureType": "all",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#4b5563" }]
            },
            {
              "featureType": "water",
              "elementType": "geometry",
              "stylers": [{ "color": "#e0f2fe" }]
            },
            {
              "featureType": "landscape",
              "elementType": "geometry",
              "stylers": [{ "color": "#f1f5f9" }]
            }
          ]
        });

        // Click listener for real-time interactive GPS placement
        map.addListener('click', (event: any) => {
          if (event.latLng && id) {
            const lat = event.latLng.lat();
            const lng = event.latLng.lng();
            console.log("Interactive GPS placement at:", lat, lng);
            useAppStore.getState().updateOrder(id, {
              driverLat: lat,
              driverLng: lng,
              driverLastUpdated: new Date().toISOString()
            });
          }
        });

        mapInstanceRef.current = map;
      }
    } catch (e) {
      console.error('Error initializing map:', e);
    }
  }, [mapsLoaded, mapContainerRef.current, id]);

  useEffect(() => {
    if (mapsLoaded && originAddress && address && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        drawRouteOnMap(originAddress, address, waypoints);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [mapsLoaded, originAddress, address, waypoints, mapInstanceRef.current]);

  // Real-time Database-driven GPS Tracking Effect
  useEffect(() => {
    if (!mapsLoaded || !mapInstanceRef.current || !(window as any).google?.maps || !order) return;
    const google = (window as any).google;

    const lat = order.driverLat;
    const lng = order.driverLng;

    if (lat && lng) {
      const pos = new google.maps.LatLng(lat, lng);

      if (!deliveryMarkerRef.current) {
        deliveryMarkerRef.current = new google.maps.Marker({
          position: pos,
          map: mapInstanceRef.current,
          title: 'Repartidor en Vivo (GPS REAL)',
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 7,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: 0
          }
        });
      } else {
        deliveryMarkerRef.current.setPosition(pos);
      }

      // Center map on driver's live coordinate
      mapInstanceRef.current.panTo(pos);
    } else {
      if (deliveryMarkerRef.current && !isSimulating) {
        deliveryMarkerRef.current.setMap(null);
        deliveryMarkerRef.current = null;
      }
    }
  }, [mapsLoaded, order?.driverLat, order?.driverLng, isSimulating]);

  useEffect(() => {
    if (!mapsLoaded || !(window as any).google?.maps) return;
    try {
      if (autocompleteInputRef.current) {
        const autocomplete = new (window as any).google.maps.places.Autocomplete(autocompleteInputRef.current, {
          fields: ['formatted_address', 'geometry']
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.formatted_address) {
            setAddress(place.formatted_address);
          }
        });

        autocompleteInstance.current = autocomplete;
      }

      if (originAutocompleteInputRef.current) {
        const originAutocomplete = new (window as any).google.maps.places.Autocomplete(originAutocompleteInputRef.current, {
          fields: ['formatted_address', 'geometry']
        });

        originAutocomplete.addListener('place_changed', () => {
          const place = originAutocomplete.getPlace();
          if (place.formatted_address) {
            setOriginAddress(place.formatted_address);
          }
        });

        originAutocompleteInstance.current = originAutocomplete;
      }
    } catch (e) {
      console.error('Error binding Google Autocomplete:', e);
    }
  }, [mapsLoaded]);

  const [pharmaPrices, setPharmaPrices] = useState(order?.medicamentos.map(m => {
    const pLista = m.precioLista || 0;
    const dOS = m.descuentoObraSocial || 0;
    const dAdd = m.descuentoAdicional || 0;
    return {
      precioLista: pLista,
      descuentoObraSocial: dOS,
      descuentoAdicional: dAdd,
      pctObraSocial: pLista > 0 ? ((dOS / pLista) * 100).toFixed(1) : '',
      pctAdicional: pLista > 0 ? ((dAdd / pLista) * 100).toFixed(1) : '',
    };
  }) || []);

  useEffect(() => {
    if (order?.medicamentos) {
      setPharmaPrices(order.medicamentos.map(m => {
        const pLista = m.precioLista || 0;
        const dOS = m.descuentoObraSocial || 0;
        const dAdd = m.descuentoAdicional || 0;
        return {
          precioLista: pLista,
          descuentoObraSocial: dOS,
          descuentoAdicional: dAdd,
          pctObraSocial: pLista > 0 ? ((dOS / pLista) * 100).toFixed(1) : '',
          pctAdicional: pLista > 0 ? ((dAdd / pLista) * 100).toFixed(1) : '',
        };
      }));
    }
  }, [order]);

  if (!order || !currentUser) return <div>Pedido no encontrado</div>;

  const isPharmaRoute = location.pathname.startsWith('/queue');
  const isAdminRoute = location.pathname.startsWith('/orders');
  
  // Since route access is driven by permissions, we can just use the route type or permission checks
  const isPharma = isPharmaRoute;
  const isAdmin = isAdminRoute;
  
  // Pharma Actions
  const handlePharmaQuote = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const updatedMeds = order.medicamentos.map((m, i) => {
      const prices = pharmaPrices[i];
      const costo = (prices.precioLista || 0) - (prices.descuentoObraSocial || 0) - (prices.descuentoAdicional || 0);
      const costoFinal = costo < 0 ? 0 : costo;
      
      const margenDefault = margins['Medicamentos'] || 20; // 20% default margin
      
      return {
        ...m,
        precioLista: prices.precioLista,
        descuentoObraSocial: prices.descuentoObraSocial,
        descuentoAdicional: prices.descuentoAdicional,
        costoFarmacia: costoFinal,
        validado: true,
        margenAplicado: margenDefault,
        precioFinal: costoFinal * (1 + (margenDefault / 100))
      };
    });

    updateOrder(order.id, { 
      medicamentos: updatedMeds,
      estado: 'Cotizado',
      pharmaUser: currentUser.id
    });
    alert('Cotización enviada a recepción');
  };

  // Logistics & Pricing (Admin)
  const calculateLogistics = () => {
    if (!address) {
      alert('Por favor ingrese una dirección de entrega primero.');
      return;
    }

    const hasRealMaps = mapsLoaded && (window as any).google?.maps;

    if (!hasRealMaps) {
      // Graceful fallback for preview & development without apiKey
      const baseDistance = Math.floor(Math.random() * 8) + 2;
      const additionalStopsDistance = waypoints.filter(w => w.trim() !== '').length * (Math.floor(Math.random() * 4) + 2);
      const totalDist = baseDistance + additionalStopsDistance;
      setDistance(totalDist);
      const logisticCost = baseLogisticsCost + (totalDist * perKmLogisticsCost);
      updateOrder(order.id, {
        direccionEntrega: address,
        distanciaKm: totalDist,
        costoLogistico: logisticCost,
        waypoints: waypoints
      });
      return;
    }

    setCalculating(true);
    setDirectionsError(null);
    try {
      const google = (window as any).google;
      const directionsService = new google.maps.DirectionsService();
      
      const activeWaypoints = waypoints.filter(s => s.trim() !== '');
      const formattedWaypoints = activeWaypoints.map(addr => ({
        location: addr,
        stopover: true
      }));

      directionsService.route(
        {
          origin: originAddress,
          destination: address,
          waypoints: formattedWaypoints,
          optimizeWaypoints: true,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result: any, status: string) => {
          setCalculating(false);
          if (status === 'OK') {
            // Calculate total distance by summing all leg distances!
            let totalDistMeters = 0;
            const legs = result.routes[0].legs;
            for (let i = 0; i < legs.length; i++) {
              totalDistMeters += legs[i].distance.value;
            }
            const distInKm = Math.round((totalDistMeters / 1000) * 10) / 10;
            setDistance(distInKm);
            
            const logisticCost = baseLogisticsCost + (distInKm * perKmLogisticsCost);
            
            const lastLeg = legs[legs.length - 1];
            const dLat = lastLeg.end_location.lat();
            const dLng = lastLeg.end_location.lng();

            updateOrder(order.id, {
              direccionEntrega: address,
              distanciaKm: distInKm,
              costoLogistico: logisticCost,
              waypoints: waypoints,
              destLat: dLat,
              destLng: dLng
            });

            // Draw route on map
            if (directionsRendererRef.current) {
              directionsRendererRef.current.setDirections(result);
            }
          } else {
            console.warn('Google Maps Directions service failed:', status);
            
            if (status === 'REQUEST_DENIED') {
              setDirectionsError('La API Key no tiene autorizado el servicio "Directions API". Por favor habilítalo en Google Cloud Console.');
            } else {
              setDirectionsError(`Error en cálculo de ruta (${status}).`);
            }

            // Fallback gracefully with simulator-like estimation
            const baseDistance = Math.floor(Math.random() * 8) + 2;
            const additionalStopsDistance = activeWaypoints.length * (Math.floor(Math.random() * 4) + 2);
            const totalDist = baseDistance + additionalStopsDistance;
            setDistance(totalDist);
            const logisticCost = baseLogisticsCost + (totalDist * perKmLogisticsCost);
            
            const fallbackCoords = getDeterministicMendozaCoords(order.id);

            updateOrder(order.id, {
              direccionEntrega: address,
              distanciaKm: totalDist,
              costoLogistico: logisticCost,
              waypoints: waypoints,
              destLat: fallbackCoords.lat,
              destLng: fallbackCoords.lng
            });

            // Try to draw fallback path
            simulateCoordinatesFallback(originAddress, address, waypoints);
          }
        }
      );
    } catch (err) {
      console.error(err);
      setCalculating(false);
      // Fallback
      const baseDistance = Math.floor(Math.random() * 8) + 2;
      const totalDist = baseDistance + (waypoints.filter(w => w.trim() !== '').length * 4);
      setDistance(totalDist);
      const logisticCost = baseLogisticsCost + (totalDist * perKmLogisticsCost);
      updateOrder(order.id, {
        direccionEntrega: address,
        distanciaKm: totalDist,
        costoLogistico: logisticCost,
        waypoints: waypoints
      });
    }
  };

  const handleChargePatient = () => {
    updateOrder(order.id, {
      estado: 'Pago Pendiente',
    });
  };

  const handleConfirmPayment = () => {
    updateOrder(order.id, {
      estadoPago: 'Pagado',
      estado: 'En preparación',
      metodoPago: 'Link'
    });
  };

  const calculateTotals = () => {
    const medsCost = order.medicamentos.reduce((acc, m) => acc + (m.precioFinal || 0), 0);
    return {
      meds: medsCost,
      logistics: order.costoLogistico || 0,
      total: medsCost + (order.costoLogistico || 0)
    };
  };

  const totals = calculateTotals();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Pedido #{order.id}</h2>
            <Badge 
              variant={order.estado === 'Entregado' ? 'success' : order.estado === 'Cancelado' ? 'danger' : 'info'}
            >
              {order.estado}
            </Badge>
          </div>
          <p className="text-gray-500 text-sm">Creado por {order.creadoPor} en {new Date(order.fecha).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Data */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2">
                <User size={18} className="text-blue-500" />
                Datos del Paciente
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4 text-sm">
              <div className="col-span-2 md:col-span-1">
                <p className="text-gray-500">Nombre Completo del Paciente</p>
                <p className="font-medium text-lg">{order.pacienteNombre || order.pacienteId}</p>
                {order.dni && <p className="text-sm text-gray-500">DNI: {order.dni}</p>}
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-gray-500">Obra Social y N° Afiliado</p>
                <p className="font-medium text-lg">{order.obraSocial} {order.numeroAfiliado ? `- ${order.numeroAfiliado}` : ''}</p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-gray-500">Médico Prescriptor</p>
                <p className="font-medium">{order.medico || 'No especificado'}</p>
                {order.matriculaMedico && <p className="text-sm text-gray-500">M.N./M.P.: {order.matriculaMedico}</p>}
              </div>
              <div className="col-span-2 md:col-span-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold mb-1">Token de Validación</p>
                <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">{order.token || 'N/A'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Pharmacist Quote Form OR Admin View of Meds */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2">
                <Activity size={18} className="text-teal-500" />
                Medicamentos Requeridos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.estado === 'Revisión Farmacéutica' && isPharma ? (
                // Pharma Input Form
                <form onSubmit={handlePharmaQuote} className="space-y-4">
                  {order.medicamentos.map((med, idx) => {
                    const price = pharmaPrices[idx] || { precioLista: 0, descuentoObraSocial: 0, descuentoAdicional: 0, pctObraSocial: '', pctAdicional: '' };
                    const neto = (price.precioLista || 0) - (price.descuentoObraSocial || 0) - (price.descuentoAdicional || 0);
                    return (
                      <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex-1 mb-4">
                          <p className="font-bold text-slate-900">{med.nombre}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{med.presentacion} - {med.cantidad} unidad(es)</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Precio Lista ($)</span>
                            <Input 
                              type="number" 
                              min="0" 
                              step="0.01" 
                              value={price.precioLista === 0 ? '' : price.precioLista}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const newPrices = [...pharmaPrices];
                                newPrices[idx].precioLista = val;
                                
                                // Recalculate dollar amounts from stored percentages if set
                                if (newPrices[idx].pctObraSocial !== '') {
                                  newPrices[idx].descuentoObraSocial = Number(((Number(newPrices[idx].pctObraSocial) / 100) * val).toFixed(2));
                                } else if (val > 0 && newPrices[idx].descuentoObraSocial > 0) {
                                  newPrices[idx].pctObraSocial = ((newPrices[idx].descuentoObraSocial / val) * 100).toFixed(1);
                                }
                                
                                if (newPrices[idx].pctAdicional !== '') {
                                  newPrices[idx].descuentoAdicional = Number(((Number(newPrices[idx].pctAdicional) / 100) * val).toFixed(2));
                                } else if (val > 0 && newPrices[idx].descuentoAdicional > 0) {
                                  newPrices[idx].pctAdicional = ((newPrices[idx].descuentoAdicional / val) * 100).toFixed(1);
                                }
                                
                                setPharmaPrices(newPrices);
                              }}
                              required 
                            />
                            <span className="text-[9px] text-slate-400 font-semibold block h-3"></span>
                          </div>
                          
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">Desc. OS</span>
                            <div className="flex gap-1.5">
                              <div className="flex-1 min-w-0">
                                <Input 
                                  placeholder="$"
                                  type="number" 
                                  min="0" 
                                  step="0.01" 
                                  value={price.descuentoObraSocial === 0 ? '' : price.descuentoObraSocial}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    const newPrices = [...pharmaPrices];
                                    newPrices[idx].descuentoObraSocial = val;
                                    
                                    if (newPrices[idx].precioLista > 0) {
                                      newPrices[idx].pctObraSocial = ((val / newPrices[idx].precioLista) * 100).toFixed(1);
                                    } else {
                                      newPrices[idx].pctObraSocial = '';
                                    }
                                    setPharmaPrices(newPrices);
                                  }}
                                />
                              </div>
                              <div className="w-16 shrink-0">
                                <Input 
                                  placeholder="%"
                                  type="number" 
                                  min="0" 
                                  max="100"
                                  step="0.1" 
                                  value={price.pctObraSocial}
                                  onChange={(e) => {
                                    const valStr = e.target.value;
                                    const newPrices = [...pharmaPrices];
                                    newPrices[idx].pctObraSocial = valStr;
                                    
                                    if (newPrices[idx].precioLista > 0 && valStr !== '') {
                                      newPrices[idx].descuentoObraSocial = Number(((Number(valStr) / 100) * newPrices[idx].precioLista).toFixed(2));
                                    } else {
                                      newPrices[idx].descuentoObraSocial = 0;
                                    }
                                    setPharmaPrices(newPrices);
                                  }}
                                />
                              </div>
                            </div>
                            <span className="text-[9px] text-slate-500 font-bold block h-3 leading-none truncate">
                              {price.precioLista > 0 && price.descuentoObraSocial > 0 ? `Equivale a ${((price.descuentoObraSocial / price.precioLista) * 100).toFixed(1)}%` : ''}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">Desc. Extra</span>
                            <div className="flex gap-1.5">
                              <div className="flex-1 min-w-0">
                                <Input 
                                  placeholder="$"
                                  type="number" 
                                  min="0" 
                                  step="0.01" 
                                  value={price.descuentoAdicional === 0 ? '' : price.descuentoAdicional}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    const newPrices = [...pharmaPrices];
                                    newPrices[idx].descuentoAdicional = val;
                                    
                                    if (newPrices[idx].precioLista > 0) {
                                      newPrices[idx].pctAdicional = ((val / newPrices[idx].precioLista) * 100).toFixed(1);
                                    } else {
                                      newPrices[idx].pctAdicional = '';
                                    }
                                    setPharmaPrices(newPrices);
                                  }}
                                />
                              </div>
                              <div className="w-16 shrink-0">
                                <Input 
                                  placeholder="%"
                                  type="number" 
                                  min="0" 
                                  max="100"
                                  step="0.1" 
                                  value={price.pctAdicional}
                                  onChange={(e) => {
                                    const valStr = e.target.value;
                                    const newPrices = [...pharmaPrices];
                                    newPrices[idx].pctAdicional = valStr;
                                    
                                    if (newPrices[idx].precioLista > 0 && valStr !== '') {
                                      newPrices[idx].descuentoAdicional = Number(((Number(valStr) / 100) * newPrices[idx].precioLista).toFixed(2));
                                    } else {
                                      newPrices[idx].descuentoAdicional = 0;
                                    }
                                    setPharmaPrices(newPrices);
                                  }}
                                />
                              </div>
                            </div>
                            <span className="text-[9px] text-slate-500 font-bold block h-3 leading-none truncate">
                              {price.precioLista > 0 && price.descuentoAdicional > 0 ? `Equivale a ${((price.descuentoAdicional / price.precioLista) * 100).toFixed(1)}%` : ''}
                            </span>
                          </div>

                          <div className="bg-white border border-slate-200 px-3 py-2 rounded-lg flex flex-col justify-center items-center h-10 mb-3 shadow-sm">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Costo (Neto)</span>
                            <span className="font-bold text-blue-600 leading-none">${Math.max(0, neto).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-end pt-4 border-t border-slate-200">
                    <Button type="submit" variant="primary">Enviar Cotización a DALEDMED</Button>
                  </div>
                </form>
              ) : (
                // Read Only View for Meds
                <div className="space-y-4">
                  {order.medicamentos.map((med, idx) => (
                    <div key={idx} className="flex justify-between items-start py-4 border-b border-slate-100 last:border-0 gap-4 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 text-sm">{med.nombre}</p>
                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-0.5">
                          {med.presentacion || 'Presentación regular'} • {med.cantidad} unidad(es) {med.validado && '✓ Validado'}
                        </p>
                        
                        {(med.validado || (med.precioLista !== undefined && med.precioLista > 0)) && (
                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[11px]">
                            <div>
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px] block mb-0.5">Precio Lista</span>
                              <span className="font-bold text-slate-700">${(med.precioLista || 0).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px] block mb-0.5">Desc. OS</span>
                              <span className="font-bold text-amber-600">-${(med.descuentoObraSocial || 0).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px] block mb-0.5">Desc. Extra</span>
                              <span className="font-bold text-purple-600">-${(med.descuentoAdicional || 0).toLocaleString()}</span>
                            </div>
                            <div className="border-l border-slate-200 pl-2">
                              <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-0.5">Costo Farmacia</span>
                              <span className="font-bold text-blue-600">${(med.costoFarmacia || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {(med.validado || (med.precioLista !== undefined && med.precioLista > 0)) ? (
                        <div className="text-right shrink-0">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block leading-none mb-1">Precio Paciente</span>
                          <p className="font-black text-slate-900 text-xl tracking-tight leading-none mb-1">
                            ${(med.precioFinal || 0).toLocaleString()}
                          </p>
                          <p className="text-[10px] font-mono font-bold tracking-tight text-emerald-600 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 inline-block">
                            MRG: {med.margenAplicado}%
                          </p>
                        </div>
                      ) : (
                        <Badge variant="warning">Pendiente</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Moved Resumen de Cotización (Position 1) */}
          {(order.estado === 'Cotizado' || order.estado === 'Pago Pendiente' || order.estado === 'Pagado' || order.estado === 'En preparación' || order.estado === 'En reparto' || order.estado === 'Entregado') && (isAdmin || isPharma) && (
             <div className="bg-slate-900 rounded-xl p-6 text-white shadow-lg border border-slate-800">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Resumen de Cotización</h3>
                
                <div className="space-y-3 text-sm mb-4 pb-4 border-b border-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Subtotal Medicamentos</span>
                    <span className="font-bold truncate ml-4" title={`$${totals.meds.toLocaleString()}`}>${totals.meds.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Costo Envío</span>
                    <span className="truncate ml-4" title={`$${totals.logistics.toLocaleString()}`}>${totals.logistics.toLocaleString()}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center gap-3">
                    <span className="text-xs leading-none text-slate-400 font-bold uppercase tracking-widest">Total<br/>Final</span>
                    <span className="text-3xl sm:text-4xl font-black text-white tracking-tighter truncate" title={`$${totals.total.toLocaleString()}`}>${totals.total.toLocaleString()}</span>
                </div>
             </div>
          )}

          {/* Payment & Status Action Control Panel (Moved below the large price card) */}
          {(order.estado === 'Cotizado' || order.estado === 'Pago Pendiente' || order.estado === 'Pagado' || order.estado === 'En preparación' || order.estado === 'En reparto' || order.estado === 'Entregado') && isAdmin && (
            <Card className="border-indigo-100 shadow-md">
              <CardHeader className="py-4 bg-indigo-50/50 border-b border-indigo-100 flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-indigo-950 text-xs font-black uppercase tracking-wider">
                  <CreditCard size={18} className="text-indigo-600" />
                  Estado del Pedido & Acciones
                </CardTitle>
                <Badge variant={order.estado === 'Entregado' ? 'success' : order.estado === 'Pago Pendiente' ? 'warning' : 'info'} className="text-[10px] font-bold">
                  {order.estado}
                </Badge>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {order.estado === 'Cotizado' && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-widest flex items-center gap-1.5 justify-center">
                      <DollarSign size={16} className="text-indigo-500" />
                      Confirmación de Pago
                    </h4>
                    {order.costoLogistico === 0 ? (
                      <p className="text-xs text-amber-600 font-semibold bg-amber-50 p-3 rounded-lg border border-amber-200 text-center">
                        ⚠️ Primero debes calcular la ruta y costo de envío abajo para poder generar el vínculo de pago.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 text-center">
                          Los medicamentos ya están cotizados y el costo de envío ha sido calculado. Puedes proceder a generar el vínculo de pago para el paciente.
                        </p>
                        <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider py-3.5 shadow-lg shadow-indigo-900/40 border-none flex items-center justify-center gap-2" onClick={handleChargePatient}>
                          <FileText size={14} /> Confirmar & Generar Vínculo de Pago
                        </Button>
                      </>
                    )}
                  </div>
                )}
                
                {order.estado === 'Pago Pendiente' && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-widest flex items-center gap-1.5 justify-center">
                      <Clock size={16} className="text-amber-500" />
                      Validación de Pago
                    </h4>
                    <div className="bg-amber-500/10 text-amber-600 p-3.5 rounded-lg text-xs font-semibold text-center border border-amber-500/20">
                      Esperando pago del paciente...
                    </div>
                    <Button variant="primary" className="w-full bg-emerald-600 hover:bg-emerald-500 border-none font-bold text-[10px] uppercase tracking-wider py-3.5 shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2" onClick={handleConfirmPayment}>
                      <CheckCircle size={14} /> Impactar Pago (Prueba de Sincronización)
                    </Button>
                  </div>
                )}

                {(order.estado === 'Pagado' || order.estado === 'En preparación' || order.estado === 'En reparto' || order.estado === 'Entregado') && (
                  <div className="text-center space-y-4">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-widest flex items-center gap-1.5 justify-center">
                      <CheckCircle size={16} className="text-emerald-500" />
                      Control de Reparto y Estado
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                      {order.estado === 'Pagado' || order.estado === 'En preparación' ? 'El pago del pedido fue acreditado. Proceder a preparar medicamentos y despachar.' : 
                       order.estado === 'En reparto' ? 'El pedido está en camino a la casa del paciente. Puedes seguir el GPS abajo.' : 
                       'El pedido ha sido entregado exitosamente.'}
                    </p>
                    
                    <div className="bg-emerald-500/10 text-emerald-700 p-3 rounded-lg font-bold text-[10px] uppercase tracking-widest text-center flex items-center justify-center gap-2 border border-emerald-500/20">
                      <CheckCircle size={14} /> Pago Acreditado ({order.metodoPago || 'LINK'})
                    </div>

                    {/* Manual transitions requested by user */}
                    {(order.estado === 'Pagado' || order.estado === 'En preparación') && (
                      <Button 
                        className="w-full mt-2 bg-blue-600 hover:bg-blue-500 border-none font-bold text-[10px] uppercase tracking-wider py-3.5 shadow-md flex items-center justify-center gap-2 text-white"
                        onClick={() => updateOrder(order.id, { estado: 'En reparto' })}
                      >
                        <Truck size={14} /> Despachar / Iniciar Reparto
                      </Button>
                    )}

                    {order.estado === 'En reparto' && (
                      <Button 
                        variant="outline" 
                        className="w-full mt-2 font-bold text-[10px] uppercase tracking-wider py-3.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 border-2 flex items-center justify-center gap-2" 
                        onClick={() => updateOrder(order.id, { estado: 'Entregado' })}
                      >
                        <CheckCircle size={14} /> Marcar como Entregado
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Actions / Logistics */}
        <div className="lg:col-span-2 space-y-6">
          {(order.estado === 'Cotizado' || order.costoLogistico > 0) && isAdmin && (
            <Card className="border-blue-200 shadow-md">
              <CardHeader className="py-4 bg-blue-50/50 border-b border-blue-100 flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-blue-900 text-sm font-bold uppercase tracking-wider">
                  <Map size={18} className="text-blue-600" />
                  Ruteo & Logística Google Maps
                </CardTitle>
                <Badge variant={mapsLoaded ? 'success' : 'warning'} className="text-[9px]">
                  {mapsLoaded ? 'Google API Conectado' : 'Simulador Activado'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                
                {/* Information Callout if API key is missing */}
                {!mapsLoaded && (
                  <div className="bg-amber-50/90 border border-amber-200 text-amber-900 rounded-xl p-3.5 space-y-1.5 text-xs shadow-sm">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      Google Maps en Modo Simulación
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed font-semibold">
                      Para activar el mapa real, el autocompletado y cálculo de distancias por ruta, ingresa tu API Key de Google Maps desde el panel de <span className="text-blue-900 underline font-bold">Configuración</span> en el menú lateral. El simulador seguirá funcionando automáticamente de respaldo.
                    </p>
                  </div>
                )}

                {/* Logistics Configuration inputs */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dirección de Origen</label>
                    <div className="relative">
                      <input
                        type="text"
                        ref={originAutocompleteInputRef as any}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-900"
                        placeholder="Ej: Av. del Libertador 1500, Buenos Aires"
                        value={originAddress}
                        onChange={e => setOriginAddress(e.target.value)}
                        disabled={order.estado !== 'Cotizado'}
                      />
                      {mapsLoaded && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          Auto-complete
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Waypoints List */}
                  {waypoints.map((wp, wpIdx) => (
                    <WaypointInput
                      key={wpIdx}
                      index={wpIdx}
                      value={wp}
                      mapsLoaded={mapsLoaded}
                      disabled={order.estado !== 'Cotizado'}
                      onChange={(newVal) => {
                        const newWps = [...waypoints];
                        newWps[wpIdx] = newVal;
                        setWaypoints(newWps);
                      }}
                      onRemove={order.estado === 'Cotizado' ? () => {
                        const newWps = waypoints.filter((_, i) => i !== wpIdx);
                        setWaypoints(newWps);
                      } : undefined}
                    />
                  ))}

                  {order.estado === 'Cotizado' && waypoints.length < 3 && (
                    <button
                      type="button"
                      className="text-xs font-bold text-blue-600 hover:text-blue-500 flex items-center gap-1 transition-colors mt-1"
                      onClick={() => setWaypoints([...waypoints, ''])}
                    >
                      <span className="text-sm font-semibold">+</span> Agregar Parada Intermedia (Clínica/Farmacia)
                    </button>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dirección de Entrega (Destino)</label>
                    <div className="relative">
                      <input
                        type="text"
                        ref={autocompleteInputRef as any}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-900"
                        placeholder="Ingresa dirección del paciente..."
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        disabled={order.estado !== 'Cotizado'}
                      />
                      {mapsLoaded && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          Auto-complete
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {order.estado === 'Cotizado' && (
                  <Button 
                    variant="primary" 
                    className="w-full text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 border-none py-3.5 text-white shadow-md shadow-blue-200 flex items-center justify-center gap-2" 
                    onClick={calculateLogistics}
                    disabled={calculating}
                  >
                    {calculating ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Calculando Ruta...
                      </>
                    ) : (
                      <>
                        <MapPin size={14} />
                        Calcular Distancia & Costo
                      </>
                    )}
                  </Button>
                )}

                {order.costoLogistico > 0 && (
                  <div className="space-y-4 pt-2">
                    {/* Visual Invoice Details breakdown */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Distancia calculada:</span>
                        <span className="font-bold text-slate-800 font-mono">{distance} km</span>
                      </div>
                      {waypoints.filter(w => w.trim() !== '').length > 0 && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-yellow-600 font-medium font-bold">Paradas intermedias:</span>
                          <span className="font-bold text-slate-800 font-mono">{waypoints.filter(w => w.trim() !== '').length}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Base de Envío fija:</span>
                        <span className="font-bold text-slate-800 font-mono">${baseLogisticsCost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Variable por Kilómetro (${perKmLogisticsCost}/km):</span>
                        <span className="font-bold text-slate-800 font-mono">${(distance * perKmLogisticsCost).toLocaleString()}</span>
                      </div>
                      <div className="border-t border-dashed border-slate-200 pt-2.5 flex justify-between items-center text-sm font-bold">
                        <span className="text-blue-900 uppercase tracking-wider text-[11px]">Total Envío:</span>
                        <span className="text-emerald-600 font-mono text-base">${order.costoLogistico.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Visual map route simulator widget */}
                    {mapsLoaded ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Ruta Interactiva (Google Maps)</span>
                          {directionsError && (
                            <Badge variant="warning" className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] uppercase tracking-wider py-0.5 px-2">
                              Servicio restringido
                            </Badge>
                          )}
                        </div>
                        
                        {directionsError && (
                          <div className="bg-amber-50/95 border border-amber-200 rounded-xl p-4 text-xs space-y-3 shadow-md">
                            <div className="flex items-center gap-1.5 font-bold text-amber-800">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                              <span>Error de Restricción de Google Maps (API Key)</span>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-amber-700 font-semibold">
                              ¡No es peor restringir! De hecho, <span className="text-amber-950 underline">restringir tu clave es la mejor práctica de seguridad</span>. El error ocurre porque dejaste activada la restricción pero deseleccionaste las APIs necesarias (quedando en "No se seleccionó ninguna API").
                            </p>
                            <div className="bg-amber-100/60 p-3 rounded-lg border border-amber-200 text-[11px] text-amber-950 space-y-2">
                              <p className="font-extrabold uppercase tracking-wider text-amber-950">Pasos exactos para arreglarlo:</p>
                              <ol className="list-decimal pl-4 space-y-1.5 font-medium">
                                <li>En la pantalla de tu captura, abre la lista desplegable que dice <span className="font-bold text-red-700">"Elige las restricciones de API"</span>.</li>
                                <li>Busca y marca con un tilde (<span className="font-bold text-emerald-700">✓</span>) estas <span className="font-bold underline text-blue-900">4 APIs clave</span>:
                                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-blue-900 font-bold">
                                    <li>Maps JavaScript API</li>
                                    <li>Directions API</li>
                                    <li>Geocoding API</li>
                                    <li>Places API</li>
                                  </ul>
                                </li>
                                <li>Haz clic en el botón azul <span className="font-bold">"Guardar"</span> de abajo.</li>
                                <li><span className="font-bold text-amber-900">Nota:</span> Google Cloud tarda entre 1 y 5 minutos en propagar los permisos. Una vez guardado, actualiza esta página y verás el mapa y las rutas funcionando perfectamente.</li>
                              </ol>
                            </div>
                          </div>
                        )}

                        <div 
                          ref={mapContainerRef} 
                          className="w-full h-80 rounded-xl bg-slate-100 border border-slate-200 shadow-inner overflow-hidden relative z-0" 
                        />
                        <div className="bg-slate-900 rounded-xl p-4 text-white text-xs space-y-4 border border-slate-800 shadow-lg">
                          <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                            <span>Estado del GPS Satelital</span>
                            {order.driverLat && order.driverLng ? (
                              <span className="flex items-center gap-1.5 text-emerald-400 font-bold animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                GPS EN VIVO ACTIVO
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                                ESPERANDO CONEXIÓN REAL
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-1 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                            <p className="truncate"><span className="text-slate-400">Origen (Farmacia):</span> <span className="text-slate-200 font-semibold">{originAddress}</span></p>
                            {waypoints.filter(w => w.trim() !== '').map((wp, idx) => (
                              <p key={idx} className="truncate"><span className="text-slate-400 font-yellow-600">Parada {idx + 1}:</span> <span className="text-yellow-400 font-semibold">{wp}</span></p>
                            ))}
                            <p className="truncate"><span className="text-slate-400">Destino (Paciente):</span> <span className="text-white font-semibold">{address}</span></p>
                            <div className="border-t border-slate-800/80 my-2 pt-2 flex flex-col gap-1">
                              <p className="text-emerald-400 font-bold uppercase tracking-wide text-[10px] flex justify-between">
                                <span>Ruta Total Estimada:</span>
                                <span>{Math.ceil(distance * 1.3 + 5)} minutos ({distance} km)</span>
                              </p>
                              {order.driverLat && order.driverLng && (
                                <p className="text-blue-300 font-mono text-[10px] flex justify-between">
                                  <span>Último Reporte GPS:</span>
                                  <span>{order.driverLat.toFixed(5)}, {order.driverLng.toFixed(5)} ({order.driverLastUpdated ? new Date(order.driverLastUpdated).toLocaleTimeString() : 'Ahora'})</span>
                                </p>
                              )}
                            </div>

                            {/* Live Delivery Progress Metrics requested by user */}
                            <div className="mt-3 grid grid-cols-3 gap-2 bg-blue-950/55 p-3 rounded-xl border border-blue-900/60 text-center">
                              <div>
                                <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Distancia Restante</span>
                                <span className="text-xs sm:text-sm font-black text-white">{metrics.remainingDistance} km</span>
                              </div>
                              <div className="border-x border-slate-800/80 px-1">
                                <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Tiempo Estimado</span>
                                <span className="text-xs sm:text-sm font-black text-emerald-400">{metrics.remainingTime} min</span>
                              </div>
                              <div>
                                <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Hora de Entrega</span>
                                <span className="text-xs sm:text-sm font-black text-yellow-400">{metrics.eta}</span>
                              </div>
                            </div>
                          </div>

                          {/* Real GPS controls */}
                          <div className="space-y-2.5">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Control de Transmisión Real</span>
                              {isSharingGPS && (
                                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                  Transmitiendo Ubicación...
                                </span>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {isSharingGPS ? (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="flex-1 bg-red-950/40 text-red-300 hover:bg-red-950/60 border-red-800/50 text-[10px] uppercase font-bold py-2.5"
                                  onClick={stopRealGPSTracking}
                                >
                                  Detener GPS Satelital
                                </Button>
                              ) : (
                                <Button 
                                  variant="primary" 
                                  size="sm" 
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 border-none text-[10px] uppercase font-bold py-2.5 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/30"
                                  onClick={startRealGPSTracking}
                                >
                                  <Activity size={12} className="animate-bounce" />
                                  Compartir Mi GPS Real (Móvil/Web)
                                </Button>
                              )}

                              {(order.driverLat !== undefined && order.driverLat !== null || order.driverLng !== undefined && order.driverLng !== null) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700 text-[10px] uppercase font-bold px-3 py-2.5"
                                  onClick={() => {
                                    updateOrder(order.id, {
                                      driverLat: null,
                                      driverLng: null,
                                      driverLastUpdated: null
                                    });
                                  }}
                                >
                                  Reset
                                </Button>
                              )}
                            </div>

                            <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-2.5 text-[10.5px] text-blue-300 flex items-start gap-2">
                              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold uppercase text-blue-200">Modo de Demostración Real:</span> puedes hacer click en cualquier parte del mapa para posicionar o mover el vehículo de reparto instantáneamente en la base de datos de Firebase, viéndose en tiempo real en todos los dispositivos conectados.
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Visualización del Recorrido (Simulador)</span>
                        <div className="h-80 bg-slate-950 rounded-xl overflow-hidden relative border border-slate-800 flex flex-col justify-between p-5 text-white shadow-inner">
                          {/* Grid network graphic representation */}
                          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                          
                          {/* Graphic route connection path */}
                          <svg className="absolute inset-0 w-full h-full p-8" viewBox="0 0 100 100" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="50%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#10b981" />
                              </linearGradient>
                            </defs>
                            {/* Curved Path */}
                            <path 
                              d="M 15 85 C 30 70, 50 50, 85 15" 
                              fill="none" 
                              stroke="url(#routeGrad)" 
                              strokeWidth="3.5" 
                              strokeLinecap="round"
                              strokeDasharray="4 4"
                              className="animate-[dash_10s_linear_infinite]"
                            />
                            {/* Origin beacon */}
                            <circle cx="15" cy="85" r="5" fill="#3b82f6" className="animate-ping opacity-75" />
                            <circle cx="15" cy="85" r="3" fill="#3b82f6" />
                            
                            {/* Waypoints */}
                            {waypoints.filter(w => w.trim() !== '').map((_, index) => (
                              <React.Fragment key={index}>
                                <circle cx={30 + index * 20} cy={70 - index * 20} r="5" fill="#eab308" className="animate-ping opacity-75" />
                                <circle cx={30 + index * 20} cy={70 - index * 20} r="3" fill="#eab308" />
                              </React.Fragment>
                            ))}

                            {/* Destination beacon */}
                            <circle cx="85" cy="15" r="7" fill="#10b981" className="animate-ping opacity-75" />
                            <circle cx="85" cy="15" r="4.5" fill="#10b981" />
                          </svg>

                          <div className="relative z-10 flex justify-between items-start">
                            <Badge variant="info" className="bg-blue-500/15 text-blue-300 border border-blue-500/20 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5">
                              Modo Simulación
                            </Badge>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Simulador de Despacho</span>
                          </div>

                          <div className="relative z-10 bg-slate-900/90 backdrop-blur-md p-4 rounded-lg border border-slate-800 space-y-1.5 shadow-lg">
                            <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                              Origen (Farmacia)
                            </div>
                            <p className="text-xs font-medium text-slate-200 truncate pl-3">{originAddress}</p>
                            
                            {waypoints.filter(w => w.trim() !== '').map((wp, idx) => (
                              <React.Fragment key={idx}>
                                <div className="flex items-center gap-1.5 text-[10px] text-yellow-400 font-bold uppercase tracking-wider mt-1">
                                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span>
                                  Parada {idx + 1}
                                </div>
                                <p className="text-xs font-medium text-slate-200 truncate pl-3">{wp}</p>
                              </React.Fragment>
                            ))}
                            
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-1">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                              Entrega (Destino)
                            </div>
                            <p className="text-xs font-medium text-slate-200 truncate pl-3">{address}</p>

                            <div className="border-t border-slate-800/80 pt-2 mt-2 flex justify-between items-center">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Demora Estimada:</span>
                              <span className="text-emerald-400 font-extrabold text-xs bg-emerald-950/80 border border-emerald-900 px-2 py-0.5 rounded">
                                {Math.ceil(distance * 1.3 + 5)} min ({distance} km)
                              </span>
                            </div>

                            {/* Live Delivery Progress Metrics in Simulation mode */}
                            <div className="mt-3 grid grid-cols-3 gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-center text-white">
                              <div>
                                <span className="block text-[7.5px] uppercase font-bold text-slate-500">Km Restantes</span>
                                <span className="text-xs font-black text-slate-200">{metrics.remainingDistance} km</span>
                              </div>
                              <div className="border-x border-slate-800/80 px-1">
                                <span className="block text-[7.5px] uppercase font-bold text-slate-500">Demora Restante</span>
                                <span className="text-xs font-black text-emerald-400">{metrics.remainingTime} min</span>
                              </div>
                              <div>
                                <span className="block text-[7.5px] uppercase font-bold text-slate-500">Hora Entrega</span>
                                <span className="text-xs font-black text-yellow-400">{metrics.eta}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}


        </div>
      </div>
    </div>
  );
}
