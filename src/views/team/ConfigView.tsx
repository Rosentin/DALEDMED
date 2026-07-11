import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function ConfigView() {
  const { 
    margins, 
    baseLogisticsCost, 
    perKmLogisticsCost, 
    googleMapsApiKey, 
    mercadoPagoAccessToken,
    bankName,
    bankCbu,
    bankAlias,
    bankTitular,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    smtpSendTo,
    updateConfig 
  } = useAppStore();
  
  const [localMargins, setLocalMargins] = useState(margins);
  const [localBase, setLocalBase] = useState(baseLogisticsCost.toString());
  const [localPerKm, setLocalPerKm] = useState(perKmLogisticsCost.toString());
  const [localGoogleMapsApiKey, setLocalGoogleMapsApiKey] = useState(googleMapsApiKey || '');
  const [localMpAccessToken, setLocalMpAccessToken] = useState(mercadoPagoAccessToken || '');
  const [localBankName, setLocalBankName] = useState(bankName || '');
  const [localBankCbu, setLocalBankCbu] = useState(bankCbu || '');
  const [localBankAlias, setLocalBankAlias] = useState(bankAlias || '');
  const [localBankTitular, setLocalBankTitular] = useState(bankTitular || '');
  
  const [localSmtpHost, setLocalSmtpHost] = useState(smtpHost || '');
  const [localSmtpPort, setLocalSmtpPort] = useState(smtpPort || '');
  const [localSmtpSecure, setLocalSmtpSecure] = useState(smtpSecure || false);
  const [localSmtpUser, setLocalSmtpUser] = useState(smtpUser || '');
  const [localSmtpPass, setLocalSmtpPass] = useState(smtpPass || '');
  const [localSmtpSendTo, setLocalSmtpSendTo] = useState(smtpSendTo || '');

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (googleMapsApiKey !== undefined) {
      setLocalGoogleMapsApiKey(googleMapsApiKey);
    }
  }, [googleMapsApiKey]);

  useEffect(() => {
    if (mercadoPagoAccessToken !== undefined) setLocalMpAccessToken(mercadoPagoAccessToken);
    if (bankName !== undefined) setLocalBankName(bankName);
    if (bankCbu !== undefined) setLocalBankCbu(bankCbu);
    if (bankAlias !== undefined) setLocalBankAlias(bankAlias);
    if (bankTitular !== undefined) setLocalBankTitular(bankTitular);
    
    if (smtpHost !== undefined) setLocalSmtpHost(smtpHost);
    if (smtpPort !== undefined) setLocalSmtpPort(smtpPort);
    if (smtpSecure !== undefined) setLocalSmtpSecure(smtpSecure);
    if (smtpUser !== undefined) setLocalSmtpUser(smtpUser);
    if (smtpPass !== undefined) setLocalSmtpPass(smtpPass);
    if (smtpSendTo !== undefined) setLocalSmtpSendTo(smtpSendTo);
  }, [mercadoPagoAccessToken, bankName, bankCbu, bankAlias, bankTitular, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpSendTo]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig('margins', localMargins);
    updateConfig('baseLogisticsCost', Number(localBase));
    updateConfig('perKmLogisticsCost', Number(localPerKm));
    updateConfig('googleMapsApiKey', localGoogleMapsApiKey.trim());
    updateConfig('mercadoPagoAccessToken', localMpAccessToken.trim());
    updateConfig('bankName', localBankName.trim());
    updateConfig('bankCbu', localBankCbu.trim());
    updateConfig('bankAlias', localBankAlias.trim());
    updateConfig('bankTitular', localBankTitular.trim());
    
    updateConfig('smtpHost', localSmtpHost.trim());
    updateConfig('smtpPort', localSmtpPort.trim());
    updateConfig('smtpSecure', localSmtpSecure);
    updateConfig('smtpUser', localSmtpUser.trim());
    updateConfig('smtpPass', localSmtpPass.trim());
    updateConfig('smtpSendTo', localSmtpSendTo.trim());
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

        <Card>
          <CardHeader>
            <CardTitle>Mercado Pago - Integración de Pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input 
              label="AccessToken de Mercado Pago (Credencial de Producción)" 
              type="password"
              placeholder="Ej: APP_USR-..."
              value={localMpAccessToken}
              onChange={e => setLocalMpAccessToken(e.target.value)}
            />
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Ingresa tu Access Token de producción obtenido desde el panel de desarrolladores de Mercado Pago. Esto permitirá generar <b>Links de pago reales</b> y <b>QRs interoperables</b> con el monto exacto del pedido de tus pacientes. Si se deja en blanco, el sistema operará en modo simulación de alta fidelidad.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos para Transferencia Bancaria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="Nombre del Banco" 
                type="text"
                placeholder="Ej: Banco Galicia"
                value={localBankName}
                onChange={e => setLocalBankName(e.target.value)}
              />
              <Input 
                label="Titular de la Cuenta" 
                type="text"
                placeholder="Ej: DALEDMED S.A.S."
                value={localBankTitular}
                onChange={e => setLocalBankTitular(e.target.value)}
              />
              <Input 
                label="CBU o CVU" 
                type="text"
                placeholder="22 dígitos..."
                value={localBankCbu}
                onChange={e => setLocalBankCbu(e.target.value)}
              />
              <Input 
                label="Alias Bancario" 
                type="text"
                placeholder="Ej: daledmed.salud"
                value={localBankAlias}
                onChange={e => setLocalBankAlias(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Estos datos bancarios se le mostrarán al operador para que los copie, o al paciente cuando se genere el resumen con la opción de transferencia, facilitando el copiado rápido de CBU/Alias.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Servidor de Correo (SMTP Gmail) - Envíos de Comprobante</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Input 
                  label="Host SMTP" 
                  type="text"
                  placeholder="Ej: smtp.gmail.com"
                  value={localSmtpHost}
                  onChange={e => setLocalSmtpHost(e.target.value)}
                />
              </div>
              <div>
                <Input 
                  label="Puerto SMTP" 
                  type="text"
                  placeholder="Ej: 465 o 587"
                  value={localSmtpPort}
                  onChange={e => setLocalSmtpPort(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="Usuario SMTP (Email emisor)" 
                type="email"
                placeholder="Ej: tu-app@gmail.com"
                value={localSmtpUser}
                onChange={e => setLocalSmtpUser(e.target.value)}
              />
              <Input 
                label="Contraseña de Aplicación de Gmail" 
                type="password"
                placeholder="16 caracteres sin espacios..."
                value={localSmtpPass}
                onChange={e => setLocalSmtpPass(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pt-2">
              <div className="flex items-center gap-3">
                <input 
                  id="smtpSecure"
                  type="checkbox"
                  checked={localSmtpSecure}
                  onChange={e => setLocalSmtpSecure(e.target.checked)}
                  className="w-4.5 h-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="smtpSecure" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  Conexión segura SSL/TLS (Normalmente puerto 465)
                </label>
              </div>

              <Input 
                label="Email de administración (Copia de respaldo)" 
                type="email"
                placeholder="Ej: administracion@daledmed.com"
                value={localSmtpSendTo}
                onChange={e => setLocalSmtpSendTo(e.target.value)}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 space-y-1">
              <h6 className="text-blue-800 text-xs font-bold flex items-center gap-1">
                ℹ️ ¿CÓMO CONFIGURAR CON GMAIL?
              </h6>
              <p className="text-blue-700 text-[11px] leading-normal">
                Para que Gmail te permita enviar correos desde la aplicación, debes tener la <b>Verificación en dos pasos</b> habilitada en tu cuenta de Google. Luego, ve a tu panel de seguridad de Google y genera una <b>&quot;Contraseña de Aplicación&quot;</b> específica. Ingresa ese código de 16 letras aquí. El host estándar es <code>smtp.gmail.com</code> y el puerto recomendado es <code>465</code> con SSL/TLS activado.
              </p>
            </div>
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
