const admin = require('firebase-admin');
const sa = require('../firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const CLIENTE_ID = 'kevinandbacon';

// Palabras que van en minúscula salvo que sean la primera del nombre
const MINUSCULAS = new Set(['de','del','la','el','los','las','y','e','o','u','con','sin','por','para','en','al','a']);

function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      if (i > 0 && MINUSCULAS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

async function main() {
  const col = db.collection('clientes').doc(CLIENTE_ID).collection('ingredientes');
  const snap = await col.get();

  let batch = db.batch();
  let ops = 0;
  let total = 0;

  for (const doc of snap.docs) {
    const { nombre } = doc.data();
    const nuevoNombre = toTitleCase(nombre);
    if (nuevoNombre !== nombre) {
      batch.update(doc.ref, { nombre: nuevoNombre });
      ops++;
      total++;
      console.log(`  "${nombre}" → "${nuevoNombre}"`);
    }
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  console.log(`\nListo: ${total} nombres actualizados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
