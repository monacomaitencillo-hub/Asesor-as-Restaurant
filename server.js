require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');

const IMP_ADICIONAL = {
  alimento:          0,
  carne:             0.05,
  cerveza_vino:      0.205,
  licor:             0.315,
  bebida_azucarada:  0.18,
  bebida_sin_azucar: 0.10,
  harina:            0.12,
  sin_impuesto:      0
};

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
let serviceAccount;
let firebaseInitError = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } else {
    serviceAccount = require('./firebase-service-account.json');
  }
} catch (e) {
  firebaseInitError = e.message;
  console.error('Firebase init error:', e.message);
}

if (serviceAccount) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = serviceAccount ? admin.firestore() : null;
const TS = () => admin.firestore.FieldValue.serverTimestamp();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));


// ─── Auth Middleware ──────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7));
    req.uid = decoded.uid;
    req.email = decoded.email;
    req.superadmin = decoded.superadmin === true;

    if (req.superadmin) {
      // Superadmin puede pasar el clienteId por header
      const clienteHeader = req.headers['x-cliente-id'];
      if (!clienteHeader) {
        return res.status(400).json({ error: 'Superadmin debe seleccionar un cliente (x-cliente-id)' });
      }
      req.clienteId = clienteHeader;
    } else {
      req.clienteId = decoded.clienteId;
      if (!req.clienteId) {
        return res.status(403).json({ error: 'Usuario sin cliente asignado. Contactá al administrador.' });
      }
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Helper: colección bajo el cliente
const col = (req, nombre) =>
  db.collection('clientes').doc(req.clienteId).collection(nombre);

// ─── CONFIG (Firebase client config para el frontend) ─────────────────────────
app.get('/api/config', (_req, res) => {
  const raw = process.env.FIREBASE_CLIENT_CONFIG;
  if (!raw) return res.status(500).json({ error: 'FIREBASE_CLIENT_CONFIG no definido en .env' });
  try {
    res.json(JSON.parse(raw));
  } catch {
    res.status(500).json({ error: 'FIREBASE_CLIENT_CONFIG tiene formato inválido' });
  }
});

// ─── ME ───────────────────────────────────────────────────────────────────────
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await admin.auth().getUser(req.uid);
    res.json({
      uid: req.uid,
      email: req.email,
      clienteId: req.clienteId,
      displayName: user.displayName || req.email
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── INGREDIENTES ─────────────────────────────────────────────────────────────
app.get('/api/ingredientes', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'ingredientes').orderBy('nombre').get();
    res.json(
      snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.activo !== false)
    );
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ingredientes', requireAuth, async (req, res) => {
  try {
    const data = {
      nombre: req.body.nombre?.trim(),
      categoria: req.body.categoria || '',
      unidad: req.body.unidad || 'kg',
      tipoImpuesto: req.body.tipoImpuesto || 'alimento',
      capacidadCC: parseFloat(req.body.capacidadCC) || 0,
      tieneCapacidad: req.body.tieneCapacidad === true || req.body.tieneCapacidad === 'true',
      proveedorIds: req.body.proveedorIds || [],
      costo: parseFloat(req.body.costo) || 0,
      stockMinimo: parseFloat(req.body.stockMinimo) || 0,
      enInventario: req.body.enInventario !== false,
      areas: req.body.areas || [],
      activo: true,
      creadoEn: TS(),
      creadoPor: req.uid
    };
    const ref = await col(req, 'ingredientes').add(data);
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ingredientes/:id', requireAuth, async (req, res) => {
  try {
    const data = {
      nombre: req.body.nombre?.trim(),
      categoria: req.body.categoria || '',
      unidad: req.body.unidad || 'kg',
      tipoImpuesto: req.body.tipoImpuesto || 'alimento',
      capacidadCC: parseFloat(req.body.capacidadCC) || 0,
      tieneCapacidad: req.body.tieneCapacidad === true || req.body.tieneCapacidad === 'true',
      proveedorIds: req.body.proveedorIds || [],
      stockMinimo: parseFloat(req.body.stockMinimo) || 0,
      enInventario: req.body.enInventario !== false,
      areas: req.body.areas || [],
      actualizadoEn: TS()
    };
    await col(req, 'ingredientes').doc(req.params.id).update(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ingredientes/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'ingredientes').doc(req.params.id).update({ activo: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HISTORIAL DE PRECIOS ─────────────────────────────────────────────────────
app.get('/api/ingredientes/:id/precios', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'ingredientes').doc(req.params.id)
      .collection('historialPrecios')
      .orderBy('mes', 'desc')
      .limit(60)
      .get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ingredientes/:id/precios', requireAuth, async (req, res) => {
  try {
    const { mes, precioNeto, descuento, cantidadCompra, descripcionCompra, fleteNeto, unidadesEnvase } = req.body;
    const pn = parseFloat(precioNeto) || 0;
    const desc = parseFloat(descuento) || 0;
    const flete = parseFloat(fleteNeto) || 0;
    const cant = parseFloat(cantidadCompra) || 1;
    const unidades = parseFloat(unidadesEnvase) || 1;
    const ingDoc = await col(req, 'ingredientes').doc(req.params.id).get();
    const ingData = ingDoc.data() || {};
    const tasaAdicional = IMP_ADICIONAL[ingData.tipoImpuesto] ?? 0;
    const precioConDesc = pn * (1 - desc / 100);
    const costoUnitario = (precioConDesc * (1 + tasaAdicional) + flete) / cant;
    const capacidadCC = ingData.capacidadCC || 0;
    const tieneCapacidad = ingData.tieneCapacidad && capacidadCC > 0;
    const costoFinal = tieneCapacidad ? costoUnitario / capacidadCC : costoUnitario;

    const data = {
      mes,
      precioNeto: pn,
      descuento: desc,
      cantidadCompra: cant,
      descripcionCompra: descripcionCompra || '',
      fleteNeto: flete,
      unidadesEnvase: unidades,
      costoUnitario,
      creadoEn: TS()
    };

    const ref = await col(req, 'ingredientes').doc(req.params.id)
      .collection('historialPrecios').add(data);

    // Actualizar costo actual del ingrediente con el último precio
    await col(req, 'ingredientes').doc(req.params.id).update({
      costo: costoFinal,
      actualizadoEn: TS()
    });

    // Cascade: update preparaciones y recetas que usan este ingrediente
    await cascadeIngredienteCosto(req, req.params.id, costoFinal);

    res.json({ id: ref.id, costoUnitario });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ingredientes/:id/precios/:precioId', requireAuth, async (req, res) => {
  try {
    const { mes, precioNeto, descuento, cantidadCompra, descripcionCompra, fleteNeto, unidadesEnvase } = req.body;
    const pn = parseFloat(precioNeto) || 0;
    const desc = parseFloat(descuento) || 0;
    const flete = parseFloat(fleteNeto) || 0;
    const cant = parseFloat(cantidadCompra) || 1;
    const unidades = parseFloat(unidadesEnvase) || 1;
    const ingDoc = await col(req, 'ingredientes').doc(req.params.id).get();
    const ingData = ingDoc.data() || {};
    const tasaAdicional = IMP_ADICIONAL[ingData.tipoImpuesto] ?? 0;
    const precioConDesc = pn * (1 - desc / 100);
    const costoUnitario = (precioConDesc * (1 + tasaAdicional) + flete) / cant;
    const capacidadCC = ingData.capacidadCC || 0;
    const tieneCapacidad = ingData.tieneCapacidad && capacidadCC > 0;
    const costoFinal = tieneCapacidad ? costoUnitario / capacidadCC : costoUnitario;

    await col(req, 'ingredientes').doc(req.params.id)
      .collection('historialPrecios').doc(req.params.precioId).update({
        mes, precioNeto: pn, descuento: desc, cantidadCompra: cant,
        descripcionCompra: descripcionCompra || '', fleteNeto: flete,
        unidadesEnvase: unidades, costoUnitario
      });

    // Actualizar costo actual del ingrediente
    await col(req, 'ingredientes').doc(req.params.id).update({
      costo: costoFinal,
      actualizadoEn: TS()
    });

    // Cascade: update preparaciones y recetas que usan este ingrediente
    await cascadeIngredienteCosto(req, req.params.id, costoFinal);

    res.json({ ok: true, costoUnitario });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ingredientes/:id/precios/:precioId', requireAuth, async (req, res) => {
  try {
    await col(req, 'ingredientes').doc(req.params.id)
      .collection('historialPrecios').doc(req.params.precioId).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── UNIDADES ─────────────────────────────────────────────────────────────────
app.get('/api/unidades', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'unidades').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/unidades', requireAuth, async (req, res) => {
  try {
    const nombre = req.body.nombre?.trim();
    const abreviatura = req.body.abreviatura?.trim() || '';
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const ref = await col(req, 'unidades').add({ nombre, abreviatura, creadoEn: TS() });
    res.json({ id: ref.id, nombre, abreviatura });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/unidades/:id', requireAuth, async (req, res) => {
  try {
    const nombre = req.body.nombre?.trim();
    const abreviatura = req.body.abreviatura?.trim() || '';
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    await col(req, 'unidades').doc(req.params.id).update({ nombre, abreviatura });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/unidades/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'unidades').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
app.get('/api/categorias', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'categorias').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categorias', requireAuth, async (req, res) => {
  try {
    const nombre = req.body.nombre?.trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const ref = await col(req, 'categorias').add({ nombre, creadoEn: TS() });
    res.json({ id: ref.id, nombre });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    const nombre = req.body.nombre?.trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    await col(req, 'categorias').doc(req.params.id).update({ nombre });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'categorias').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROVEEDORES ──────────────────────────────────────────────────────────────
app.get('/api/proveedores', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'proveedores').orderBy('nombre').get();
    res.json(
      snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.activo !== false)
    );
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/proveedores', requireAuth, async (req, res) => {
  try {
    const data = {
      nombre: req.body.nombre?.trim(),
      telefono: req.body.telefono || '',
      email: req.body.email || '',
      notas: req.body.notas || '',
      activo: true,
      creadoEn: TS()
    };
    const ref = await col(req, 'proveedores').add(data);
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/proveedores/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'proveedores').doc(req.params.id).update({
      nombre: req.body.nombre?.trim(),
      telefono: req.body.telefono || '',
      email: req.body.email || '',
      notas: req.body.notas || '',
      actualizadoEn: TS()
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/proveedores/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'proveedores').doc(req.params.id).update({ activo: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STOCK ────────────────────────────────────────────────────────────────────
app.get('/api/stock', requireAuth, async (req, res) => {
  try {
    const [stockSnap, ingSnap] = await Promise.all([
      col(req, 'stock').get(),
      col(req, 'ingredientes').orderBy('nombre').get()
    ]);

    const stockMap = {};
    stockSnap.docs.forEach(d => { stockMap[d.id] = d.data(); });

    const result = ingSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.activo !== false)
      .map(ing => ({
        ...ing,
        cantidad: stockMap[ing.id]?.cantidad ?? 0,
        ultimaActualizacion: stockMap[ing.id]?.ultimaActualizacion ?? null,
        bajoCritico: (stockMap[ing.id]?.cantidad ?? 0) < (ing.stockMinimo ?? 0)
      }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stock', requireAuth, async (req, res) => {
  try {
    const { items } = req.body; // [{ingredienteId, cantidad, modo}]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de items' });
    }

    // Procesar uno a uno para manejar modo 'add' correctamente
    const alertasPendientes = [];

    for (const item of items) {
      const ref = col(req, 'stock').doc(item.ingredienteId);
      const snap = await ref.get();
      const actual = snap.exists ? (snap.data().cantidad ?? 0) : 0;
      const nueva = item.modo === 'add'
        ? actual + parseFloat(item.cantidad || 0)
        : parseFloat(item.cantidad || 0);

      await ref.set({
        cantidad: nueva,
        ultimaActualizacion: TS(),
        actualizadoPor: req.uid
      }, { merge: true });

      alertasPendientes.push({ ingredienteId: item.ingredienteId, nueva });
    }

    // Revisar alertas de stock bajo
    for (const { ingredienteId, nueva } of alertasPendientes) {
      const ingSnap = await col(req, 'ingredientes').doc(ingredienteId).get();
      if (!ingSnap.exists) continue;
      const ing = ingSnap.data();
      const minimo = ing.stockMinimo || 0;

      if (nueva < minimo) {
        const existente = await col(req, 'alertas')
          .where('ingredienteId', '==', ingredienteId)
          .where('resuelta', '==', false)
          .limit(1)
          .get();
        if (existente.empty) {
          await col(req, 'alertas').add({
            tipo: 'stock_bajo',
            ingredienteId,
            ingredienteNombre: ing.nombre,
            unidad: ing.unidad,
            cantidadActual: nueva,
            cantidadMinima: minimo,
            mensaje: `${ing.nombre}: stock actual ${nueva} ${ing.unidad}, mínimo ${minimo} ${ing.unidad}`,
            resuelta: false,
            creadoEn: TS()
          });
        }
      } else {
        // Resolver alertas activas si superó el mínimo
        const activas = await col(req, 'alertas')
          .where('ingredienteId', '==', ingredienteId)
          .where('resuelta', '==', false)
          .get();
        if (!activas.empty) {
          const batch = db.batch();
          activas.docs.forEach(doc => batch.update(doc.ref, { resuelta: true, resueltaEn: TS() }));
          await batch.commit();
        }
      }
    }

    res.json({ ok: true, updated: items.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── INVENTARIOS ──────────────────────────────────────────────────────────────
app.get('/api/inventarios', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'inventarios').orderBy('fecha', 'desc').limit(100).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventarios/:id', requireAuth, async (req, res) => {
  try {
    const doc = await col(req, 'inventarios').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'No encontrado' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventarios', requireAuth, async (req, res) => {
  try {
    const { fecha, items, notas } = req.body;
    if (!fecha || !Array.isArray(items)) {
      return res.status(400).json({ error: 'fecha e items son requeridos' });
    }

    const data = {
      fecha,
      items,
      notas: notas || '',
      itemCount: items.length,
      creadoEn: TS(),
      creadoPor: req.uid,
      creadoPorEmail: req.email
    };
    const ref = await col(req, 'inventarios').add(data);

    // Actualizar stock con los valores del inventario
    const batch = db.batch();
    for (const item of items) {
      const stockRef = col(req, 'stock').doc(item.ingredienteId);
      batch.set(stockRef, {
        cantidad: item.cantidad,
        ultimaActualizacion: TS(),
        actualizadoPor: req.uid
      }, { merge: true });
    }
    await batch.commit();

    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/inventarios/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'inventarios').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HELPERS CASCADA ──────────────────────────────────────────────────────────

async function cascadeToPromociones(req, margenUpdates, prepUpdates) {
  if (!Object.keys(margenUpdates).length && !Object.keys(prepUpdates).length) return;
  const promosSnap = await col(req, 'promociones').get();
  const batch = db.batch();
  let updated = false;
  for (const doc of promosSnap.docs) {
    const promo = doc.data();
    const items = promo.items || [];
    const affected = items.some(i =>
      (i.tipo === 'receta' && margenUpdates[i.refId] !== undefined) ||
      (i.tipo === 'preparacion' && prepUpdates[i.refId] !== undefined)
    );
    if (!affected) continue;
    const updatedItems = items.map(i => {
      if (i.tipo === 'receta' && margenUpdates[i.refId] !== undefined) return { ...i, costoUnitario: margenUpdates[i.refId] };
      if (i.tipo === 'preparacion' && prepUpdates[i.refId] !== undefined) return { ...i, costoUnitario: prepUpdates[i.refId] };
      return i;
    });
    const { costoTotal, precioSeparado, margen } = calcularPromo(updatedItems, promo.precioVenta);
    batch.update(doc.ref, { items: updatedItems, costoTotal, precioSeparado, margen, actualizadoEn: TS() });
    updated = true;
  }
  if (updated) await batch.commit();
}

async function cascadeIngredienteCosto(req, ingredienteId, nuevoCosto) {
  // Update preparaciones that use this ingredient
  const prepsSnap = await col(req, 'preparaciones').get();
  const batch1 = db.batch();
  const prepUpdates = {}; // prepId → new costoPorUnidad
  for (const doc of prepsSnap.docs) {
    const prep = doc.data();
    const ings = prep.ingredientes || [];
    if (!ings.some(i => i.ingredienteId === ingredienteId)) continue;
    const updatedIngs = ings.map(i => i.ingredienteId === ingredienteId ? { ...i, costoUnitario: nuevoCosto } : i);
    const { costoTotal, costoPorUnidad } = calcularCostoPrep(updatedIngs, prep);
    batch1.update(doc.ref, { ingredientes: updatedIngs, costoTotal, costoPorUnidad, actualizadoEn: TS() });
    prepUpdates[doc.id] = costoPorUnidad;
  }
  await batch1.commit();

  // Update margenes that use this ingredient directly OR the updated preparations
  const margenesSnap = await col(req, 'margenes').get();
  const batch2 = db.batch();
  const margenUpdates = {}; // margenId → new costoPorcion
  for (const doc of margenesSnap.docs) {
    const receta = doc.data();
    const ings = receta.ingredientes || [];
    const affected = ings.some(i =>
      (i.tipo !== 'preparacion' && i.ingredienteId === ingredienteId) ||
      (i.tipo === 'preparacion' && prepUpdates[i.refId] !== undefined)
    );
    if (!affected) continue;
    const updatedIngs = ings.map(i => {
      if (i.tipo !== 'preparacion' && i.ingredienteId === ingredienteId) return { ...i, costoUnitario: nuevoCosto };
      if (i.tipo === 'preparacion' && prepUpdates[i.refId] !== undefined) return { ...i, costoUnitario: prepUpdates[i.refId] };
      return i;
    });
    const { costoTotal, costoPorcion, margen } = calcularMargen(updatedIngs, receta.porciones, receta.precioVenta);
    batch2.update(doc.ref, { ingredientes: updatedIngs, costoTotal, costoPorcion, margen, actualizadoEn: TS() });
    margenUpdates[doc.id] = costoPorcion;
  }
  await batch2.commit();

  // Cascade también a promociones
  await cascadeToPromociones(req, margenUpdates, prepUpdates);
}

// ─── MÁRGENES ─────────────────────────────────────────────────────────────────
function calcularMargen(ingredientes, porciones, precioVenta) {
  const costoTotal = (ingredientes || []).reduce((sum, ing) => {
    return sum + (parseFloat(ing.costoUnitario) || 0) * (parseFloat(ing.cantidad) || 0);
  }, 0);
  const porcionesNum = parseFloat(porciones) || 1;
  const costoPorcion = costoTotal / porcionesNum;
  const pvNeto = precioVenta / 1.19;
  const margen = pvNeto > 0 ? ((pvNeto - costoPorcion) / pvNeto) * 100 : 0;
  return { costoTotal, costoPorcion, margen };
}

// ─── PREPARACIONES ────────────────────────────────────────────────────────────
app.get('/api/preparaciones', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'preparaciones').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function calcularCostoPrep(ingredientes, { calcularPromedio, tieneRendAgua, rendAgua, tieneRendAire, rendAire, tieneMerma, merma, rendimiento }) {
  const ings = ingredientes || [];
  const totalBruto = ings.reduce((s, i) => s + (parseFloat(i.costoUnitario) || 0) * (parseFloat(i.cantidad) || 0), 0);
  const costoIng = calcularPromedio && ings.length > 0 ? totalBruto / ings.length : totalBruto;
  const costoPostAgua = tieneRendAgua && rendAgua > 0 ? costoIng / (1 + rendAgua / 100) : costoIng;
  const costoPostAire = tieneRendAire && rendAire > 0 ? costoPostAgua / (1 + rendAire / 100) : costoPostAgua;
  const rend = parseFloat(rendimiento) || 1;
  const rendEfectivo = tieneMerma && merma > 0 ? rend * (1 - merma / 100) : rend;
  return { costoTotal: costoPostAire, costoPorUnidad: rendEfectivo > 0 ? costoPostAire / rendEfectivo : 0 };
}

app.post('/api/preparaciones', requireAuth, async (req, res) => {
  try {
    const { nombre, categoria, unidad, rendimiento, ingredientes, notas,
            calcularPromedio, tieneRendimiento, tieneRendAgua, rendAgua,
            tieneRendAire, rendAire, tieneMerma, merma } = req.body;
    const { costoTotal, costoPorUnidad } = calcularCostoPrep(ingredientes, { calcularPromedio, tieneRendAgua, rendAgua, tieneRendAire, rendAire, tieneMerma, merma, rendimiento });
    const rend = parseFloat(rendimiento) || 1;
    const data = {
      nombre: nombre?.trim(), categoria: categoria || '',
      unidad: unidad || 'porción', rendimiento: rend,
      ingredientes: ingredientes || [],
      costoTotal, costoPorUnidad,
      calcularPromedio: !!calcularPromedio,
      tieneRendimiento: !!tieneRendimiento,
      tieneRendAgua: !!tieneRendAgua, rendAgua: parseFloat(rendAgua) || 0,
      tieneRendAire: !!tieneRendAire, rendAire: parseFloat(rendAire) || 0,
      tieneMerma: !!tieneMerma, merma: parseFloat(merma) || 0,
      notas: notas || '', creadoEn: TS(), actualizadoEn: TS()
    };
    const ref = await col(req, 'preparaciones').add(data);
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/preparaciones/:id', requireAuth, async (req, res) => {
  try {
    const { nombre, categoria, unidad, rendimiento, ingredientes, notas,
            calcularPromedio, tieneRendimiento, tieneRendAgua, rendAgua,
            tieneRendAire, rendAire, tieneMerma, merma } = req.body;
    const { costoTotal, costoPorUnidad } = calcularCostoPrep(ingredientes, { calcularPromedio, tieneRendAgua, rendAgua, tieneRendAire, rendAire, tieneMerma, merma, rendimiento });
    const rend = parseFloat(rendimiento) || 1;
    await col(req, 'preparaciones').doc(req.params.id).update({
      nombre: nombre?.trim(), categoria: categoria || '',
      unidad: unidad || 'porción', rendimiento: rend,
      ingredientes: ingredientes || [],
      costoTotal, costoPorUnidad,
      calcularPromedio: !!calcularPromedio,
      tieneRendimiento: !!tieneRendimiento,
      tieneRendAgua: !!tieneRendAgua, rendAgua: parseFloat(rendAgua) || 0,
      tieneRendAire: !!tieneRendAire, rendAire: parseFloat(rendAire) || 0,
      tieneMerma: !!tieneMerma, merma: parseFloat(merma) || 0,
      notas: notas || '', actualizadoEn: TS()
    });

    // Cascade: update all recetas (margenes) that use this preparation
    const margenesSnap = await col(req, 'margenes').get();
    const batch = db.batch();
    const margenUpdates = {};
    for (const doc of margenesSnap.docs) {
      const receta = doc.data();
      const ings = receta.ingredientes || [];
      const hasPrep = ings.some(i => i.tipo === 'preparacion' && i.refId === req.params.id);
      if (!hasPrep) continue;
      const updatedIngs = ings.map(i =>
        (i.tipo === 'preparacion' && i.refId === req.params.id)
          ? { ...i, costoUnitario: costoPorUnidad }
          : i
      );
      const { costoTotal: ct, costoPorcion: cp, margen: mg } = calcularMargen(updatedIngs, receta.porciones, receta.precioVenta);
      batch.update(doc.ref, { ingredientes: updatedIngs, costoTotal: ct, costoPorcion: cp, margen: mg, actualizadoEn: TS() });
      margenUpdates[doc.id] = cp;
    }
    await batch.commit();

    // Cascade también a promociones
    await cascadeToPromociones(req, margenUpdates, { [req.params.id]: costoPorUnidad });

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/preparaciones/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'preparaciones').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/margenes', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'margenes').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/margenes', requireAuth, async (req, res) => {
  try {
    const { nombre, categoria, precioVenta, ingredientes, porciones, notas, categoriaMenuId, categoriaMenu, canales } = req.body;
    const pv = parseFloat(precioVenta) || 0;
    const { costoTotal, costoPorcion, margen } = calcularMargen(ingredientes, porciones, pv);

    const data = {
      nombre: nombre?.trim(),
      categoria: categoria || '',
      precioVenta: pv,
      ingredientes: ingredientes || [],
      porciones: parseFloat(porciones) || 1,
      costoTotal,
      costoPorcion,
      margen,
      notas: notas || '',
      categoriaMenuId: categoriaMenuId || '',
      categoriaMenu: categoriaMenu || '',
      canales: canales || {},
      creadoEn: TS(),
      actualizadoEn: TS()
    };
    const ref = await col(req, 'margenes').add(data);
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/margenes/:id', requireAuth, async (req, res) => {
  try {
    const { nombre, categoria, precioVenta, ingredientes, porciones, notas, categoriaMenuId, categoriaMenu, canales } = req.body;
    const pv = parseFloat(precioVenta) || 0;
    const { costoTotal, costoPorcion, margen } = calcularMargen(ingredientes, porciones, pv);

    await col(req, 'margenes').doc(req.params.id).update({
      nombre: nombre?.trim(),
      categoria: categoria || '',
      precioVenta: pv,
      ingredientes: ingredientes || [],
      porciones: parseFloat(porciones) || 1,
      costoTotal,
      costoPorcion,
      margen,
      notas: notas || '',
      categoriaMenuId: categoriaMenuId || '',
      categoriaMenu: categoriaMenu || '',
      canales: canales || {},
      actualizadoEn: TS()
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/margenes/:id/activo', requireAuth, async (req, res) => {
  try {
    const activo = req.body.activo !== false;
    await col(req, 'margenes').doc(req.params.id).update({ activo, actualizadoEn: TS() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/margenes/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'margenes').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CATEGORÍAS DE CARTA ──────────────────────────────────────────────────────
app.get('/api/categorias-menu', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'categoriasMenu').orderBy('orden').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categorias-menu', requireAuth, async (req, res) => {
  try {
    const nombre = req.body.nombre?.trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const orden = parseInt(req.body.orden) || 0;
    const tipo = req.body.tipo || '';
    const ref = await col(req, 'categoriasMenu').add({ nombre, orden, tipo, creadoEn: TS() });
    res.json({ id: ref.id, nombre, orden, tipo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/categorias-menu/:id', requireAuth, async (req, res) => {
  try {
    const nombre = req.body.nombre?.trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const orden = parseInt(req.body.orden) || 0;
    const tipo = req.body.tipo || '';
    await col(req, 'categoriasMenu').doc(req.params.id).update({ nombre, orden, tipo });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categorias-menu/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'categoriasMenu').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── COMPRAS / EERR ───────────────────────────────────────────────────────────
function sheetUrlToCsvUrl(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('URL de Google Sheets inválida');
  const id = match[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function parseCsv(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function parseChileDate(str) {
  if (!str) return null;
  // formats: DD/MM/YYYY or DD/MM/YYYY HH:MM:SS
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

app.post('/api/sync/compras', requireAuth, async (req, res) => {
  try {
    const infoDoc = await db.collection('clientes').doc(req.clienteId).collection('info').doc('restaurante').get();
    const planillaUrl = infoDoc.data()?.planillaComprasUrl;
    if (!planillaUrl) return res.status(400).json({ error: 'No hay link de planilla configurado en Info Restaurante' });

    const csvUrl = sheetUrlToCsvUrl(planillaUrl);
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error('No se pudo leer la planilla. Verifica que sea pública.');
    const text = await resp.text();

    const rows = parseCsv(text);
    if (rows.length < 2) return res.status(400).json({ error: 'Planilla vacía o sin datos' });

    // Map headers
    const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-záéíóúñ0-9]/gi, ''));
    const idx = name => headers.findIndex(h => h.includes(name));
    const iNro = idx('nro');
    const iTipoDoc = idx('tipodoc');
    const iTipoCompra = idx('tipocompra');
    const iRut = idx('rut');
    const iRazon = idx('razon');
    const iFolio = idx('folio');
    const iTipoGasto = idx('tipogasto') !== -1 ? idx('tipogasto') : idx('gasto');
    const iFecha = idx('fechadocto') !== -1 ? idx('fechadocto') : idx('fecha');
    const iExento = idx('exento');
    const iNeto = idx('neto');
    const iIva = idx('iva');
    const iMonto = headers.findIndex((h, i) => h.includes('monto') && i !== iExento && i !== iNeto);

    // Parse data rows
    const dataRows = rows.slice(1).filter(r => r.some(c => c));
    const periodos = new Set();
    const parsed = [];

    for (const r of dataRows) {
      const fechaStr = r[iFecha] || '';
      const fechaIso = parseChileDate(fechaStr);
      if (!fechaIso) continue;
      const periodo = fechaIso.substring(0, 7); // YYYY-MM
      periodos.add(periodo);
      parsed.push({
        nro: r[iNro] || '',
        tipoDoc: r[iTipoDoc] || '',
        tipoCompra: r[iTipoCompra] || '',
        rutProveedor: r[iRut] || '',
        razonSocial: r[iRazon] || '',
        folio: r[iFolio] || '',
        tipoGasto: r[iTipoGasto] || '',
        fechaDocto: fechaIso,
        periodo,
        montoExento: parseFloat((r[iExento] || '0').replace(/\./g,'').replace(',','.')) || 0,
        montoNeto: parseFloat((r[iNeto] || '0').replace(/\./g,'').replace(',','.')) || 0,
        ivaRecuperable: parseFloat((iIva >= 0 ? r[iIva] : '0').replace(/\./g,'').replace(',','.')) || 0,
        monto: parseFloat((iMonto >= 0 ? r[iMonto] : '0').replace(/\./g,'').replace(',','.')) || 0,
        importadoEn: TS()
      });
    }

    // Delete existing docs for detected periods
    const comprasCol = col(req, 'compras');
    const periodsArr = [...periodos];
    for (const p of periodsArr) {
      const existing = await comprasCol.where('periodo', '==', p).get();
      const delBatch = db.batch();
      existing.docs.forEach(d => delBatch.delete(d.ref));
      if (!existing.empty) await delBatch.commit();
    }

    // Insert new docs in batches of 400
    const chunkSize = 400;
    for (let i = 0; i < parsed.length; i += chunkSize) {
      const batch = db.batch();
      parsed.slice(i, i + chunkSize).forEach(row => {
        batch.set(comprasCol.doc(), row);
      });
      await batch.commit();
    }

    // Save last sync info
    await db.collection('clientes').doc(req.clienteId).collection('info').doc('restaurante').set({
      ultimaSincronizacion: TS(),
      ultimosSincronizados: periodsArr
    }, { merge: true });

    res.json({ ok: true, periodos: periodsArr, total: parsed.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compras', requireAuth, async (req, res) => {
  try {
    const { periodo } = req.query;
    let q = col(req, 'compras');
    if (periodo) q = q.where('periodo', '==', periodo);
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compras/periodos', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'compras').select('periodo').get();
    const periodos = [...new Set(snap.docs.map(d => d.data().periodo))].sort().reverse();
    res.json(periodos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROMOCIONES ──────────────────────────────────────────────────────────────
function calcularPromo(items, precioVenta) {
  const costoTotal     = (items || []).reduce((s, i) => s + (parseFloat(i.costoUnitario) || 0) * (parseFloat(i.cantidad) || 1), 0);
  const precioSeparado = (items || []).reduce((s, i) => s + (parseFloat(i.precioUnitario) || 0) * (parseFloat(i.cantidad) || 1), 0);
  const pv = parseFloat(precioVenta) || 0;
  const pvNeto = pv / 1.19;
  const margen = pvNeto > 0 ? ((pvNeto - costoTotal) / pvNeto) * 100 : 0;
  return { costoTotal, precioSeparado, margen };
}

app.get('/api/promociones', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'promociones').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/promociones', requireAuth, async (req, res) => {
  try {
    const { nombre, precioVenta, items, canales } = req.body;
    const { costoTotal, precioSeparado, margen } = calcularPromo(items, precioVenta);
    const ref = await col(req, 'promociones').add({
      nombre: nombre?.trim(), precioVenta: parseFloat(precioVenta) || 0,
      items: items || [], costoTotal, precioSeparado, margen,
      canales: canales || {},
      creadoEn: TS(), actualizadoEn: TS()
    });
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/promociones/:id', requireAuth, async (req, res) => {
  try {
    const { nombre, precioVenta, items, canales } = req.body;
    const { costoTotal, precioSeparado, margen } = calcularPromo(items, precioVenta);
    await col(req, 'promociones').doc(req.params.id).update({
      nombre: nombre?.trim(), precioVenta: parseFloat(precioVenta) || 0,
      items: items || [], costoTotal, precioSeparado, margen,
      canales: canales || {},
      actualizadoEn: TS()
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/promociones/:id/activo', requireAuth, async (req, res) => {
  try {
    const activo = req.body.activo !== false;
    await col(req, 'promociones').doc(req.params.id).update({ activo, actualizadoEn: TS() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/promociones/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'promociones').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── EERR INGRESOS ────────────────────────────────────────────────────────────
app.get('/api/eerr-ingresos', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'eerrIngresos').get();
    const data = {};
    snap.docs.forEach(d => { data[d.id] = d.data(); });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/eerr-ingresos/:periodo', requireAuth, async (req, res) => {
  try {
    const { ventasBrutas, ventasBrutasConDescuento } = req.body;
    await col(req, 'eerrIngresos').doc(req.params.periodo).set({
      ventasBrutas: parseFloat(ventasBrutas) || 0,
      ventasBrutasConDescuento: parseFloat(ventasBrutasConDescuento) || 0,
      actualizadoEn: TS()
    }, { merge: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ALERTAS ──────────────────────────────────────────────────────────────────
app.get('/api/alertas', requireAuth, async (req, res) => {
  try {
    const { resuelta } = req.query;
    let q = col(req, 'alertas');
    if (resuelta !== undefined) {
      q = q.where('resuelta', '==', resuelta === 'true');
    }
    const snap = await q.limit(200).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Ordenar en memoria para evitar índice compuesto
    items.sort((a, b) => {
      const ta = a.creadoEn?._seconds ?? 0;
      const tb = b.creadoEn?._seconds ?? 0;
      return tb - ta;
    });
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/alertas/:id/resolver', requireAuth, async (req, res) => {
  try {
    await col(req, 'alertas').doc(req.params.id).update({
      resuelta: true,
      resueltaEn: TS(),
      resueltaPor: req.uid
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── INFORMACIÓN RESTAURANTE ──────────────────────────────────────────────────
app.get('/api/info', requireAuth, async (req, res) => {
  try {
    const doc = await db.collection('clientes').doc(req.clienteId).collection('info').doc('restaurante').get();
    res.json(doc.exists ? doc.data() : {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/info', requireAuth, async (req, res) => {
  try {
    const data = {
      nombre: req.body.nombre || '',
      rut: req.body.rut || '',
      direccion: req.body.direccion || '',
      telefono: req.body.telefono || '',
      whatsapp: req.body.whatsapp || '',
      email: req.body.email || '',
      instagram: req.body.instagram || '',
      facebook: req.body.facebook || '',
      sitioWeb: req.body.sitioWeb || '',
      horario: req.body.horario || '',
      concepto: req.body.concepto || '',
      planillaComprasUrl: req.body.planillaComprasUrl || '',
      margenOperacional: parseFloat(req.body.margenOperacional) || 0,
      diasApertura: Array.isArray(req.body.diasApertura) ? req.body.diasApertura : [],
      actualizadoEn: TS()
    };
    await db.collection('clientes').doc(req.clienteId).collection('info').doc('restaurante').set(data, { merge: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/info/plataformas', requireAuth, async (req, res) => {
  try {
    const plataformas = Array.isArray(req.body.plataformas) ? req.body.plataformas : [];
    await db.collection('clientes').doc(req.clienteId).collection('info').doc('restaurante').set(
      { plataformasDelivery: plataformas, actualizadoEn: TS() }, { merge: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── REUNIONES ────────────────────────────────────────────────────────────────
app.get('/api/reuniones', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'reuniones').orderBy('fecha', 'desc').limit(200).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reuniones', requireAuth, async (req, res) => {
  try {
    const { fecha, titulo, temas, compromisos, notas } = req.body;
    if (!fecha) return res.status(400).json({ error: 'fecha es requerida' });
    const data = {
      fecha, titulo: titulo?.trim() || '',
      temas: temas?.trim() || '',
      compromisos: compromisos?.trim() || '',
      notas: notas?.trim() || '',
      creadoEn: TS(), creadoPor: req.uid, creadoPorEmail: req.email
    };
    const ref = await col(req, 'reuniones').add(data);
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/reuniones/:id', requireAuth, async (req, res) => {
  try {
    const { fecha, titulo, temas, compromisos, notas } = req.body;
    await col(req, 'reuniones').doc(req.params.id).update({
      fecha, titulo: titulo?.trim() || '',
      temas: temas?.trim() || '',
      compromisos: compromisos?.trim() || '',
      notas: notas?.trim() || '',
      actualizadoEn: TS()
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reuniones/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'reuniones').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GASTOS FIJOS ─────────────────────────────────────────────────────────────
app.get('/api/gastos-fijos', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'gastosFijos').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gastos-fijos', requireAuth, async (req, res) => {
  try {
    const { nombre, tipo, montos, categoria, notas, monto, frecuencia } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    const data = {
      nombre: nombre.trim(),
      tipo: tipo || 'gasto',
      categoria: categoria?.trim() || '',
      notas: notas?.trim() || '',
      creadoEn: TS(), actualizadoEn: TS()
    };
    // New format: montos map
    if (montos && typeof montos === 'object') {
      data.montos = montos;
    } else {
      // Legacy: convert monto+frecuencia to montos['2026']
      const FREQ = { diario: 30, semanal: 4.33, mensual: 1, bimestral: 0.5, trimestral: 1/3, anual: 1/12 };
      const monthly = (parseFloat(monto) || 0) * (FREQ[frecuencia] || 1);
      const year = String(new Date().getFullYear());
      data.montos = { [year]: Array(12).fill(Math.round(monthly)) };
      data.monto = parseFloat(monto) || 0;
      data.frecuencia = frecuencia || 'mensual';
    }
    const ref = await col(req, 'gastosFijos').add(data);
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/gastos-fijos/:id', requireAuth, async (req, res) => {
  try {
    const { nombre, tipo, montos, categoria, notas, monto, frecuencia } = req.body;
    const update = {
      nombre: nombre?.trim(),
      tipo: tipo || 'gasto',
      categoria: categoria?.trim() || '',
      notas: notas?.trim() || '',
      actualizadoEn: TS()
    };
    if (montos && typeof montos === 'object') {
      update.montos = montos;
    } else {
      const FREQ = { diario: 30, semanal: 4.33, mensual: 1, bimestral: 0.5, trimestral: 1/3, anual: 1/12 };
      const monthly = (parseFloat(monto) || 0) * (FREQ[frecuencia] || 1);
      const year = String(new Date().getFullYear());
      update.montos = { [year]: Array(12).fill(Math.round(monthly)) };
      update.monto = parseFloat(monto) || 0;
      update.frecuencia = frecuencia || 'mensual';
    }
    await col(req, 'gastosFijos').doc(req.params.id).update(update);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/gastos-fijos/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'gastosFijos').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ÁREAS DE INVENTARIO ──────────────────────────────────────────────────────
app.get('/api/areas', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'areas').orderBy('nombre').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/areas', requireAuth, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'nombre requerido' });
    const ref = await col(req, 'areas').add({ nombre: nombre.trim(), creadoEn: TS() });
    res.json({ id: ref.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/areas/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'areas').doc(req.params.id).update({ nombre: req.body.nombre?.trim(), actualizadoEn: TS() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/areas/:id', requireAuth, async (req, res) => {
  try {
    await col(req, 'areas').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
// Lista usuarios con acceso a este cliente
app.get('/api/usuarios', requireAuth, async (req, res) => {
  try {
    const snap = await col(req, 'usuarios').orderBy('creadoEn', 'desc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Agregar usuario por email
app.post('/api/usuarios', requireAuth, async (req, res) => {
  try {
    const { email, rol } = req.body;
    if (!email) return res.status(400).json({ error: 'email requerido' });

    // Buscar usuario en Firebase Auth por email
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email.trim().toLowerCase());
    } catch (e) {
      return res.status(404).json({ error: `No existe una cuenta con el email ${email}. El usuario debe registrarse primero.` });
    }

    // Asignar clienteId claim
    await admin.auth().setCustomUserClaims(userRecord.uid, { clienteId: req.clienteId });

    // Guardar en Firestore
    await col(req, 'usuarios').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName || '',
      rol: rol || 'operador',
      clienteId: req.clienteId,
      agregadoPor: req.email,
      creadoEn: TS()
    });

    res.json({ ok: true, uid: userRecord.uid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cambiar rol de usuario
app.put('/api/usuarios/:uid', requireAuth, async (req, res) => {
  try {
    await col(req, 'usuarios').doc(req.params.uid).update({ rol: req.body.rol, actualizadoEn: TS() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Revocar acceso
app.delete('/api/usuarios/:uid', requireAuth, async (req, res) => {
  try {
    // Quitar claim
    await admin.auth().setCustomUserClaims(req.params.uid, { clienteId: null });
    // Eliminar de Firestore
    await col(req, 'usuarios').doc(req.params.uid).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SUPERADMIN ───────────────────────────────────────────────────────────────
// Listar todos los clientes (solo superadmin)
app.get('/api/superadmin/clientes', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7));
    if (!decoded.superadmin) return res.status(403).json({ error: 'Solo superadmin' });
    const snap = await db.collection('clientes').get();
    const clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(clientes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SETUP (solo en desarrollo) ───────────────────────────────────────────────
// Endpoint para asignar clienteId a un usuario por primera vez
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/setup/assign-client', async (req, res) => {
    try {
      const { uid, clienteId } = req.body;
      if (!uid || !clienteId) return res.status(400).json({ error: 'uid y clienteId requeridos' });
      await admin.auth().setCustomUserClaims(uid, { clienteId });
      res.json({ ok: true, message: `clienteId "${clienteId}" asignado al usuario ${uid}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/setup/make-superadmin', async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) return res.status(400).json({ error: 'uid requerido' });
      await admin.auth().setCustomUserClaims(uid, { superadmin: true });
      res.json({ ok: true, message: `Usuario ${uid} es ahora superadmin` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

// ─── Fallback ─────────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
