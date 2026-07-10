import express from 'express';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { setGlobalDispatcher, Agent } from 'undici';

// Set global dispatcher to prevent fetch / undici Headers Timeout (30s) during heavy/slow AI requests
setGlobalDispatcher(new Agent({
  headersTimeout: 300000, // 5 minutes
  bodyTimeout: 300000,    // 5 minutes
  connectTimeout: 60000,   // 1 minute
}));

const upload = multer({ dest: 'uploads/' });

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage = 'Timeout'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

function detectMimeType(buffer: Buffer, originalName: string, reportedMimeType: string): string {
  // If the reported mime type is a standard image/pdf, trust it
  if (reportedMimeType && 
      reportedMimeType !== 'application/octet-stream' && 
      reportedMimeType !== 'application/x-download' &&
      reportedMimeType !== 'binary/octet-stream') {
    return reportedMimeType;
  }

  // Check magic numbers
  if (buffer.length >= 4) {
    // PDF: %PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    // PNG: \x89PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png';
    }
  }
  if (buffer.length >= 3) {
    // JPEG: \xFF\xD8\xFF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
  }
  if (buffer.length >= 12) {
    // WebP: RIFFxxxxWEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp';
    }
  }

  // Fallback to extension check
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic') return 'image/heic';
  if (ext === '.heif') return 'image/heif';

  return 'image/jpeg'; // Final default fallback
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini Setup - Lazy Initialization to prevent module load issues
  let aiInstance: GoogleGenAI | null = null;
  const getAi = (): GoogleGenAI | null => {
    if (!aiInstance && process.env.GEMINI_API_KEY) {
      aiInstance = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return aiInstance;
  };

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/config', async (req, res) => {
    let googleMapsApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    
    // If not found in env, fetch it dynamically from Firestore config/main
    if (!googleMapsApiKey) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        let projectId = 'remixed-project-id';
        let databaseId = '(default)';
        if (fs.existsSync(configPath)) {
          try {
            const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            projectId = configJson.projectId || projectId;
            databaseId = configJson.firestoreDatabaseId || databaseId;
          } catch (e) {
            console.error('Error reading firebase-applet-config.json:', e);
          }
        }

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/config/main`;
        const response = await fetch(firestoreUrl, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          const doc = await response.json();
          if (doc.fields && doc.fields.googleMapsApiKey && doc.fields.googleMapsApiKey.stringValue) {
            googleMapsApiKey = doc.fields.googleMapsApiKey.stringValue;
          }
        }
      } catch (err) {
        console.error('Error fetching config from Firestore:', err);
      }
    }

    res.json({
      googleMapsApiKey
    });
  });

  app.post('/api/assistant', async (req, res) => {
    try {
      const ai = getAi();
      if (!ai) {
        return res.status(500).json({ error: 'Gemini API not configured' });
      }

      const { prompt, systemInstruction } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'No prompt provided' });
      }

      const modelsToTry = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let response;
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        let attempts = 2;
        while (attempts > 0) {
          try {
            console.log(`Assistant API attempting with model: ${modelName} (Attempts left: ${attempts})`);
            const generatePromise = ai.models.generateContent({
              model: modelName,
              contents: [
                { role: 'user', parts: [{ text: prompt }] }
              ],
              config: {
                systemInstruction: systemInstruction ? {
                   role: 'system',
                   parts: [{ text: systemInstruction }]
                } : undefined,
              }
            });
            response = await withTimeout(generatePromise, 30000, 'MODEL_TIMEOUT');
            break; // success
          } catch (err: any) {
            console.warn(`Assistant API failed with ${modelName}:`, err);
            lastError = err;

            const isRetryable = err?.status === 503 || 
                                err?.status === 429 || 
                                err?.message === 'MODEL_TIMEOUT' ||
                                String(err?.message || "").includes("UNAVAILABLE") ||
                                String(err?.message || "").includes("RESOURCE_EXHAUSTED") ||
                                String(err?.message || "").includes("experiencing high demand") ||
                                String(err?.message || "").includes("quota") ||
                                String(err?.message || "").includes("Timeout") ||
                                String(err?.message || "").includes("TIMEOUT");

            if (isRetryable && attempts > 1) {
              attempts--;
              console.log(`Gemini model ${modelName} returned temporary error. Retrying in 1.5s...`);
              await new Promise(r => setTimeout(r, 1500));
            } else {
              break; // Proceed to next model
            }
          }
        }
        if (response) {
          break; // success
        }
      }

      if (!response) {
        throw lastError || new Error('No models were able to process the assistant request');
      }

      const text = response.text || "";
      res.json({ text });
    } catch (error: any) {
      console.error('Error in assistant API:', error);
      res.status(500).json({ 
        error: error.message || 'Unknown generation error' 
      });
    }
  });

  app.post('/api/extract-prescription', upload.single('prescription'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const ai = getAi();
      if (!ai) {
        return res.status(500).json({ error: 'Gemini API not configured' });
      }

      // Detect mime type
      const fileData = fs.readFileSync(req.file.path);
      const mimeType = detectMimeType(fileData, req.file.originalname, req.file.mimetype);
      const prompt = `
        Analiza esta receta médica y extrae la siguiente información en formato JSON estrictamente:
        - nombrePaciente (string o null si no figura)
        - dni (string o null)
        - obraSocial (string o null)
        - numeroAfiliado (string o null)
        - medicoPrescriptor (string o null)
        - matricula (string o null)
        - fecha (string o null)
        - medicamentos: un arreglo de objetos. IMPORTANTE: Entiende cuando la receta tiene el nombre comercial y además la droga genérica para el mismo medicamento de modo de NO extraerlo duplicado como si fuesen 2 medicamentos separados. Consolídalos en un unico registro donde el 'nombre' sea la Droga Genérica y la presentacion/marca sea el nombre comercial. Valida u orientate utilizando el vademecum nacional de Argentina. Cada objeto debe tener:
           - nombre (string, droga genérica)
           - presentacion (string o null, incluye nombre comercial y forma farmacéutica si lo dice)
           - dosis (string o null)
           - cantidad (string o null, extrae el número de unidades, Ej si dice "1 (uno)" extrae solo "1")
        - diagnostico (string o null)
        
        Solo devuelve JSON, ninguna otra respuesta.
      `;

      const modelsToTry = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let response;
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        let attempts = 2;
        while (attempts > 0) {
          try {
            console.log(`Attempting prescription extraction with model: ${modelName} (Attempts left: ${attempts})`);
            const generatePromise = ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: prompt },
                    { inlineData: { mimeType: mimeType, data: fileData.toString('base64') } }
                  ]
                }
              ],
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    nombrePaciente: { type: Type.STRING, description: 'Nombre y apellido del paciente completo' },
                    dni: { type: Type.STRING, description: 'Documento Nacional de Identidad del paciente' },
                    obraSocial: { type: Type.STRING, description: 'Obra social o prepaga del paciente' },
                    numeroAfiliado: { type: Type.STRING, description: 'Número de afiliado a la obra social' },
                    medicoPrescriptor: { type: Type.STRING, description: 'Nombre completo del médico que prescribe' },
                    matricula: { type: Type.STRING, description: 'Matrícula profesional del médico' },
                    fecha: { type: Type.STRING, description: 'Fecha de la prescripción' },
                    diagnostico: { type: Type.STRING, description: 'Diagnóstico médico si figura' },
                    medicamentos: {
                      type: Type.ARRAY,
                      description: 'Lista de medicamentos recetados',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          nombre: { type: Type.STRING, description: 'Droga genérica o principio activo principal' },
                          presentacion: { type: Type.STRING, description: 'Nombre comercial, marca y/o forma farmacéutica' },
                          dosis: { type: Type.STRING, description: 'Concentración o dosis indicada (ej: 500mg)' },
                          cantidad: { type: Type.STRING, description: 'Número de unidades o cajas indicadas (ej: 1, 2)' }
                        },
                        required: ['nombre']
                      }
                    }
                  }
                }
              }
            });
            response = await withTimeout(generatePromise, 45000, 'MODEL_TIMEOUT');
            break; // success
          } catch (genErr: any) {
            console.warn(`Prescription extraction failed with ${modelName}:`, genErr);
            lastError = genErr;

            const isRetryable = genErr?.status === 503 || 
                                genErr?.status === 429 || 
                                genErr?.message === 'MODEL_TIMEOUT' ||
                                String(genErr?.message || "").includes("UNAVAILABLE") ||
                                String(genErr?.message || "").includes("RESOURCE_EXHAUSTED") ||
                                String(genErr?.message || "").includes("experiencing high demand") ||
                                String(genErr?.message || "").includes("quota") ||
                                String(genErr?.message || "").includes("Timeout") ||
                                String(genErr?.message || "").includes("TIMEOUT");

            if (isRetryable && attempts > 1) {
              attempts--;
              console.log(`Prescription extraction model ${modelName} returned temporary error. Retrying in 1.5s...`);
              await new Promise(r => setTimeout(r, 1500));
            } else {
              break; // Proceed to next model
            }
          }
        }
        if (response) {
          break; // success
        }
      }

      if (!response) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        throw lastError || new Error('No models were able to process the prescription');
      }

      // Cleanup temp file if success
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      let jsonText = response.text || "{}";
      
      // Remove Markdown formatting if Gemini included it despite responseMimeType
      jsonText = jsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      
      let extractedData = {};
      try {
        extractedData = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('Failed to parse Gemini output:', jsonText);
        throw new Error('El formato devuelto por la IA fue inválido');
      }
      
      res.json(extractedData);
    } catch (error: any) {
      console.error('Error extracting prescription:', error);
      res.status(500).json({ error: error.message || 'Error processing prescription' });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
