const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const CLIENTE = 'kevinandbacon';

// Precio Lista del CSV = precio en Uber Eats
// Nombre normalizado (lowercase, sin puntos finales) → precioUberEats
const UBER_EATS_PRICES = {
  'kevin bacon simple':         9990,
  'big kevin simple':           8990,
  'extra salsa mil islas':       800,
  'fanta zero':                 2100,
  'fanta regular':              2100,
  'camote frito pequeño':       2990,
  'camote frito grande':        3990,
  'no vives de ensalada':       6990,
  'ke-chicken':                 6990,
  'chz burger simple':          7990,
  'clasic kevin simple':        8990,
  'pineapple express simple':   8490,
  'vegan fox simple':          12990,
  'kevin bacon doble':         12990,
  'extra salsa kb':              800,
  'big kevin doble':           12990,
  'rodeo bacon simple':         9990,
  'rodeo bacon doble':         12990,
  'extra salsa bbq':             800,
  'chz burger doble':          11990,
  'clasic kevin doble':        12990,
  'pineapple express doble':   12990,
  'mac and cheese chico':       2990,
  'kfc kevin fried chickens':   3990,
  'papas fritas chicas':        1990,
  'papas fritas grandes':       2990,
  'papas kevin':                6990,
  'papas & bacon':              5990,
  'sprite zero':                2100,
  'sprite':                     2100,
  'plain queso doble':          8990,
  'franui':                     5490,
  'n.y  cookie':                3900,
  'n.y cookie':                 3900,
  'coca zero':                  2100,
  'limon soda':                 1990,
  'crush zero':                 1990,
  'plain queso':                6990,
  'alfajor de carne':           6990,
  'coronel sanders':            5490,
  'empanada chz burger':        7000,
  'ginger ale zero':            1990,
  'coca cola original':         1990,
  'pepsi':                      1990,
  'agua sin gas benedictino':   2100,
  'agua con gas benedictino':   2100,
  'jalapeño poppers':           6990,
  'kevin spacey simple':        5990,
  'pepsi zero':                 1990,
};

const COMISION_UE = 29;

function normName(n) {
  return (n || '').toLowerCase().trim().replace(/\.$/, '').replace(/\s+/g, ' ');
}

function recalcCanal(ingredientes, porciones, ingredientesExtra, precioVenta, comisionPct) {
  const costoBase = (ingredientes || []).reduce((s, i) => s + (i.costoUnitario || 0) * (i.cantidad || 0), 0) / (porciones || 1);
  const costoExtra = (ingredientesExtra || []).reduce((s, i) => s + (i.costoUnitario || 0) * (i.cantidad || 0), 0);
  const costoComision = (comisionPct / 100) * precioVenta;
  const costoTotalCanal = costoBase + costoExtra + costoComision;
  const pvNeto = precioVenta / 1.19;
  const margenCanal = pvNeto > 0 ? ((pvNeto - costoTotalCanal) / pvNeto) * 100 : 0;
  return { costoComision, costoTotalCanal, margenCanal };
}

function TS() { return admin.firestore.FieldValue.serverTimestamp(); }

async function main() {
  const col = db.collection('clientes').doc(CLIENTE).collection('margenes');
  const snap = await col.get();
  const batch = db.batch();
  let updated = 0, skipped = 0, noMatch = 0;

  snap.docs.forEach(doc => {
    const data = doc.data();
    const key = normName(data.nombre);
    const nuevoPrecio = UBER_EATS_PRICES[key];

    if (nuevoPrecio === undefined) {
      noMatch++;
      return;
    }

    const canales = data.canales || {};
    const canalUE = canales['uber_eats'];

    if (!canalUE) {
      // No tiene canal UE configurado — solo guardamos el precio, sin recalcular margen
      // (no tenemos ingredientesExtra seteados para este producto)
      console.log(`  [sin canal UE] ${data.nombre} — precio UE $${nuevoPrecio}`);
      skipped++;
      return;
    }

    // Si el precio ya es el correcto, saltar
    if (canalUE.precioVenta === nuevoPrecio) {
      console.log(`  [ya OK] ${data.nombre} — UE $${nuevoPrecio}`);
      skipped++;
      return;
    }

    const prevPrecio = canalUE.precioVenta || data.precioVenta || 0;
    const ingredientesExtra = canalUE.ingredientesExtra || [];
    const { costoComision, costoTotalCanal, margenCanal } = recalcCanal(
      data.ingredientes, data.porciones, ingredientesExtra, nuevoPrecio, COMISION_UE
    );

    batch.update(doc.ref, {
      [`canales.uber_eats.precioVenta`]:    nuevoPrecio,
      [`canales.uber_eats.costoComision`]:  costoComision,
      [`canales.uber_eats.costoTotalCanal`]: costoTotalCanal,
      [`canales.uber_eats.margenCanal`]:    margenCanal,
      actualizadoEn: TS(),
    });

    const diff = nuevoPrecio - (data.precioVenta || 0);
    const sign = diff >= 0 ? '+' : '';
    console.log(`  ✓ ${data.nombre}: local $${data.precioVenta} → UE $${nuevoPrecio} (${sign}${diff}) | margen canal ${margenCanal.toFixed(1)}%`);
    updated++;
  });

  if (updated > 0) {
    await batch.commit();
    console.log(`\nListo: ${updated} actualizados, ${skipped} sin cambio, ${noMatch} sin match en CSV.`);
  } else {
    console.log(`\nNada que actualizar: ${skipped} sin cambio, ${noMatch} sin match.`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
