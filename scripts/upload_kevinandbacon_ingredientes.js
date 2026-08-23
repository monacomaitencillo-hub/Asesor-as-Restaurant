const admin = require('firebase-admin');
const XLSX  = require('xlsx');

const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const CLIENTE_ID = 'kevinandbacon';

// Mapa jerarquía → categoría legible
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

// tipoImpuesto según categoría
function tipoImpuesto(jerarquia, sku) {
  if (jerarquia === 'IC.050') return 'carne'; // carnes: 5%
  return 'alimento'; // 0% adicional para todo lo demás
}

function TS() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function main() {
  const wb = XLSX.readFile(
    '/Users/nicolasaguirre/Desktop/MaestroIngr_6546283702124544_1_2026-08-20T21_59_44.xlsx'
  );
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Saltamos fila 0 (claves internas) y fila 1 (headers legibles)
  const ingredientes = rows.slice(2).filter(r => r[0] && r[1]);

  const col = db.collection('clientes').doc(CLIENTE_ID).collection('ingredientes');

  let ok = 0, err = 0;
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;

  for (const r of ingredientes) {
    const [sku, nombre, descripcion, costo, activo, jerarquia, unidad] = r;

    const doc = {
      sku:           String(sku).trim(),
      nombre:        String(nombre).trim(),
      descripcion:   descripcion ? String(descripcion).trim() : '',
      costo:         parseFloat(costo) || 0,
      unidad:        unidad ? String(unidad).trim() : 'UN',
      categoria:     JERARQUIA_CAT[jerarquia] || '',
      jerarquia:     jerarquia || '',
      tipoImpuesto:  tipoImpuesto(jerarquia, sku),
      activo:        activo === 1 || activo === true,
      proveedorIds:  [],
      stockMinimo:   0,
      enInventario:  true,
      capacidadCC:   0,
      tieneCapacidad: false,
      areas:         [],
      creadoEn:      TS(),
    };

    const ref = col.doc(); // ID autogenerado
    batch.set(ref, doc);
    ops++;

    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }

    ok++;
    console.log(`✓ [${sku}] ${nombre} — $${costo || 0} ${unidad || 'UN'}`);
  }

  if (ops > 0) await batch.commit();

  console.log(`\nListo: ${ok} ingredientes subidos, ${err} errores.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
