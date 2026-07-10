import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function ConfigView() {
  const { margins, baseLogisticsCost, perKmLogisticsCost, googleMapsApiKey, updateConfig } = useAppStore();
  
  const [localMargins, setLocalMargins] = useState(margins);
  const [localBase, setLocalBase] = useState(baseLogisticsCost.toString());
  const [localPerKm, setLocalPerKm] = useState(perKmLogisticsCost.toString());
  const [localGoogleMapsApiKey, setLocalGoogleMapsApiKey] = useState(googleMapsApiKey || '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (googleMapsApiKey !== undefined) {
      setLocalGoogleMapsApiKey(googleMapsApiKey);
    }
  }, [googleMapsApiKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig('margins', localMargins);
    updateConfig('baseLogisticsCost', Number(localBase));
    updateConfig('perKmLogisticsCost', Number(localPerKm));
    updateConfig('googleMapsApiKey', localGoogleMapsApiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Márgenes y Costos</h2>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Configuración global del sistema</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Márgenes de Rentabilidad (%)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.keys(localMargins).map(key => (
                <div key={key}>
                  <Input 
                    label={`Margen: ${key}`} 
                    type="number"
                    min="0"
                    step="0.1"
                    value={localMargins[key]}
                    onChange={e => setLocalMargins({...localMargins, [key]: Number(e.target.value)})}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Estos márgenes se aplican automáticamente sobre el costo informado por farmacia al momento de cotizar.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logística y Envíos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="Costo Base ($)" 
                type="number"
                min="0"
                value={localBase}
                onChange={e => setLocalBase(e.target.value)}
              />
              <Input 
                label="Costo por Km adicional ($)" 
                type="number"
                min="0"
                value={localPerKm}
                onChange={e => setLocalPerKm(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google Maps & Integración GPS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              label="Clave de API de Google Maps (API Key)" 
              type="text"
              placeholder="Ej: AIzaSy..."
              value={localGoogleMapsApiKey}
              onChange={e => setLocalGoogleMapsApiKey(e.target.value)}
            />
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Esta clave se utiliza para cargar el mapa interactivo, calcular distancias exactas de entrega por ruta y autocompletar las direcciones de los pacientes en tiempo real. 
              <br />
              <span className="text-amber-600 font-bold">Importante:</span> Asegúrate de tener habilitadas las siguientes APIs en tu cuenta de Google Cloud Console: 
              <span className="font-bold underline ml-1">Maps JavaScript API, Directions API, Geocoding API y Places API</span>.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end items-center gap-4">
          {saved && <span className="text-sm font-bold text-emerald-600 uppercase tracking-widest">¡Guardado Exitosamente!</span>}
          <Button type="submit" size="lg">Guardar Configuración</Button>
        </div>
      </form>
    </div>
  );
}
