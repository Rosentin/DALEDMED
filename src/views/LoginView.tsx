import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Stethoscope } from 'lucide-react';
import { motion } from 'motion/react';

export default function LoginView() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const login = useAppStore(state => state.login);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(code)) {
      navigate('/');
    } else {
      setError('Código de acceso inválido');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-600/5 rounded-full blur-[100px]"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-slate-800/20 rounded-full blur-[100px]"></div>
      </div>
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-900/40">
            <span className="text-3xl font-bold">D</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-2">DALED<span className="text-blue-400">MED</span></h1>
          <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-1">Grupo Dáled Platform</p>
        </div>
        
        <Card className="bg-white/5 backdrop-blur-md border-slate-700 p-8 shadow-2xl shadow-slate-900/50 text-white">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-slate-400">Inicio de Operaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Código de Autorización</label>
                <input
                  type="password"
                  placeholder="PIN"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError('');
                  }}
                  autoFocus
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-center text-2xl font-mono text-white tracking-[0.5em] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                {error && <span className="text-[10px] text-red-400 font-bold uppercase mt-2 block text-center">{error}</span>}
              </div>
              
              <Button type="submit" className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white py-4 shadow-lg shadow-blue-600/20 border-none" size="lg">
                Autenticar
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
