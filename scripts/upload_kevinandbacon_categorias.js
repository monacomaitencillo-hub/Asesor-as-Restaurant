const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const CLIENTE_ID = 'kevinandbacon';

const CATEGORIAS = [
  'Abarrotes',
  'Bebidas',
  'Carnes',
  'Congelados',
  'Lácteos',
  'Limpieza',
  'Packaging',
  'Postres',
  'Verduras y Frescos',
];

// Mapa jerarquía → nombre de categoría (igual que en el upload)
const JERARQUIA_CAT = {
  'IC.010': 'Abarrotes',
  'IC.020': 'Congelados',
  'IC.030': 'Verduras y Frescos',
  'IC.040': 'Lácteos',
  'IC.050': 'Carnes',
  'IC.060': 'Bebidas',
  'IC.070': 'Packaging',
  'IC.080': 'Limpieza',
};

function TS() { return admin.firestore.FieldValue.serverTimestamp(); }

async function main() {
  const catCol = db.collection('clientes').doc(CLIENTE_ID).collection('categorias');
  const ingCol = db.collection('clientes').doc(CLIENTE_ID).collection('ingredientes');

  // 1. Crear categorías (skip si ya existe con ese nombre)
  const existSnap = await catCol.get();
  const existentes = new Set(existSnap.docs.map(d => d.data().nombre));

  console.log('─── Creando categorías ───');
  const catMap = {}; // nombre → id (para referencia futura)
  for (const nombre of CATEGORIAS) {
    if (existentes.has(nombre)) {
      console.log(`  (ya existe) ${nombre}`);
      const doc = existSnap.docs.find(d => d.data().nombre === nombre);
      catMap[nombre] = doc.id;
    } else {
      const ref = await catCol.add({ nombre, creadoEn: TS() });
      catMap[nombre] = ref.id;
      console.log(`  ✓ Creada: ${nombre}`);
    }
  }

  // 2. Actualizar ingredientes que no tienen categoría asignada
  console.log('\n─── Asignando categoría a ingredientes ───');
  const ingSnap = await ingCol.get();
  let batch = db.batch();
  let ops = 0;
  let total = 0;

  for (const doc of ingSnap.docs) {
    const data = doc.data();
    // Si ya tiene categoría correcta, saltar
    const categoriaEsperada = JERARQUIA_CAT[data.jerarquia] || '';
    if (data.categoria === categoriaEsperada) continue;
    if (!categoriaEsperada) continue; // sin jerarquía, no podemos asignar

    batch.update(doc.ref, { categoria: categoriaEsperada });
    ops++;
    total++;
    console.log(`  ✓ [${data.sku}] ${data.nombre} → ${categoriaEsperada}`);

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  console.log(`\nListo: ${CATEGORIAS.length} categorías, ${total} ingredientes actualizados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
