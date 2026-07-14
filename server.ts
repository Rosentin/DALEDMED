import express from 'express';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { setGlobalDispatcher, Agent } from 'undici';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

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
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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
        - qrString (string o null): decodifica o extrae la URL exacta u original detrás del código QR presente en la receta digital (suele estar abajo, en la esquina o al lado de "Ver Link"). No la modifiques ni cambies sus mayúsculas/minúsculas.
        - recetaLink (string o null): extrae el enlace, URL completa o dirección web detrás del texto/hipervínculo "Ver Link" presente en la receta. No lo modifiques en absoluto, mantén las mayúsculas/minúsculas originales.
        
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
                    qrString: { type: Type.STRING, description: 'URL o texto exacto y original del código QR de la receta' },
                    recetaLink: { type: Type.STRING, description: 'URL exacta y original del hipervínculo Ver Link' },
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

      let permanentFilename = '';
      if (req.file) {
        try {
          const originalExt = path.extname(req.file.originalname) || '.png';
          permanentFilename = `receta-${Date.now()}-${Math.floor(Math.random() * 10000)}${originalExt}`;
          const permanentPath = path.join(process.cwd(), 'uploads', permanentFilename);
          
          const uploadsDir = path.join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }

          fs.copyFileSync(req.file.path, permanentPath);
        } catch (copyErr) {
          console.error('Failed to copy uploaded prescription permanently:', copyErr);
        }
      }

      // Cleanup temp file if success
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      let jsonText = response.text || "{}";
      
      // Remove Markdown formatting if Gemini included it despite responseMimeType
      jsonText = jsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      
      let extractedData: any = {};
      try {
        extractedData = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('Failed to parse Gemini output:', jsonText);
        throw new Error('El formato devuelto por la IA fue inválido');
      }
      
      if (permanentFilename) {
        extractedData.recetaUrl = `/uploads/${permanentFilename}`;
      }
      
      const uppercaseStrings = (obj: any, keyName?: string): any => {
        if (keyName === 'qrString' || keyName === 'recetaLink' || keyName === 'verLink' || keyName === 'recetaUrl') {
          return obj;
        }
        if (typeof obj === 'string') {
          return obj.toUpperCase();
        }
        if (Array.isArray(obj)) {
          return obj.map(item => uppercaseStrings(item, keyName));
        }
        if (obj && typeof obj === 'object') {
          const res: any = {};
          for (const key of Object.keys(obj)) {
            res[key] = uppercaseStrings(obj[key], key);
          }
          return res;
        }
        return obj;
      };

      extractedData = uppercaseStrings(extractedData);
      
      res.json(extractedData);
    } catch (error: any) {
      console.error('Error extracting prescription:', error);
      res.status(500).json({ error: error.message || 'Error processing prescription' });
    }
  });


  app.post('/api/mercadopago/preference', async (req, res) => {
    try {
      const { orderId, totalAmount, returnUrl } = req.body;
      if (!orderId || !totalAmount) {
        return res.status(400).json({ error: 'Faltan datos requeridos (orderId o totalAmount).' });
      }

      // Fetch Mercado Pago Access Token from Firestore config/main
      let mpAccessToken = '';
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        let projectId = 'remixed-project-id';
        let databaseId = '(default)';
        if (fs.existsSync(configPath)) {
          const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          projectId = configJson.projectId || projectId;
          databaseId = configJson.firestoreDatabaseId || databaseId;
        }

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/config/main`;
        const configResponse = await fetch(firestoreUrl);
        if (configResponse.ok) {
          const doc = await configResponse.json();
          if (doc.fields && doc.fields.mercadoPagoAccessToken && doc.fields.mercadoPagoAccessToken.stringValue) {
            mpAccessToken = doc.fields.mercadoPagoAccessToken.stringValue;
          }
        }
      } catch (err) {
        console.error('Error fetching MP config from Firestore:', err);
      }

      if (mpAccessToken) {
        console.log(`Creating real Mercado Pago preference for Order #${orderId}, Amount: $${totalAmount}`);
        const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mpAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            items: [
              {
                id: orderId,
                title: `Pedido #${orderId} - DALEDMED`,
                quantity: 1,
                currency_id: 'ARS',
                unit_price: Number(totalAmount)
              }
            ],
            back_urls: {
              success: returnUrl,
              pending: returnUrl,
              failure: returnUrl
            },
            auto_return: 'approved',
            external_reference: orderId,
            statement_descriptor: 'DALEDMED'
          })
        });

        if (mpResponse.ok) {
          const preference = await mpResponse.json();
          console.log('Real Mercado Pago preference created successfully:', preference.id);
          return res.json({
            isReal: true,
            initPoint: preference.init_point,
            sandboxInitPoint: preference.sandbox_init_point,
            preferenceId: preference.id
          });
        } else {
          const errorData = await mpResponse.json();
          console.error('Error calling Mercado Pago API:', errorData);
          return res.json({
            isReal: false,
            initPoint: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=mock_${orderId}_${Math.floor(Math.random()*1000000)}`,
            message: 'Error de API Mercado Pago, fallback a enlace simulado de alta fidelidad.',
            errorDetails: errorData
          });
        }
      } else {
        console.log(`No Mercado Pago Access Token configured. Simulating preference for Order #${orderId}`);
        const simulatedUrl = `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=sim_${orderId}_${Math.floor(Math.random()*1000000)}`;
        return res.json({
          isReal: false,
          initPoint: simulatedUrl,
          message: 'Modo simulación (Sin Access Token)'
        });
      }
    } catch (err: any) {
      console.error('Error in /api/mercadopago/preference:', err);
      res.status(500).json({ error: err?.message || 'Error del servidor al crear preferencia.' });
    }
  });


  app.post('/api/modo/preference', async (req, res) => {
    try {
      const { orderId, totalAmount, returnUrl } = req.body;
      if (!orderId || !totalAmount) {
        return res.status(400).json({ error: 'Faltan datos requeridos (orderId o totalAmount).' });
      }

      // Fetch MODO credentials from Firestore config/main
      let modoToken = '';
      let modoMerchantId = '';
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        let projectId = 'remixed-project-id';
        let databaseId = '(default)';
        if (fs.existsSync(configPath)) {
          const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          projectId = configJson.projectId || projectId;
          databaseId = configJson.firestoreDatabaseId || databaseId;
        }

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/config/main`;
        const configResponse = await fetch(firestoreUrl);
        if (configResponse.ok) {
          const doc = await configResponse.json();
          if (doc.fields) {
            if (doc.fields.modoToken && doc.fields.modoToken.stringValue) {
              modoToken = doc.fields.modoToken.stringValue;
            }
            if (doc.fields.modoMerchantId && doc.fields.modoMerchantId.stringValue) {
              modoMerchantId = doc.fields.modoMerchantId.stringValue;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching MODO config from Firestore:', err);
      }

      if (modoToken && modoMerchantId) {
        console.log(`Creating real MODO preference for Order #${orderId}, Amount: $${totalAmount}`);
        
        // Call MODO's official checkout API
        const modoResponse = await fetch('https://api.modo.com.ar/b2b-intermediaries/v1/payment-intent', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${modoToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: Number(totalAmount),
            storeId: modoMerchantId,
            externalId: orderId,
            description: `Pedido #${orderId} - DALEDMED`,
            callbackUrl: returnUrl,
            title: "DALEDMED"
          })
        });

        if (modoResponse.ok) {
          const intentData = await modoResponse.json();
          console.log('Real MODO intent created successfully:', intentData);
          return res.json({
            isReal: true,
            initPoint: intentData.checkoutUrl || intentData.deeplink || `https://ecommerce.modo.com.ar/checkout/${intentData.id}`,
            qrString: intentData.qrString || intentData.deeplink || `modo://payment?token=${intentData.id || orderId}`,
            message: 'Intento de pago MODO creado con éxito.'
          });
        } else {
          const errorData = await modoResponse.json().catch(() => null);
          console.error('Error calling MODO API:', errorData);
          
          // High-fidelity fallback with simulated token
          const mockIntentId = `intent_${orderId}_${Math.floor(Math.random()*1000000)}`;
          const mockDeepLink = `modo://payment?token=${mockIntentId}`;
          const mockCheckoutUrl = `https://play.modo.com.ar/detect-app?token=${mockIntentId}`;
          
          return res.json({
            isReal: false,
            initPoint: mockCheckoutUrl,
            qrString: mockDeepLink,
            message: 'Error de API MODO. Fallback a simulación de alta fidelidad.',
            errorDetails: errorData
          });
        }
      } else {
        console.log(`No MODO credentials configured. Simulating preference for Order #${orderId}`);
        const mockIntentId = `sim_modo_${orderId}_${Math.floor(Math.random()*1000000)}`;
        const mockDeepLink = `modo://payment?token=${mockIntentId}`;
        const mockCheckoutUrl = `https://play.modo.com.ar/detect-app?token=${mockIntentId}`;
        
        return res.json({
          isReal: false,
          initPoint: mockCheckoutUrl,
          qrString: mockDeepLink,
          message: 'Modo simulación (Sin credenciales de MODO)'
        });
      }
    } catch (err: any) {
      console.error('Error in /api/modo/preference:', err);
      res.status(500).json({ error: err?.message || 'Error del servidor al crear preferencia de MODO.' });
    }
  });


  // --- PDF RECEIPT AND SMTP EMAIL INTEGRATION ---

  function parseFirestoreFields(fields: any): any {
    if (!fields) return {};
    const obj: any = {};
    for (const key of Object.keys(fields)) {
      const val = fields[key];
      if (!val) continue;
      if ('stringValue' in val) {
        obj[key] = val.stringValue;
      } else if ('integerValue' in val) {
        obj[key] = parseInt(val.integerValue, 10);
      } else if ('doubleValue' in val) {
        obj[key] = parseFloat(val.doubleValue);
      } else if ('booleanValue' in val) {
        obj[key] = val.booleanValue;
      } else if ('arrayValue' in val) {
        const arr = val.arrayValue.values || [];
        obj[key] = arr.map((item: any) => {
          if (item && 'mapValue' in item && item.mapValue) {
            return parseFirestoreFields(item.mapValue.fields);
          } else if (item && 'stringValue' in item) {
            return item.stringValue;
          } else if (item && 'integerValue' in item) {
            return parseInt(item.integerValue, 10);
          } else if (item && 'doubleValue' in item) {
            return parseFloat(item.doubleValue);
          } else if (item && 'booleanValue' in item) {
            return item.booleanValue;
          }
          return item;
        });
      } else if ('mapValue' in val && val.mapValue) {
        obj[key] = parseFirestoreFields(val.mapValue.fields);
      } else if ('nullValue' in val) {
        obj[key] = null;
      }
    }
    return obj;
  }

  async function getFirestoreDocument(collectionName: string, docId: string): Promise<any> {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      let projectId = 'remixed-project-id';
      let databaseId = '(default)';
      if (fs.existsSync(configPath)) {
        const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        projectId = configJson.projectId || projectId;
        databaseId = configJson.firestoreDatabaseId || databaseId;
      }

      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionName}/${docId}`;
      const response = await fetch(firestoreUrl);
      if (response.ok) {
        const doc = await response.json();
        return doc;
      }
    } catch (err) {
      console.error(`Error fetching doc ${collectionName}/${docId} from Firestore:`, err);
    }
    return null;
  }

  async function fetchAndParseFirestoreDoc(collectionName: string, docId: string): Promise<any> {
    const rawDoc = await getFirestoreDocument(collectionName, docId);
    if (!rawDoc || !rawDoc.fields) return null;
    return {
      id: docId,
      ...parseFirestoreFields(rawDoc.fields)
    };
  }

  function generateReceiptPdf(order: any, patient: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const primaryColor = '#0f172a'; // slate-900
        const secondaryColor = '#475569'; // slate-600
        const lightBg = '#f8fafc'; // slate-50
        const borderColor = '#e2e8f0'; // slate-200

        // Title Header
        doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text('DALEDMED', 40, 40);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(secondaryColor).text('COMPROBANTE DE PAGO Y RESUMEN', 40, 62);

        // Top line
        doc.moveTo(40, 75).lineTo(555, 75).strokeColor(borderColor).lineWidth(1).stroke();

        // Order and TX Details
        const txId = order.idTransaccion || order.preferenceId || `TX-${order.id}-${Math.floor(Date.now() / 1000)}`;
        doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text(`ID Pedido: ${order.id}`, 40, 90);
        doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text(`ID Transacción: ${txId}`, 280, 90);

        const dateStr = order.fecha ? new Date(order.fecha).toLocaleString('es-AR') : new Date().toLocaleString('es-AR');
        doc.fillColor(secondaryColor).fontSize(8.5).font('Helvetica').text(`Fecha de Pago: ${dateStr}`, 40, 105);

        // Separator
        doc.moveTo(40, 120).lineTo(555, 120).strokeColor(borderColor).stroke();

        // Patient block
        doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('Detalles del Paciente', 40, 135);
        
        const patName = patient ? patient.name : (order.pacienteNombre || 'No especificado');
        const patDni = patient ? patient.dni : 'No especificado';
        const patPhone = patient ? patient.phone : 'No especificado';
        const patAddress = order.direccionEntrega || (patient ? patient.address : 'No especificado');
        const patObraSocial = order.obraSocial || (patient ? patient.obraSocial : 'No especificado');

        doc.rect(40, 150, 515, 60).fill(lightBg);
        doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold');
        doc.text('Paciente:', 50, 160).font('Helvetica').text(patName, 110, 160);
        doc.font('Helvetica-Bold').text('DNI:', 50, 175).font('Helvetica').text(patDni, 110, 175);
        doc.font('Helvetica-Bold').text('Celular:', 50, 190).font('Helvetica').text(patPhone, 110, 190);

        doc.font('Helvetica-Bold').text('Obra Social:', 280, 160).font('Helvetica').text(patObraSocial, 350, 160);
        doc.font('Helvetica-Bold').text('Dirección:', 280, 175).font('Helvetica').text(patAddress, 350, 175);

        // Table
        doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('Medicamentos y Productos Adquiridos', 40, 230);

        let currentY = 248;
        doc.rect(40, currentY, 515, 18).fill(primaryColor);
        doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
        doc.text('Producto / Presentación', 50, currentY + 5);
        doc.text('Cant.', 370, currentY + 5);
        doc.text('Precio Unit.', 420, currentY + 5);
        doc.text('Subtotal', 490, currentY + 5);

        currentY += 18;

        const meds = order.medicamentos || [];
        const addProducts = order.productosAdicionales || [];
        const allItems = [...meds, ...addProducts];

        doc.fillColor(primaryColor).font('Helvetica');
        let itemIndex = 0;
        
        for (const item of allItems) {
          if (itemIndex % 2 === 0) {
            doc.rect(40, currentY, 515, 20).fill('#fafafa');
            doc.fillColor(primaryColor);
          }
          
          const nameText = item.nombre || item.nombreMedicamento || 'Medicamento';
          const presentation = item.presentacion ? ` (${item.presentacion})` : '';
          const desc = `${nameText}${presentation}`;
          const qty = item.cantidad || 1;
          const price = item.precioFinal || item.precioParticular || 0;
          const subtotal = qty * price;

          doc.text(desc, 50, currentY + 5, { width: 310, height: 11, ellipsis: true });
          doc.text(qty.toString(), 370, currentY + 5);
          doc.text(`$${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, 420, currentY + 5);
          doc.text(`$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, 490, currentY + 5);

          currentY += 20;
          itemIndex++;
        }

        doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(borderColor).stroke();
        currentY += 10;

        const logisticsCost = order.costoLogistico || 0;
        const subtotalOrder = allItems.reduce((acc: number, item: any) => {
          const qty = item.cantidad || 1;
          const price = item.precioFinal || item.precioParticular || 0;
          return acc + (qty * price);
        }, 0);
        const grandTotal = subtotalOrder + logisticsCost;

        doc.fillColor(secondaryColor).fontSize(9).font('Helvetica');
        doc.text('Subtotal Productos:', 340, currentY);
        doc.fillColor(primaryColor).font('Helvetica-Bold').text(`$${subtotalOrder.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, 460, currentY, { align: 'right', width: 90 });
        currentY += 14;

        doc.fillColor(secondaryColor).font('Helvetica').text('Costo de Envío:', 340, currentY);
        doc.fillColor(primaryColor).font('Helvetica-Bold').text(`$${logisticsCost.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, 460, currentY, { align: 'right', width: 90 });
        currentY += 14;

        doc.moveTo(340, currentY).lineTo(555, currentY).strokeColor(primaryColor).lineWidth(1).stroke();
        currentY += 6;

        doc.fillColor(primaryColor).fontSize(10.5).font('Helvetica-Bold').text('TOTAL ABONADO:', 340, currentY);
        doc.fontSize(11).text(`$${grandTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, 460, currentY, { align: 'right', width: 90 });
        currentY += 35;

        doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor(borderColor).lineWidth(1).stroke();
        currentY += 12;

        doc.fillColor(secondaryColor).fontSize(10).font('Helvetica-Bold').text(
          'Este documento es un comprobante y resumen de lo pagado',
          40,
          currentY,
          { align: 'center', width: 515 }
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  async function sendReceiptEmail(order: any, patient: any, pdfBuffer: Buffer, config: any): Promise<boolean> {
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
      console.warn('SMTP parameters are missing from configuration. Cannot send receipt email.');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: parseInt(config.smtpPort, 10) || 465,
      secure: config.smtpSecure ?? true,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      }
    });

    const patName = patient ? patient.name : (order.pacienteNombre || 'Paciente');
    const patEmail = patient?.email || order.pacienteEmail || '';
    
    const recipients = [];
    if (patEmail) recipients.push(patEmail);
    if (config.smtpSendTo) recipients.push(config.smtpSendTo);

    if (recipients.length === 0) {
      console.warn('No email recipient specified for receipt email. SMTP Config has no admin copy and patient has no email.');
      return false;
    }

    const subtotalOrder = (order.medicamentos || []).reduce((acc: number, item: any) => acc + ((item.cantidad || 1) * (item.precioFinal || item.precioParticular || 0)), 0) + (order.productosAdicionales || []).reduce((acc: number, item: any) => acc + ((item.cantidad || 1) * (item.precioFinal || item.precioParticular || 0)), 0);
    const grandTotal = subtotalOrder + (order.costoLogistico || 0);

    const mailOptions = {
      from: `"DALEDMED" <${config.smtpUser}>`,
      to: recipients.join(', '),
      subject: `Confirmación de Pago y Resumen de tu Pedido #${order.id} - DALEDMED`,
      text: `¡Hola ${patName}!\n\nEsperamos que te encuentres muy bien.\n\nQueremos agradecerte por confiar en nosotros para la gestión de tus medicamentos. Tu salud y tranquilidad son nuestra prioridad.\n\nAdjuntamos a este correo el comprobante de pago y el resumen correspondiente a tu pedido #${order.id}.\n\nResumen del Pedido:\n- ID de Pedido: #${order.id}\n- Total Abonado: $${grandTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n- Método de Pago: ${order.metodoPago || 'Mercado Pago'}\n\nEn caso de tener algún problema con tu entrega, comunícate al: 2615097974\n\n¿Por qué los pacientes nos vuelven a elegir?\n1. Envíos rápidos a domicilio: Llevamos tu medicación directamente a tu puerta, con todo el cuidado que corresponde.\n2. Cero burocracia con tus recetas: Nos encargamos de validar tus recetas de forma digital con tu cobertura o prepaga.\n3. Tratamientos continuos sin interrupciones: Te recordamos cuándo renovar tu receta para que nunca te quedes sin tu dosis.\n\n¿Necesitás realizar un nuevo pedido o renovar tu receta?\nRespondé directamente a este correo o comunícate al: 2615097974. ¡Estamos para acompañarte!\n\nAtentamente,\nEl equipo de DALEDMED`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 30px 25px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 1px;">DALEDMED</h1>
            <p style="color: #38bdf8; margin: 6px 0 0 0; font-size: 13px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Cuidamos tu salud, estés donde estés</p>
          </div>
          
          <div style="padding: 30px 25px;">
            <!-- Greeting -->
            <p style="font-size: 16px; line-height: 1.6; color: #0f172a; margin-top: 0;">
              ¡Hola <strong>${patName}</strong>! Esperamos que estés muy bien.
            </p>
            <p style="font-size: 14.5px; line-height: 1.6; color: #475569;">
              Queremos agradecerte profundamente por confiar en nosotros para la gestión de tus medicamentos. Tu tranquilidad y bienestar son nuestro motor diario.
            </p>
            
            <p style="font-size: 14.5px; line-height: 1.6; color: #475569;">
              Confirmamos que hemos procesado con éxito tu pago y tu pedido ya está en marcha. Adjunto a este correo vas a encontrar el comprobante en formato PDF para tu control.
            </p>

            <!-- Error or Delivery issues alert -->
            <p style="font-size: 14px; line-height: 1.6; color: #dc2626; margin-top: 15px; padding: 10px 15px; background-color: #fef2f2; border-left: 4px solid #f87171; border-radius: 4px;">
              <strong>¿Algún inconveniente?</strong> En caso de tener algún problema con tu entrega, comunícate de inmediato al: <strong>2615097974</strong>.
            </p>

            <!-- Order Box -->
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
              <h3 style="margin: 0 0 12px 0; font-size: 13px; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; font-weight: 700;">Resumen del Pedido</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b;">ID de Pedido:</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 600;">#${order.id}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b;">Monto Abonado:</td>
                  <td style="padding: 6px 0; font-size: 15px; color: #16a34a; text-align: right; font-weight: 700;">$${grandTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b;">Método de Pago:</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 600;">${order.metodoPago || 'Mercado Pago'}</td>
                </tr>
              </table>
            </div>

            <!-- Why Choose Us / Loyalty section -->
            <div style="border-top: 1px solid #f1f5f9; padding-top: 25px; margin-top: 25px;">
              <h4 style="margin: 0 0 18px 0; font-size: 13px; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">¿Por qué los pacientes nos recomiendan?</h4>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                <tr>
                  <td style="width: 40px; vertical-align: top; font-size: 22px; padding-top: 2px; text-align: center;">🚀</td>
                  <td style="vertical-align: top; padding-left: 12px;">
                    <h5 style="margin: 0 0 4px 0; font-size: 14px; color: #1e293b; font-weight: 600;">Envíos directos y seguros</h5>
                    <p style="margin: 0; font-size: 12.5px; color: #64748b; line-height: 1.5;">Llevamos tu medicación directamente a tu domicilio, con los máximos estándares de cuidado y seguridad en el transporte.</p>
                  </td>
                </tr>
              </table>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                <tr>
                  <td style="width: 40px; vertical-align: top; font-size: 22px; padding-top: 2px; text-align: center;">📄</td>
                  <td style="vertical-align: top; padding-left: 12px;">
                    <h5 style="margin: 0 0 4px 0; font-size: 14px; color: #1e293b; font-weight: 600;">Cero burocracia con tus recetas</h5>
                    <p style="margin: 0; font-size: 12.5px; color: #64748b; line-height: 1.5;">Nosotros nos encargamos de validar tus recetas de forma digital con tu cobertura o prepaga, ahorrándote tiempo y trámites.</p>
                  </td>
                </tr>
              </table>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="width: 40px; vertical-align: top; font-size: 22px; padding-top: 2px; text-align: center;">🔔</td>
                  <td style="vertical-align: top; padding-left: 12px;">
                    <h5 style="margin: 0 0 4px 0; font-size: 14px; color: #1e293b; font-weight: 600;">Tratamientos continuos</h5>
                    <p style="margin: 0; font-size: 12.5px; color: #64748b; line-height: 1.5;">Para que nunca interrumpas tu dosis, nos agendamos la fecha de tu próxima renovación de recetas y te lo recordamos con anticipación.</p>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Call to Action / Help -->
            <div style="text-align: center; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 30px 0 10px 0;">
              <p style="margin: 0 0 6px 0; font-size: 14px; color: #166534; font-weight: 700;">¿Necesitás renovar tu medicación o hacer un nuevo pedido?</p>
              <p style="margin: 0; font-size: 13px; color: #14532d; line-height: 1.5;">
                Simplemente respondé a este correo o comunícate al: <strong>2615097974</strong>. ¡Estamos acá para ayudarte!
              </p>
            </div>

            <!-- Footer Closing -->
            <p style="font-size: 13.5px; color: #64748b; margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">
              Atentamente,<br>
              <strong style="color: #0f172a; font-size: 14.5px;">El equipo de DALEDMED</strong>
            </p>
          </div>
          
          <!-- Bottom Accent -->
          <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">Este correo electrónico contiene información de su pedido. Por favor, no lo comparta.</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `comprobante_pedido_${order.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Receipt email sent successfully:', info.messageId);
      return true;
    } catch (err) {
      console.error('Error sending SMTP receipt email:', err);
      return false;
    }
  }

  // API to Download Receipt PDF
  app.get('/api/receipt/pdf/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const order = await fetchAndParseFirestoreDoc('orders', orderId);
      if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
      }

      const patientId = order.pacienteId;
      let patient = null;
      if (patientId) {
        patient = await fetchAndParseFirestoreDoc('patients', patientId);
      }

      const pdfBuffer = await generateReceiptPdf(order, patient);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=comprobante_pedido_${orderId}.pdf`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error('Error serving receipt PDF:', err);
      res.status(500).json({ error: err?.message || 'Error al generar el comprobante PDF' });
    }
  });

  // API to Email Receipt PDF
  app.post('/api/receipt/send-email/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { recipientEmail } = req.body; // optional override

      const order = await fetchAndParseFirestoreDoc('orders', orderId);
      if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
      }

      const patientId = order.pacienteId;
      let patient = null;
      if (patientId) {
        patient = await fetchAndParseFirestoreDoc('patients', patientId);
      }

      // If user passed a specific recipientEmail, override patient's email
      if (recipientEmail && patient) {
        patient.email = recipientEmail;
      } else if (recipientEmail) {
        patient = { name: order.pacienteNombre || 'Paciente', email: recipientEmail };
      }

      const config = await fetchAndParseFirestoreDoc('config', 'main');
      if (!config || !config.smtpHost || !config.smtpUser) {
        return res.status(400).json({ error: 'El servidor de correo SMTP no está configurado en el sistema.' });
      }

      const pdfBuffer = await generateReceiptPdf(order, patient);
      const success = await sendReceiptEmail(order, patient, pdfBuffer, config);

      if (success) {
        res.json({ success: true, message: 'Comprobante enviado exitosamente por correo.' });
      } else {
        res.status(500).json({ error: 'No se pudo enviar el correo. Verifique la configuración SMTP.' });
      }
    } catch (err: any) {
      console.error('Error sending receipt email:', err);
      res.status(500).json({ error: err?.message || 'Error al enviar el comprobante por correo.' });
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
