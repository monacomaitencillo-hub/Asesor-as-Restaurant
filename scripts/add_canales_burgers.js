const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const CLIENTE = 'kevinandbacon';

const PLATAFORMAS = [
  { id: 'uber_eats',   nombre: 'Uber Eats',   comision: 29 },
  { id: 'pedidos_ya',  nombre: 'Pedidos Ya',   comision: 22 },
];

// Caja Chz Burguer — ingrediente exclusivo de delivery
const CAJA = {
  tipo: 'ingrediente',
  ingredienteId: '5UnF5qx8NKACQtItkank',
  nombre: 'Caja Chz Burguer',
  cantidad: 1,
  unidad: 'UN',
  costoUnitario: 340,
};

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

function TS() { return admin.firestore.FieldValue.serverTimestamp(); }

function calcCanalMargen(ingredientesBase, porciones, ingredientesExtra, precioVenta, comisionPct) {
  const costoBase = ingredientesBase.reduce((s, i) => s + (i.costoUnitario || 0) * (i.cantidad || 0), 0) / (porciones || 1);
  const costoExtra = ingredientesExtra.reduce((s, i) => s + (i.costoUnitario || 0) * (i.cantidad || 0), 0);
  const costoComision = (comisionPct / 100) * precioVenta;
  const costoTotalCanal = costoBase + costoExtra + costoComision;
  const pvNeto = precioVenta / 1.19;
  const margenCanal = pvNeto > 0 ? ((pvNeto - costoTotalCanal) / pvNeto) * 100 : 0;
  return { costoExtra, costoComision, costoTotalCanal, margenCanal };
}

async function main() {
  const col = db.collection('clientes').doc(CLIENTE).collection('margenes');
  const snap = await col.get();
  const batch = db.batch();
  let count = 0;

  snap.docs.forEach(doc => {
    if (!BURGER_IDS.includes(doc.id)) return;
    const data = doc.data();
    const ingredientesBase = data.ingredientes || [];
    const porciones = data.porciones || 1;
    const precioVenta = data.precioVenta || 0;
    const ingredientesExtra = [CAJA];

    const canales = {};
    PLATAFORMAS.forEach(p => {
      const { costoExtra, costoComision, costoTotalCanal, margenCanal } = calcCanalMargen(
        ingredientesBase, porciones, ingredientesExtra, precioVenta, p.comision
      );
      canales[p.id] = {
        nombre: p.nombre,
        comision: p.comision,
        ingredientesExtra,
        costoExtra,
        costoComision,
        costoTotalCanal,
        margenCanal,
      };
    });

    batch.update(doc.ref, { canales, actualizadoEn: TS() });

    const ue = canales['uber_eats'];
    const py = canales['pedidos_ya'];
    console.log(`✓ ${data.nombre}: UberEats ${ue.margenCanal.toFixed(1)}% | PedidosYa ${py.margenCanal.toFixed(1)}%`);
    count++;
  });

  await batch.commit();
  console.log(`\nListo: ${count} burgers actualizadas con canales de delivery.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
