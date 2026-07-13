import { create } from 'zustand';
import { User, Order, Patient, Role } from './types';
import { db, auth } from './lib/firebase';
import { collection, doc, setDoc, updateDoc, onSnapshot, query, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  // Log lightly without stringifying full objects continuously
  console.warn(`Firestore Error [${operationType}] at ${path}: ${errMsg}`);
}

const generateOrderId = (fullName: string, dni: string, locality: string): string => {
  const cleanName = (fullName || '').trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let firstLetterName = 'X';
  let firstLetterSurname = 'X';

  if (cleanName) {
    if (cleanName.includes(',')) {
      const parts = cleanName.split(',');
      const surnamePart = parts[0].trim();
      const namePart = parts[1].trim();
      if (namePart) firstLetterName = namePart.charAt(0);
      if (surnamePart) firstLetterSurname = surnamePart.charAt(0);
    } else {
      const parts = cleanName.split(/\s+/);
      if (parts.length >= 2) {
        firstLetterName = parts[0].charAt(0);
        firstLetterSurname = parts[parts.length - 1].charAt(0);
      } else if (parts.length === 1 && parts[0]) {
        firstLetterName = parts[0].charAt(0);
        firstLetterSurname = parts[0].length > 1 ? parts[0].charAt(1) : 'X';
      }
    }
  }

  // Last 3 digits of DNI
  const cleanDni = (dni || '').trim().replace(/\D/g, '');
  let last3Dni = '000';
  if (cleanDni.length >= 3) {
    last3Dni = cleanDni.slice(-3);
  } else if (cleanDni.length > 0) {
    last3Dni = cleanDni.padStart(3, '0');
  }

  // 2 letters of locality
  const cleanLocality = (locality || 'Mendoza').trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let locality2 = 'ME'; // default Mendoza
  
  if (cleanLocality.includes('GODOY CRUZ')) {
    locality2 = 'GC';
  } else if (cleanLocality.includes('GUAYMALLEN')) {
    locality2 = 'GY';
  } else if (cleanLocality.includes('LAS HERAS')) {
    locality2 = 'LH';
  } else if (cleanLocality.includes('LUJAN DE CUYO')) {
    locality2 = 'LC';
  } else if (cleanLocality.includes('MAIPU')) {
    locality2 = 'MA';
  } else if (cleanLocality.includes('SAN MARTIN')) {
    locality2 = 'SM';
  } else if (cleanLocality.includes('SAN RAFAEL')) {
    locality2 = 'SR';
  } else if (cleanLocality.includes('RIVADAVIA')) {
    locality2 = 'RI';
  } else if (cleanLocality.includes('JUNIN')) {
    locality2 = 'JU';
  } else if (cleanLocality.includes('SANTA ROSA')) {
    locality2 = 'ST';
  } else if (cleanLocality.includes('LA PAZ')) {
    locality2 = 'LP';
  } else if (cleanLocality.includes('LAVALLE')) {
    locality2 = 'LV';
  } else if (cleanLocality.includes('TUNUYAN')) {
    locality2 = 'TY';
  } else if (cleanLocality.includes('TUPUNGATO')) {
    locality2 = 'TG';
  } else if (cleanLocality.includes('SAN CARLOS')) {
    locality2 = 'SC';
  } else if (cleanLocality.includes('GENERAL ALVEAR')) {
    locality2 = 'GA';
  } else if (cleanLocality.includes('MALARGUE')) {
    locality2 = 'ML';
  } else if (cleanLocality.includes('CAPITAL') || cleanLocality === 'MENDOZA') {
    locality2 = 'MZ';
  } else {
    // Fallback if not specifically matched
    if (cleanLocality.length >= 2) {
      locality2 = cleanLocality.substring(0, 2);
    } else if (cleanLocality.length === 1) {
      locality2 = cleanLocality + 'X';
    }
  }

  return `${firstLetterName}${firstLetterSurname}${last3Dni}${locality2}`;
};

interface AppState {
  currentUser: User | null;
  users: User[];
  orders: Order[];
  patients: Patient[];
  
  // Config
  margins: Record<string, number>;
  baseLogisticsCost: number;
  perKmLogisticsCost: number;
  googleMapsApiKey?: string;
  mercadoPagoAccessToken?: string;
  bankName?: string;
  bankCbu?: string;
  bankAlias?: string;
  bankTitular?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpSendTo?: string;
  
  // Internal setters for sync
  setUsers: (users: User[]) => void;
  setOrders: (orders: Order[]) => void;
  setPatients: (patients: Patient[]) => void;
  setConfig: (config: any) => void;

  // Actions
  login: (code: string) => boolean;
  logout: () => void;
  createOrder: (order: Partial<Order>) => Order;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  addPatient: (patient: Patient) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  updateConfig: (key: string, value: any) => void;
  deleteOrder: (id: string) => void;
  renameOrderLocalityAndId: (id: string, newLocality: string) => Promise<string>;
}

export const ALL_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard General' },
  { id: 'orders', label: 'Recepción (Nuevas Recetas)' },
  { id: 'queue', label: 'Farmacia (Validación y Cotización)' },
  { id: 'users', label: 'Usuarios y Permisos' },
  { id: 'config', label: 'Configuración y Márgenes' },
];

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: (() => {
    try {
      const saved = localStorage.getItem('daledmed_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),
  users: [],
  orders: [],
  patients: [],
  
  margins: {
    'Medicamentos': 20,
    'Perfumeria': 35,
    'Venta Libre': 25,
  },
  baseLogisticsCost: 1500,
  perKmLogisticsCost: 200,
  googleMapsApiKey: '',
  mercadoPagoAccessToken: '',
  bankName: '',
  bankCbu: '',
  bankAlias: '',
  bankTitular: '',
  smtpHost: '',
  smtpPort: '',
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  smtpSendTo: '',

  setUsers: (users) => set({ users }),
  setOrders: (orders) => set({ orders }),
  setPatients: (patients) => set({ patients }),
  setConfig: (config) => set((state) => ({ ...state, ...config })),

  login: (code: string) => {
    let user = get().users.find(u => u.code === code);
    if (!user) {
      const mockUsers: User[] = [
        { id: '1', role: 'team', name: 'Team Admin', code: '1250', permissions: ['dashboard', 'orders', 'queue', 'users', 'config'] },
        { id: '2', role: 'pharma', name: 'Pharma User', code: '1251', permissions: ['dashboard', 'orders', 'queue', 'users', 'config'] },
        { id: '3', role: 'admin', name: 'Recepción', code: '1252', permissions: ['dashboard', 'orders', 'queue', 'users', 'config'] },
        { id: 'maipumed', role: 'maipumed', name: 'maipumed', code: '1930', permissions: ['dashboard'] }
      ];
      user = mockUsers.find(u => u.code === code);
    }
    if (user) {
      set({ currentUser: user });
      try {
        localStorage.setItem('daledmed_user', JSON.stringify(user));
      } catch (e) {
        console.error(e);
      }
      return true;
    }
    return false;
  },

  logout: () => {
    set({ currentUser: null });
    try {
      localStorage.removeItem('daledmed_user');
    } catch (e) {
      console.error(e);
    }
  },

  createOrder: (orderData) => {
    const id = generateOrderId(
      orderData.pacienteNombre || orderData.pacienteId || '',
      orderData.dni || '',
      orderData.localidad || 'Mendoza'
    );
    const newOrder: Order = {
      id,
      fecha: new Date().toISOString(),
      estado: 'Nuevo',
      estadoPago: 'Pendiente',
      medicamentos: [],
      productosAdicionales: [],
      costoLogistico: 0,
      distanciaKm: 0,
      direccionEntrega: '',
      creadoPor: get().currentUser?.id || 'sys',
      historialCambios: [{
        timestamp: new Date().toISOString(),
        userId: get().currentUser?.id || 'sys',
        action: 'Created',
        details: 'Pedido creado',
      }],
      pacienteId: orderData.pacienteId || '',
      obraSocial: orderData.obraSocial || '',
      medico: orderData.medico || '',
      token: orderData.token || null,
      ...orderData
    } as Order;

    setDoc(doc(db, 'orders', id), newOrder).catch(e => handleFirestoreError(e, OperationType.WRITE, 'orders/' + id));
    return newOrder;
  },

  updateOrder: (id, updates) => {
    const state = get();
    const idx = state.orders.findIndex(o => o.id === id);
    if (idx === -1) return;
    
    const oldOrder = state.orders[idx];
    const historialCambios = [
      ...oldOrder.historialCambios,
      {
        timestamp: new Date().toISOString(),
        userId: state.currentUser?.id || 'sys',
        action: 'Updated fields',
        details: Object.keys(updates).join(', ')
      }
    ];

    updateDoc(doc(db, 'orders', id), { ...updates, historialCambios }).catch(e => handleFirestoreError(e, OperationType.UPDATE, 'orders/' + id));
  },
  
  addPatient: (patient) => {
    setDoc(doc(db, 'patients', patient.id), patient).catch(e => handleFirestoreError(e, OperationType.WRITE, 'patients/' + patient.id));
  },

  updateUser: (id, updates) => {
    updateDoc(doc(db, 'users', id), updates).catch(e => handleFirestoreError(e, OperationType.UPDATE, 'users/' + id));
  },
  
  updateConfig: (key, value) => {
    updateDoc(doc(db, 'config', 'main'), { [key]: value }).catch(e => handleFirestoreError(e, OperationType.UPDATE, 'config/main'));
  },
  
  deleteOrder: (id) => {
    deleteDoc(doc(db, 'orders', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, 'orders/' + id));
  },

  renameOrderLocalityAndId: async (id, newLocality) => {
    const state = get();
    const orderIndex = state.orders.findIndex(o => o.id === id);
    if (orderIndex === -1) return id;

    const order = state.orders[orderIndex];
    // Generate new ID based on existing name, DNI and new locality
    const newId = generateOrderId(
      order.pacienteNombre || order.pacienteId || '',
      order.dni || '',
      newLocality
    );

    if (newId === id) {
      // If the ID is the same, just update the locality field
      await updateDoc(doc(db, 'orders', id), { localidad: newLocality });
      return id;
    }

    const newOrder = {
      ...order,
      id: newId,
      localidad: newLocality,
      historialCambios: [
        ...order.historialCambios,
        {
          timestamp: new Date().toISOString(),
          userId: state.currentUser?.id || 'sys',
          action: 'Renamed Order ID',
          details: `ID cambiado de ${id} a ${newId} por actualización de localidad a ${newLocality}`
        }
      ]
    };

    // Write new doc and delete old doc in Firestore
    await setDoc(doc(db, 'orders', newId), newOrder);
    await deleteDoc(doc(db, 'orders', id));

    return newId;
  }
}));

// Mock Data Seeder function
const seedInitialData = async () => {
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const existingUsers = usersSnap.docs.map(d => d.data() as User);
    
    const mockUsers: User[] = [
      { id: '1', role: 'team', name: 'Team Admin', code: '1250', permissions: ['dashboard', 'orders', 'queue', 'users', 'config'] },
      { id: '2', role: 'pharma', name: 'Pharma User', code: '1251', permissions: ['dashboard', 'orders', 'queue', 'users', 'config'] },
      { id: '3', role: 'admin', name: 'Recepción', code: '1252', permissions: ['dashboard', 'orders', 'queue', 'users', 'config'] },
      { id: 'maipumed', role: 'maipumed', name: 'maipumed', code: '1930', permissions: ['dashboard'] }
    ];

    const batch = writeBatch(db);
    let needsCommit = false;

    mockUsers.forEach(mu => {
      const hasUser = existingUsers.some(u => u.id === mu.id || u.code === mu.code);
      if (!hasUser) {
        batch.set(doc(db, 'users', mu.id), mu);
        needsCommit = true;
      }
    });

    const configSnap = await getDocs(collection(db, 'config'));
    if (configSnap.empty) {
      batch.set(doc(db, 'config', 'main'), {
        margins: {
          'Medicamentos': 20,
          'Perfumeria': 35,
          'Venta Libre': 25,
        },
        baseLogisticsCost: 1500,
        perKmLogisticsCost: 200,
      });
      needsCommit = true;
    }

    if (needsCommit) {
      await batch.commit();
      console.log('Default users/config ensured successfully.');
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'seed');
  }
};

const ensureMaipumedUser = async () => {
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const hasMaipumed = usersSnap.docs.some(d => (d.data() as User).code === '1930');
    if (!hasMaipumed) {
      await setDoc(doc(db, 'users', 'maipumed'), {
        id: 'maipumed',
        role: 'maipumed',
        name: 'maipumed',
        code: '1930',
        permissions: ['dashboard']
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'users/maipumed');
  }
};

export const initFirebaseSync = () => {
  // Try seating intial data
  seedInitialData().then(() => {
    ensureMaipumedUser();
  });

  const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
    useAppStore.getState().setUsers(snap.docs.map(d => d.data() as User));
  }, (e) => handleFirestoreError(e, OperationType.LIST, 'users'));

  const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
    useAppStore.getState().setOrders(snap.docs.map(d => d.data() as Order));
  }, (e) => handleFirestoreError(e, OperationType.LIST, 'orders'));

  const unsubPatients = onSnapshot(collection(db, 'patients'), (snap) => {
    useAppStore.getState().setPatients(snap.docs.map(d => d.data() as Patient));
  }, (e) => handleFirestoreError(e, OperationType.LIST, 'patients'));

  const unsubConfig = onSnapshot(doc(db, 'config', 'main'), (snap) => {
    if (snap.exists()) {
      useAppStore.getState().setConfig(snap.data());
    }
  }, (e) => handleFirestoreError(e, OperationType.GET, 'config/main'));

  return () => {
    unsubUsers();
    unsubOrders();
    unsubPatients();
    unsubConfig();
  };
};
