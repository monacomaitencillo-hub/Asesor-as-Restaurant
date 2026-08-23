const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const CLIENTE = 'kevinandbacon';

// ─── IDs reales de Firestore ──────────────────────────────────────────────────
const I = {
  blend:        { id: 'nRLFb6AhtNNXd4KUvR7p', nombre: 'Blend',                   costo: 6710,  unidad: 'kg'  },
  bacon:        { id: 'vcFRuq1qH3MiQCRIesPm', nombre: 'Bacon',                   costo: 8500,  unidad: 'kg'  },
  cheddar:      { id: 'jOuX9gbJ6DsrrPORHWVe', nombre: 'Queso Cheddar',           costo: 5625,  unidad: 'kg'  },
  cheddarVeg:   { id: 'is3NP6EtVXA4NTXNCTGZ', nombre: 'Queso Cheddar Vegano',    costo: 1250,  unidad: 'UN'  },
  tomate:       { id: 'w24nrJcaIFvdAKJTbM3j', nombre: 'Tomates',                 costo: 1520,  unidad: 'kg'  },
  lechuga:      { id: 'tOqZ1WvQFNi59bAd97Lb', nombre: 'Lechuga Escarola',        costo: 1290,  unidad: 'kg'  },
  rucula:       { id: 'OhPxZNIbE7gwGegnlUaT', nombre: 'Rucula',                  costo: 2600,  unidad: 'kg'  },
  cebollaMorada:{ id: '1iAVm32W5r1lot6sS7FY', nombre: 'Cebolla Morada',          costo: 910,   unidad: 'kg'  },
  cebollaBlanca:{ id: '6tNUIwNcqdUP5srX5ZrH', nombre: 'Cebolla Blanca',          costo: 603,   unidad: 'kg'  },
  pina:         { id: 'Udo3RPPLGfi6aljVaNBK', nombre: 'Piña',                    costo: 171,   unidad: 'UN'  },
  tabasco:      { id: '5RonX98f9cS1eu6wOm5f', nombre: 'Tabasco Chipotle',        costo: 25883, unidad: 'L'   },
  ketchup:      { id: 'WucjiDThVLgGwRRWIjAA', nombre: 'Ketchup Heinz',           costo: 7690,  unidad: 'kg'  },
  mostaza:      { id: 'RdaCGsVnwYvC51EUB85p', nombre: 'Mostaza Heinz',           costo: 1620,  unidad: 'kg'  },
  mayo:         { id: 'fI4AutMnWzpCgZA87Uoo', nombre: 'Mayonesa Real Kraft',     costo: 15500, unidad: 'gal' },
  mayoNot:      { id: 'eRXFDkTXgSiPiS0dXsYZ', nombre: 'Mayo Not',               costo: 3667,  unidad: 'kg'  },
  pan:          { id: 'D9qSjhtObzXawJGNGusQ', nombre: 'Pan Not Martins',         costo: 449,   unidad: 'UN'  },
  panSemillas:  { id: 'uxEaP5J3hQOdnBXiUKvq', nombre: 'Pan Not Martins con Semillas', costo: 470, unidad: 'UN' },
  panVegano:    { id: 'sx3JpRqjh5eKSR2Wx8AM', nombre: 'Pan Not Martins Vegano', costo: 414,  unidad: 'UN'  },
  pepinillo:    { id: '8KDHBwKklSb2PIGyIDbs', nombre: 'Pepinillo Dill Generico', costo: 3500,  unidad: 'kg'  },
  mantequilla:  { id: 'Rr05OOJ9mV3dN1CCmXv0', nombre: 'Mantequilla',            costo: 8400,  unidad: 'kg'  },
  cebollaCrispy:{ id: 'elNxI2GAJPOmZCt8j0fj', nombre: 'Cebolla Crispy',         costo: 6990,  unidad: 'kg'  },
  nuggets:      { id: 'IM9F8P1pBYU1y3UcVd7s', nombre: 'Nuggets',                costo: 4000,  unidad: 'kg'  },
  arosCebolla:  { id: 'nHWJKWld5ZK3i9xYPCQC', nombre: 'Aros de Cebolla',        costo: 3725,  unidad: 'kg'  },
  medallonNot:  { id: 'fNdOvTv1xHcOgFW0g43E', nombre: 'Medallon Not',           costo: 600,   unidad: 'UN'  },
  caja:         { id: '5UnF5qx8NKACQtItkank', nombre: 'Caja Chz Burguer',       costo: 340,   unidad: 'UN'  },
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

// ─── Recetas por nombre ───────────────────────────────────────────────────────
const RECETAS = {
  // ── BURGER SIMPLES ──────────────────────────────────────────────────────────
  'Plain Queso': [
    ing('blend', 0.13), ing('cheddar', 0.06),
    ing('pan', 1), ing('caja', 1),
  ],
  'Big Kevin Simple': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('cebollaBlanca', 0.03), ing('pepinillo', 0.02), ing('lechuga', 0.03),
    ing('pan', 1), ing('caja', 1),
  ],
  'Clasic Kevin Simple': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('lechuga', 0.03), ing('tomate', 0.05), ing('cebollaMorada', 0.03),
    ing('pepinillo', 0.02), ing('mayo', 0.02), ing('ketchup', 0.02),
    ing('pan', 1), ing('caja', 1),
  ],
  'Kevin Bacon Simple': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('cebollaCrispy', 0.02), ing('bacon', 0.04), ing('cebollaMorada', 0.03),
    ing('pan', 1), ing('caja', 1),
  ],
  'Rodeo Bacon Simple': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('arosCebolla', 0.08), ing('bacon', 0.04),
    ing('pan', 1), ing('caja', 1),
  ],
  'Coronel Sanders': [
    ing('nuggets', 0.15), ing('cheddar', 0.03),
    ing('lechuga', 0.03), ing('tomate', 0.05),
    ing('pan', 1), ing('caja', 1),
  ],
  'Chz Burger Simple': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('cebollaBlanca', 0.03), ing('pepinillo', 0.02),
    ing('ketchup', 0.02), ing('mostaza', 0.01),
    ing('pan', 1), ing('caja', 1),
  ],
  'Vegan Fox Simple': [
    ing('medallonNot', 1), ing('cheddarVeg', 1),
    ing('tomate', 0.05), ing('lechuga', 0.03),
    ing('mayoNot', 0.02), ing('cebollaMorada', 0.03),
    ing('panVegano', 1), ing('caja', 1),
  ],
  'Kevin Bajon': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('bacon', 0.04), ing('mayo', 0.02),
    ing('pan', 1), ing('caja', 1),
  ],
  'Butter Attack Simple': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('cebollaBlanca', 0.05), ing('mantequilla', 0.02), ing('bacon', 0.04),
    ing('pan', 1), ing('caja', 1),
  ],
  'Pineapple Express Simple': [
    ing('blend', 0.13), ing('cheddar', 0.03),
    ing('tabasco', 0.01), ing('pina', 0.05),
    ing('cebollaMorada', 0.03), ing('rucula', 0.02), ing('mayo', 0.02),
    ing('pan', 1), ing('caja', 1),
  ],

  // ── BURGER DOBLES ───────────────────────────────────────────────────────────
  'Plain Queso Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('panSemillas', 1), ing('caja', 1),
  ],
  'Big Kevin Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('cebollaBlanca', 0.03), ing('pepinillo', 0.02), ing('lechuga', 0.03),
    ing('panSemillas', 1), ing('caja', 1),
  ],
  'Clasic Kevin Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('lechuga', 0.03), ing('tomate', 0.05), ing('cebollaMorada', 0.03),
    ing('pepinillo', 0.02), ing('mayo', 0.02), ing('ketchup', 0.02),
    ing('panSemillas', 1), ing('caja', 1),
  ],
  'Chz Burger Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('cebollaBlanca', 0.03), ing('pepinillo', 0.02),
    ing('ketchup', 0.02), ing('mostaza', 0.01),
    ing('panSemillas', 1), ing('caja', 1),
  ],
  'Kevin Bacon Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('cebollaCrispy', 0.02), ing('bacon', 0.06), ing('cebollaMorada', 0.03),
    ing('panSemillas', 1), ing('caja', 1),
  ],
  'Butter Attack Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('cebollaBlanca', 0.05), ing('mantequilla', 0.03), ing('bacon', 0.06),
    ing('panSemillas', 1), ing('caja', 1),
  ],
  'Rodeo Bacon Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('arosCebolla', 0.08), ing('bacon', 0.06),
    ing('panSemillas', 1), ing('caja', 1),
  ],
  'Pineapple Express Doble': [
    ing('blend', 0.26), ing('cheddar', 0.06),
    ing('tabasco', 0.01), ing('pina', 0.05),
    ing('cebollaMorada', 0.03), ing('rucula', 0.02), ing('mayo', 0.02),
    ing('panSemillas', 1), ing('caja', 1),
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
  console.log(`\nListo: ${count} hamburguesas pobladas.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
