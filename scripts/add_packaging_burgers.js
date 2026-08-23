const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const CLIENTE = 'kevinandbacon';

const INTERFOLIADO = { tipo: 'ingrediente', ingredienteId: '27lOJI83MxarCXBt1fP4', nombre: 'Interfoliado Carnes', cantidad: 1, unidad: 'UN', costoUnitario: 5 };
const PAPEL_ANTIGRASA = { tipo: 'ingrediente', ingredienteId: 'dD3CLiArDsM4OtN4wBH2', nombre: 'Papel Antigrasa Termico', cantidad: 1, unidad: 'UN', costoUnitario: 50 };

const BURGER_IDS = [
  '0LrMejURWRI8OCOA5lXJ', // Clasic Kevin Doble
  '7PNzwoHq7DIMoFKszUiF', // Chz Burger Doble
  '7hMz0WaI18p7Q17Vos0u', // Plain Queso
  '86Run4Jn7UYfPYuL6kTe', // Big Kevin Simple
  'CG8mbPL15nGoMDqHJ14L', // Big Kevin Doble
  'FeeJdmwW76stUyUvWEEn', // Clasic Kevin Simple
  'GlQIea3frVZk3DDykk7l', // Kevin Bacon Simple
  'H3FqKWvv9KAfAwGndhj0', // Rodeo Bacon Simple
  'IJueJ9c8I9vbH7BVQFUu', // Coronel Sanders
  'MrguowBPlz58CclAFlIj', // Chz Burger Simple
  'OAPwpaSGXdduswPOW8jj', // Vegan Fox Simple
  'VPXewlnPWfcQCV6kX43s', // Kevin Bacon Doble
  'bnxEhdKWsdpsAkr6Oa1W', // Kevin Bajon
  'c9RZcSoqODhX9Pd1TmRd', // Rodeo Bacon Doble
  'kGtIgXdfZKOTuJVOfFfz', // Butter Attack Simple
  'mvbglFI5KLkbZgusSTKA', // Plain Queso Doble
  'va70wj3TntKmFjJDCQpL', // Butter Attack Doble
  'vierB6SzQveDqUwMC080', // Pineapple Express Simple
  'zldtJRBtVYxW3GyfDuLX', // Pineapple Express Doble
];

function calcularMargen(ingredientes, porciones, pv) {
  const costoTotal = (ingredientes || []).reduce((s, i) => s + (i.costoUnitario || 0) * (i.cantidad || 0), 0);
  const costoPorcion = costoTotal / (porciones || 1);
  const pvNeto = pv / 1.19;
  const margen = pvNeto > 0 ? ((pvNeto - costoPorcion) / pvNeto) * 100 : 0;
  return { costoTotal, costoPorcion, margen };
}

function TS() { return admin.firestore.FieldValue.serverTimestamp(); }

async function main() {
  const col = db.collection('clientes').doc(CLIENTE).collection('margenes');
  const snap = await col.get();
  const batch = db.batch();
  let count = 0;

  snap.docs.forEach(doc => {
    if (!BURGER_IDS.includes(doc.id)) return;
    const data = doc.data();
    let ingredientes = [...(data.ingredientes || [])];

    // Skip if already has these ingredients
    const yaInterfoliado = ingredientes.some(i => i.ingredienteId === '27lOJI83MxarCXBt1fP4');
    const yaPapel = ingredientes.some(i => i.ingredienteId === 'dD3CLiArDsM4OtN4wBH2');

    if (!yaInterfoliado) ingredientes.push(INTERFOLIADO);
    if (!yaPapel) ingredientes.push(PAPEL_ANTIGRASA);

    if (!yaInterfoliado || !yaPapel) {
      const { costoTotal, costoPorcion, margen } = calcularMargen(ingredientes, data.porciones || 1, data.precioVenta || 0);
      batch.update(doc.ref, { ingredientes, costoTotal, costoPorcion, margen, actualizadoEn: TS() });
      console.log(`✓ ${data.nombre}: margen ${margen.toFixed(1)}%`);
      count++;
    } else {
      console.log(`  (ya tenía) ${data.nombre}`);
    }
  });

  await batch.commit();
  console.log(`\nListo: ${count} burgers actualizadas.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
