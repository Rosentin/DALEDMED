import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { Bot, X, Send, Minimize2, Maximize2, Loader2 } from 'lucide-react';
import { cn } from '../utils';
import Markdown from 'react-markdown';

export default function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: 'Hola, soy **DALED AI**. ¿En qué puedo ayudarte con la administración o consultas de pedidos?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentUser, orders, users, patients, margins } = useAppStore();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isExpanded]);

  const hasAccess = currentUser?.permissions?.includes('dashboard') || currentUser?.permissions?.includes('config');
  if (!hasAccess) return null;

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      // Build context from store
      const systemContext = `
        Eres DALED AI, un asistente virtual con acceso total administrativo (Modo Administración) a la plataforma DALEDMED (Grupo Dáled).
        Tu objetivo es ayudar a los administradores a hacer consultas sobre pedidos, pacientes, usuarios, rentabilidad y configuración del sistema.
        Responde siempre en español, de forma profesional y concisa. Si te piden datos, analízalos y muéstralos claramente (puedes usar Markdown para tablas o listas).
        
        A continuación, te proporciono el estado COMPLETO del sistema en tiempo real en formato JSON:
        
        PEDIDOS:
        ${JSON.stringify(orders, null, 2)}
        
        PACIENTES:
        ${JSON.stringify(patients, null, 2)}
        
        USUARIOS:
        ${JSON.stringify(users, null, 2)}
        
        MÁRGENES DE GANANCIA:
        ${JSON.stringify(margins, null, 2)}
        
        Básate ESTRICTAMENTE en esta información para responder sus dudas. Si el administrador pregunta cuántos pedidos hay, cuéntalos en el JSON provisto. 
        Evita listar todos los datos si no es necesario, solo da la respuesta directa a menos que te pidan un detalle.
      `;

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: userMsg,
          systemInstruction: systemContext
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Ocurrió un error al procesar tu consulta. Intenta nuevamente.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-transform z-50 group border border-slate-700"
      >
        <Bot size={24} className="group-hover:text-blue-400 transition-colors" />
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-slate-900"></span>
        </span>
      </button>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-6 right-6 bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-slate-200 transition-all duration-300 ease-in-out",
      isExpanded ? "w-[800px] h-[80vh] max-h-[800px]" : "w-[400px] h-[600px] max-h-[80vh]"
    )}>
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 rounded-t-2xl flex justify-between items-center shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm">DALED AI</h3>
            <p className="text-[10px] text-blue-400 uppercase tracking-widest font-mono">Modo Administración</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:text-white hover:bg-slate-800 rounded transition-colors">
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-2 hover:text-red-400 hover:bg-slate-800 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
              msg.role === 'user' 
                ? "bg-slate-900 text-white rounded-br-none" 
                : "bg-white border border-slate-200 text-slate-700 rounded-bl-none"
            )}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-100 prose-pre:text-slate-800">
                  <Markdown>{msg.content}</Markdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-4 shadow-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-blue-600" />
              <span className="text-xs text-slate-500 font-medium tracking-wide">Procesando consulta...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100 rounded-b-2xl shrink-0">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="relative flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta sobre ganancias, envíos, pacientes, usuarios..."
            className="flex-1 max-h-32 min-h-[44px] resize-none border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
            rows={input.split('\\n').length > 1 ? Math.min(input.split('\\n').length, 4) : 1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="h-[44px] w-[44px] shrink-0 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-md shadow-blue-500/20"
          >
            <Send size={18} className={cn(input.trim() ? "translate-x-0.5" : "")} />
          </button>
        </form>
        <p className="text-[10px] text-center text-slate-400 mt-2 tracking-wide">
          DALED AI tiene acceso a todos los datos administradores de la plataforma.
        </p>
      </div>
    </div>
  );
}
