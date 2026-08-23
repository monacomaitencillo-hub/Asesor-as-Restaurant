const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const CLIENTE = 'kevinandbacon';

function TS() { return admin.firestore.FieldValue.serverTimestamp(); }

// IDs de productos individuales en margenes
const ITEMS = {
  bigDoble:      { id: 'CG8mbPL15nGoMDqHJ14L', nombre: 'Big Kevin Doble',      precio: 11990, costo: 3019 },
  chzSimple:     { id: 'MrguowBPlz58CclAFlIj', nombre: 'Chz Burger Simple',    precio: 7990,  costo: 2088 },
  coronel:       { id: 'IJueJ9c8I9vbH7BVQFUu', nombre: 'Coronel Sanders',      precio: 5490,  costo: 1672 },
  papasGrandes:  { id: 'fvRBYv0BhYjdR4tzXCTt', nombre: 'Papas Fritas Grandes', precio: 2990,  costo: 673  },
  papasChicas:   { id: 'fy2xRy6OZtsHbHLRwb9m', nombre: 'Papas Fritas Chicas',  precio: 1990,  costo: 440  },
  coca:          { id: 't08SdiCEMRzbWgkf9n2B', nombre: 'Coca Cola Original',   precio: 2100,  costo: 558  },
};

function item(key, cantidad = 1) {
  const i = ITEMS[key];
  return { tipo: 'receta', refId: i.id, nombre: i.nombre, cantidad, precioUnitario: i.precio, costoUnitario: i.costo };
}

const COMBOS = [
  {
    nombre: 'Combo Big',
    precioVenta: 10990,
    items: [item('bigDoble'), item('papasGrandes'), item('coca')],
  },
  {
    nombre: 'Combo Chz',
    precioVenta: 10990,
    items: [item('chzSimple'), item('papasGrandes'), item('coca')],
  },
  {
    nombre: 'Combo Coronel Sanders',
    precioVenta: 7990,
    items: [item('coronel'), item('papasChicas'), item('coca')],
  },
];

// IDs de los combos actuales en margenes (para eliminarlos)
const COMBO_MARGENES_IDS = [
  'OrdBsrgsKoAHf3e3Bqn6', // Combo Big
  'SYIyVvr6xSdfFHG3G5YT', // Combo Chz
  'Xc485JiwpJEL7qiYUa4u', // Combo Coronel Sanders
];

async function main() {
  const promoCol = db.collection('clientes').doc(CLIENTE).collection('promociones');
  const margenCol = db.collection('clientes').doc(CLIENTE).collection('margenes');

  console.log('─── Creando promociones ───');
  for (const combo of COMBOS) {
    const costoTotal = combo.items.reduce((s, i) => s + (i.costoUnitario || 0) * (i.cantidad || 1), 0);
    const pvNeto = combo.precioVenta / 1.19;
    const margen = pvNeto > 0 ? ((pvNeto - costoTotal) / pvNeto) * 100 : 0;

    const doc = {
      nombre: combo.nombre,
      precioVenta: combo.precioVenta,
      items: combo.items,
      costoTotal,
      margen,
      activo: true,
      creadoEn: TS(),
      actualizadoEn: TS(),
    };
    const ref = await promoCol.add(doc);
    console.log(`  ✓ Creada: ${combo.nombre} | costo $${Math.round(costoTotal)} | margen ${margen.toFixed(1)}%  (id: ${ref.id})`);
  }

  console.log('\n─── Eliminando combos de Márgenes ───');
  for (const id of COMBO_MARGENES_IDS) {
    await margenCol.doc(id).delete();
    console.log(`  ✓ Eliminado de Márgenes: ${id}`);
  }

  console.log('\nListo.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
