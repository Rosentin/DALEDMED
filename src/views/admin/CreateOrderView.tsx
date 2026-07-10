import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Upload, Loader2, Plus, Trash2 } from 'lucide-react';
import { MedicationRequest } from '../../types';

export default function CreateOrderView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  
  const createOrder = useAppStore(state => state.createOrder);
  const navigate = useNavigate();

  // Form State
  const [pacienteId, setPacienteId] = useState('');
  const [dni, setDni] = useState('');
  const [obraSocial, setObraSocial] = useState('');
  const [numeroAfiliado, setNumeroAfiliado] = useState('');
  const [medico, setMedico] = useState('');
  const [matriculaMedico, setMatriculaMedico] = useState('');
  const [token, setToken] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [medicamentos, setMedicamentos] = useState<MedicationRequest[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
  };

  const extractPrescription = async () => {
    if (!file) return;
    
    setIsExtracting(true);
    
    try {
      let compressedFile = file;
      if (file.type.startsWith('image/')) {
        const compressedBlob = await new Promise<Blob | null>((resolve) => {
          const img = new Image();
          const objUrl = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(objUrl);
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 900;
            const MAX_HEIGHT = 900;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round((width * MAX_HEIGHT) / height);
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.65);
          };
          img.onerror = () => resolve(null);
          img.src = objUrl;
        });
        if (compressedBlob) {
          compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' });
        }
      }

      const formData = new FormData();
      formData.append('prescription', compressedFile);
      
      const res = await fetch('/api/extract-prescription', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.nombrePaciente) setPacienteId(data.nombrePaciente);
          if (data.dni) setDni(data.dni);
          if (data.obraSocial) setObraSocial(data.obraSocial);
          if (data.numeroAfiliado) setNumeroAfiliado(data.numeroAfiliado);
          if (data.medicoPrescriptor) setMedico(data.medicoPrescriptor);
          if (data.matricula) setMatriculaMedico(data.matricula);
          if (data.diagnostico) setDiagnostico(data.diagnostico);
          
          if (data.medicamentos && Array.isArray(data.medicamentos)) {
            setMedicamentos(data.medicamentos.map((m: any) => {
              // Extract only numbers from the cantidad string (e.g., "1 (uno)" -> "1")
              const cantNum = String(m.cantidad || '1').replace(/\D/g, '');
              
              return {
                id: Math.random().toString(),
                nombre: m.nombre,
                presentacion: m.presentacion || '',
                dosis: m.dosis || '',
                cantidad: cantNum || '1'
              };
            }));
          }
        } else {
          try {
             await res.text(); // consume body
          } catch(e) {}
          alert('Error de formato en la respuesta. El servidor no devolvió datos estructurados.');
        }
      } else {
        const errorData = await res.json().catch(() => null);
        const errMsg = errorData?.error || 'Error desconocido del servidor';
        alert(`Error al analizar la receta: ${errMsg}\nPor favor indique los datos manualmente.`);
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al extraer receta.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (medicamentos.length === 0) {
      alert("Debe agregar al menos un medicamento");
      return;
    }
    
    const newOrder = createOrder({
      pacienteId,
      pacienteNombre: pacienteId,
      dni,
      numeroAfiliado,
      obraSocial,
      medico,
      matriculaMedico,
      token,
      medicamentos,
      diagnostico,
      estado: 'Revisión Farmacéutica'
    });
    
    navigate(`/orders/${newOrder.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Nuevo Pedido DALEDMED</h2>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Carga de receta asistida por IA</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>1. Cargar Receta</CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 bg-slate-100 hover:bg-slate-200 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors text-center overflow-hidden h-48 relative"
              >
                {file && file.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-contain p-2" />
                ) : (
                  <div className="p-8 flex flex-col items-center justify-center">
                    <Upload className="text-slate-500 mb-2" size={32} />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mt-2">
                      Subir PDF o Imagen
                    </p>
                    <p className="text-xs text-slate-500 mt-1 truncate max-w-[200px]">
                      {file ? file.name : 'Click para examinar'}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="mt-4 flex justify-center">
                <Button 
                  onClick={extractPrescription} 
                  disabled={!file || isExtracting}
                  className="w-full font-bold uppercase tracking-wider text-xs"
                >
                  {isExtracting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} /> Leyendo Receta...
                    </span>
                  ) : (
                    'Leer Receta'
                  )}
                </Button>
              </div>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf,image/*"
                onChange={handleFileSelect}
              />
            </CardContent>
          </Card>
        </div>

        <div className="col-span-1 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>2. Validación de Datos</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Paciente (Nombre)" value={pacienteId} onChange={e => setPacienteId(e.target.value)} required />
                  <Input label="DNI" value={dni} onChange={e => setDni(e.target.value)} />
                  <Input label="Obra Social" value={obraSocial} onChange={e => setObraSocial(e.target.value)} required />
                  <Input label="N° Afiliado" value={numeroAfiliado} onChange={e => setNumeroAfiliado(e.target.value)} />
                  <Input label="Médico" value={medico} onChange={e => setMedico(e.target.value)} />
                  <Input label="Matrícula" value={matriculaMedico} onChange={e => setMatriculaMedico(e.target.value)} />
                  <Input label="Token (Dictado)" value={token} onChange={e => setToken(e.target.value)} required />
                  <Input label="Diagnóstico" value={diagnostico} onChange={e => setDiagnostico(e.target.value)} />
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Medicamentos Extraídos</h4>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setMedicamentos([...medicamentos, { id: Math.random().toString(), nombre: '', cantidad: '1', presentacion: '', dosis: '' }])}
                    >
                      <Plus size={14} className="mr-1" /> Módulo Manual
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {medicamentos.length === 0 && (
                      <div className="text-[10px] uppercase font-bold text-slate-400 py-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        No hay medicamentos cargados.
                      </div>
                    )}
                    {medicamentos.map((m, index) => (
                      <div key={m.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <div className="flex-1">
                          <Input 
                            placeholder="Nombre Ej: Ibupirac" 
                            value={m.nombre} 
                            onChange={e => {
                              const newM = [...medicamentos];
                              newM[index].nombre = e.target.value;
                              setMedicamentos(newM);
                            }}
                            required
                          />
                        </div>
                        <div className="w-1/3">
                          <Input 
                            placeholder="Presentación"
                            value={m.presentacion}
                            onChange={e => {
                              const newM = [...medicamentos];
                              newM[index].presentacion = e.target.value;
                              setMedicamentos(newM);
                            }}
                          />
                        </div>
                        <div className="w-24">
                          <Input 
                            placeholder="Cant."
                            type="number"
                            min="1"
                            value={m.cantidad}
                            onChange={e => {
                              const newM = [...medicamentos];
                              newM[index].cantidad = e.target.value;
                              setMedicamentos(newM);
                            }}
                            required
                          />
                        </div>
                        <Button 
                          type="button" 
                          variant="danger"
                          className="px-2"
                          onClick={() => setMedicamentos(medicamentos.filter((_, i) => i !== index))}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => navigate('/orders')}>Cancelar</Button>
                  <Button type="submit">Generar Pedido & Enviar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
