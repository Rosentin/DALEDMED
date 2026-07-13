import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Shield } from 'lucide-react';

interface SecurityCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionLabel?: string;
}

export function SecurityCodeModal({ isOpen, onClose, onConfirm, actionLabel = "Proceder" }: SecurityCodeModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code === '0000') {
      setCode('');
      setError(false);
      onConfirm();
    } else {
      setError(true);
      setCode('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 flex flex-col text-slate-700 text-left animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Shield size={20} />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-slate-900 tracking-tight">Acción Protegida</h4>
            <p className="text-xs text-slate-500">Ingrese el código de seguridad para continuar.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="password"
              placeholder="••••"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(false);
              }}
              className="text-center font-mono text-xl tracking-widest h-11"
              maxLength={10}
              autoFocus
              required
            />
            {error && (
              <p className="text-xs text-red-600 font-semibold mt-2 text-center animate-shake">
                Código de seguridad incorrecto. Intente de nuevo.
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCode('');
                setError(false);
                onClose();
              }}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold"
            >
              {actionLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
