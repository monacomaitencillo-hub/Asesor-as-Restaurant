const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const CLIENTE = 'kevinandbacon';

function TS() { return admin.firestore.FieldValue.serverTimestamp(); }

async function main() {
  // Leer plataformas configuradas
  const infoSnap = await db.collection('clientes').doc(CLIENTE).collection('info').doc('restaurante').get();
  const plataformas = infoSnap.data()?.plataformasDelivery || [];
  if (!plataformas.length) { console.log('No hay plataformas configuradas.'); process.exit(0); }
  console.log('Plataformas:', plataformas.map(p => `${p.nombre} ${p.comision}%`).join(', '));

  // Leer promociones
  const snap = await db.collection('clientes').doc(CLIENTE).collection('promociones').get();
  const batch = db.batch();
  let count = 0;

  snap.docs.forEach(doc => {
    const data = doc.data();
    const precioVenta = data.precioVenta || 0;
    const costoTotal  = data.costoTotal  || 0;

    const canales = {};
    plataformas.forEach(p => {
      const costoComision  = (p.comision / 100) * precioVenta;
      const costoTotalCanal = costoTotal + costoComision;
      const pvNeto = precioVenta / 1.19;
      const margenCanal = pvNeto > 0 ? ((pvNeto - costoTotalCanal) / pvNeto) * 100 : 0;
      canales[p.id] = {
        nombre: p.nombre,
        comision: p.comision,
        precioVenta: null,          // usa el precio genérico
        costoComision,
        costoTotalCanal,
        margenCanal,
      };
    });

    batch.update(doc.ref, { canales, actualizadoEn: TS() });

    const resumen = plataformas.map(p => `${p.nombre} ${canales[p.id].margenCanal.toFixed(1)}%`).join(' | ');
    console.log(`  ✓ ${data.nombre}: ${resumen}`);
    count++;
  });

  await batch.commit();
  console.log(`\nListo: ${count} promociones actualizadas.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
