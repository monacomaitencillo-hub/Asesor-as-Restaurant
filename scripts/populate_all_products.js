const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const CLIENTE = 'kevinandbacon';

const I = {
  // Carnes
  blend:        { id: 'nRLFb6AhtNNXd4KUvR7p', nombre: 'Blend',                    costo: 6710,  unidad: 'kg'  },
  bacon:        { id: 'vcFRuq1qH3MiQCRIesPm', nombre: 'Bacon',                    costo: 8500,  unidad: 'kg'  },
  cheddar:      { id: 'jOuX9gbJ6DsrrPORHWVe', nombre: 'Queso Cheddar',            costo: 5625,  unidad: 'kg'  },
  // Bebidas
  cocaZero:     { id: 'ypvugFWiTZ08TG3DoGKB', nombre: 'Coca Zero',                costo: 558,   unidad: 'UN'  },
  cocaNormal:   { id: '1RzWJlQ7rmCw666Ul9Vl', nombre: 'Coca Normal',              costo: 558,   unidad: 'UN'  },
  fanta:        { id: '1ymo1sC3fqSnd7MHWWrU', nombre: 'Fanta',                    costo: 714,   unidad: 'CAN' },
  fantaZero:    { id: 'k0drp6LCJu2HqQi4KuVi', nombre: 'Fanta Zero',               costo: 706,   unidad: 'CAN' },
  limonSoda:    { id: 'CJM8JeDzAhprovlOoC98', nombre: 'Limon Soda',               costo: 394,   unidad: 'UN'  },
  aguaCon:      { id: 'fraykTs0Dgf6zzqm8yGK', nombre: 'Agua con Gas',             costo: 294,   unidad: 'UN'  },
  aguaSin:      { id: 'BvgAokOHzVRpBwX042VK', nombre: 'Agua sin Gas',             costo: 294,   unidad: 'UN'  },
  pepsi:        { id: 'UhwsCcdz1X8HoLYvhXiJ', nombre: 'Pepsi',                    costo: 394,   unidad: 'UN'  },
  gingerAle:    { id: '2pdTd6DQUxDAaLVuU5KF', nombre: 'Ginger Ale Zero',          costo: 400,   unidad: 'UN'  },
  // Congelados
  papasFritas:  { id: 'bJs7maa0lwIhX1gIfhDZ', nombre: 'Papas Fritas',             costo: 2150,  unidad: 'kg'  },
  camoteFrito:  { id: '2tjv4HXCFYsJyz041yEZ', nombre: 'Papa Frita Camote',        costo: 3740,  unidad: 'kg'  },
  topperJal:    { id: 'wYDJ9AVJ5NLcihnkibm9', nombre: 'Topper Jalapeños',         costo: 8850,  unidad: 'kg'  },
  nuggets:      { id: 'IM9F8P1pBYU1y3UcVd7s', nombre: 'Nuggets',                  costo: 4000,  unidad: 'kg'  },
  carneMolida:  { id: 'NMjRSaMt5ZoE6m1NaO9R', nombre: 'Carne Molida',             costo: 6780,  unidad: 'kg'  },
  pechuga:      { id: 'sm1Fq4cCtD9x7GToHQWR', nombre: 'Pechuga Deshuesada',       costo: 3500,  unidad: 'kg'  },
  // Abarrotes
  aceite:       { id: 'GkkpM7c7fA8xAtUKDaX8', nombre: 'Aceite para Freir',        costo: 1750,  unidad: 'L'   },
  salsaCheddar: { id: 'Z9OcddJECdSmZ7lOwkOv', nombre: 'Salsa Cheddar Suce',       costo: 4625,  unidad: 'L'   },
  parmesano:    { id: 'clt7VbTrQx3d8NmFvkJU', nombre: 'Queso Parmesano',          costo: 14200, unidad: 'kg'  },
  ketchup:      { id: 'WucjiDThVLgGwRRWIjAA', nombre: 'Ketchup Heinz',            costo: 7690,  unidad: 'kg'  },
  mostaza:      { id: 'RdaCGsVnwYvC51EUB85p', nombre: 'Mostaza Heinz',            costo: 1620,  unidad: 'kg'  },
  mayo:         { id: 'fI4AutMnWzpCgZA87Uoo', nombre: 'Mayonesa Real Kraft',      costo: 15500, unidad: 'gal' },
  // Verduras
  tomate:       { id: 'w24nrJcaIFvdAKJTbM3j', nombre: 'Tomates',                  costo: 1520,  unidad: 'kg'  },
  lechuga:      { id: 'tOqZ1WvQFNi59bAd97Lb', nombre: 'Lechuga Escarola',         costo: 1290,  unidad: 'kg'  },
  cebollaBlanca:{ id: '6tNUIwNcqdUP5srX5ZrH', nombre: 'Cebolla Blanca',           costo: 603,   unidad: 'kg'  },
  ciboullete:   { id: 'uBdytkdR7hqVqyER7oeU', nombre: 'Ciboullete',               costo: 7000,  unidad: 'kg'  },
  mixVerde:     { id: '1YcP6fxNcrJbNEre5b1i', nombre: 'Mix Verde',                costo: 4800,  unidad: 'kg'  },
  // Lácteos
  cremaLeche:   { id: 'WSCAKHTfcBd2RCS298yS', nombre: 'Crema de Leche',           costo: 4917,  unidad: 'L'   },
  // Packaging
  pan:          { id: 'D9qSjhtObzXawJGNGusQ', nombre: 'Pan Not Martins',          costo: 449,   unidad: 'UN'  },
  panSemillas:  { id: 'uxEaP5J3hQOdnBXiUKvq', nombre: 'Pan Not Martins con Semillas', costo: 470, unidad: 'UN' },
  portaPapas:   { id: 'FkWLgUYbBjI6snwU1fry', nombre: 'Porta Papas Fritas',       costo: 100,   unidad: 'UN'  },
  poteGrande:   { id: '6awIYCTCNqN4SoF8R7r4', nombre: 'Pote Polipapel Grande',    costo: 91,    unidad: 'UN'  },
  poteChico:    { id: 'sMn2vBDY0POJiHgj8aXr', nombre: 'Pote Polipapel Chico',     costo: 64,    unidad: 'UN'  },
  pepinillo:    { id: '8KDHBwKklSb2PIGyIDbs', nombre: 'Pepinillo Dill Generico',   costo: 3500,  unidad: 'kg'  },
  caja:         { id: '5UnF5qx8NKACQtItkank', nombre: 'Caja Chz Burguer',         costo: 340,   unidad: 'UN'  },
};

function ing(key, cantidad) {
  const i = I[key];
  return { tipo: 'ingrediente', ingredienteId: i.id, nombre: i.nombre, cantidad, unidad: i.unidad, costoUnitario: i.costo };
}

function calcCostos(ingredientes, porciones, precioVenta) {
  const costoTotal = ingredientes.reduce((s, i) => s + (i.costoUnitario || 0) * (i.cantidad || 0), 0);
  const costoPorcion = costoTotal / (porciones || 1);
  const pvNeto = (precioVenta || 0) / 1.19;
  const margen = pvNeto > 0 ? ((pvNeto - costoPorcion) / pvNeto) * 100 : 0;
  return { costoTotal, costoPorcion, margen };
}

const RECETAS = {
  // ── BEBIDAS ─────────────────────────────────────────────────────────────────
  'Coca Zero':            [ing('cocaZero', 1)],
  'Coca Cola Original':   [ing('cocaNormal', 1)],
  'Fanta Zero':           [ing('fantaZero', 1)],
  'Fanta Regular':        [ing('fanta', 1)],
  'Sprite':               [ing('limonSoda', 1)],
  'Sprite Zero':          [ing('limonSoda', 1)],
  'L P':                  [ing('pepsi', 1)],
  'L P 2':                [ing('limonSoda', 1)],
  'Vaso Refill':          [ing('cocaNormal', 1)],

  // ── SIDES ───────────────────────────────────────────────────────────────────
  'Papas Fritas Chicas': [
    ing('papasFritas', 0.15), ing('aceite', 0.01), ing('portaPapas', 1),
  ],
  'Papas Fritas Grandes': [
    ing('papasFritas', 0.25), ing('aceite', 0.02), ing('portaPapas', 1),
  ],
  'Camote Frito Pequeño': [
    ing('camoteFrito', 0.15), ing('aceite', 0.01), ing('portaPapas', 1),
  ],
  'Camote Frito Grande': [
    ing('camoteFrito', 0.25), ing('aceite', 0.02), ing('portaPapas', 1),
  ],
  'Jalapeño Poppers': [
    ing('topperJal', 0.15), ing('cheddar', 0.03),
  ],
  'Kfc Kevin Fried Chickens': [
    ing('nuggets', 0.15), ing('mayo', 0.03),
  ],

  // ── PARA COMPARTIR ──────────────────────────────────────────────────────────
  'Papas Kevin': [
    ing('papasFritas', 0.3), ing('salsaCheddar', 0.05),
    ing('carneMolida', 0.08), ing('cremaLeche', 0.04),
    ing('ciboullete', 0.01), ing('topperJal', 0.03),
    ing('poteGrande', 1),
  ],
  'Papas & Bacon': [
    ing('papasFritas', 0.25), ing('salsaCheddar', 0.05),
    ing('bacon', 0.05), ing('ciboullete', 0.01),
    ing('poteGrande', 1),
  ],

  // ── ENSALADAS ───────────────────────────────────────────────────────────────
  'No Vives de Ensalada': [
    ing('mixVerde', 0.08), ing('pechuga', 0.1),
    ing('tomate', 0.05), ing('parmesano', 0.02),
    ing('mayo', 0.03),
  ],

  // ── COMBOS ──────────────────────────────────────────────────────────────────
  // Combo Chz = Chz Burger Simple + Papas Grandes + Coca
  'Combo Chz': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('cebollaBlanca', 0.03), ing('pepinillo', 0.02),
    ing('ketchup', 0.02), ing('mostaza', 0.01),
    ing('pan', 1), ing('caja', 1),
    ing('papasFritas', 0.25), ing('aceite', 0.02), ing('portaPapas', 1),
    ing('cocaNormal', 1),
  ],
  // Combo Big = Big Kevin Doble + Papas Grandes + Coca
  'Combo Big': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('cebollaBlanca', 0.03), ing('pepinillo', 0.02), ing('lechuga', 0.03),
    ing('panSemillas', 1), ing('caja', 1),
    ing('papasFritas', 0.25), ing('aceite', 0.02), ing('portaPapas', 1),
    ing('cocaNormal', 1),
  ],
  // Combo Coronel Sanders = Coronel Sanders + Papas Chicas + Coca
  'Combo Coronel Sanders': [
    ing('nuggets', 0.15), ing('cheddar', 0.03),
    ing('lechuga', 0.03), ing('tomate', 0.05), ing('mayo', 0.02),
    ing('panSemillas', 1), ing('caja', 1),
    ing('papasFritas', 0.15), ing('aceite', 0.01), ing('portaPapas', 1),
    ing('cocaNormal', 1),
  ],
};

function TS() { return admin.firestore.FieldValue.serverTimestamp(); }

async function main() {
  const col = db.collection('clientes').doc(CLIENTE).collection('margenes');
  const snap = await col.get();
  const batch = db.batch();
  let count = 0;

  snap.docs.forEach(doc => {
    const { nombre, precioVenta, porciones } = doc.data();
    const ingredientes = RECETAS[nombre];
    if (!ingredientes) return;

    const { costoTotal, costoPorcion, margen } = calcCostos(ingredientes, porciones || 1, precioVenta || 0);
    batch.update(doc.ref, { ingredientes, costoTotal, costoPorcion, margen, actualizadoEn: TS() });
    console.log(`✓ ${nombre}: ${ingredientes.length} ing. | costo $${Math.round(costoPorcion)} | margen ${margen.toFixed(1)}%`);
    count++;
  });

  await batch.commit();
  console.log(`\nListo: ${count} productos poblados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
