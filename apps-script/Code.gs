/**
 * EL DIAMANTE · Sistema de la purificadora
 * App web de Google Apps Script sobre la hoja "EL DIAMANTE 1.0".
 * Escribe en las mismas hojas y columnas que usa AppSheet, así que las dos apps conviven.
 *
 * Instalación: ver la guía que acompaña este archivo. Primer paso: ejecutar la función instalar().
 */

// ======================= CONFIGURACIÓN =======================
const CONFIG = {
  NEGOCIO: 'Purificadora El Diamante',
  CORREO_DUENO: 'oscareduardo1295@gmail.com',
  ZONA: 'America/Mazatlan',
  PLANTA: { lat: 21.479675, lon: -104.870394 },   // ubicación de la planta (punto de salida de la ruta)
  ID_CLIENTE_PLANTA: 'C037',                        // venta de mostrador
  NOMBRE_CLIENTE_PASO: 'CLIENTE DE PASO (RUTA)',    // ventas en ruta a personas que no son clientes registrados
  CAPACIDAD_VIAJE: 55,                              // garrafones máximos por viaje
  COMISION: { 'GARRAFON': 4, 'GALON': 2 },          // por unidad vendida en ruta (igual que tu hoja)
  DIAS_CLIENTE_PERDIDO: 21,                         // sin comprar más de estos días = llamar
  EXIGIR_UBICACION_EN_RUTA: true,                   // la venta en ruta no se guarda sin ubicación (ponlo en false si el celular no la permite)
  DISTANCIA_ALERTA_M: 200,                          // venta registrada a más de estos metros del cliente = marcada en Cuadre del negocio
  LIMITE_CREDITO: 600,                              // fiado máximo por cliente si no tiene LIMITE_CREDITO propio en CLIENTES
  RAFAGA: { ventas: 5, minutos: 10 },               // 5 o más ventas en 10 minutos = capturadas de golpe, no en el cliente
  ROLES_SALIDA: ['PLANTA', 'DUENO'],                // quién registra salidas y regresos (el repartidor no)
  PRECIOS_DESDE: '2026-10-06',                      // Control compara contra el precio vigente solo desde esta fecha (último cambio de precios)
  RADIO_SUGERENCIAS_KM: 3,                          // clientes cercanos para dejar lo que sobra
  RADIO_GEOCODIFICAR_KM: 40,                        // una dirección encontrada más lejos de esto se ignora
  AVISAR_PEDIDOS_A: 'RUTA',                         // a quién le suena la campana con cada pedido nuevo
  AVISAR_PEDIDOS_POR_CORREO: true,                  // te llega un correo con cada pedido nuevo
  HORA_REPORTE_DIARIO: 21,                          // 9 pm: correo con el resumen del día
  CATEGORIAS_GASTO: ['GASOLINA', 'SUELDO', 'RENTA', 'LUZ', 'AGUA', 'REFACCIONES', 'REPARACIONES', 'FILTROS Y QUIMICOS', 'EPP', 'LIMPIEZA', 'PUBLICIDAD', 'CREDITO MOTO', 'INTERNET', 'TELEFONO', 'OTRO'],
  INSUMOS: ['GARRAFON', 'GALON', 'BOTELLA 1 LT', 'BOTELLA 1/2 LT', 'TAPAS', 'SELLOS', 'ETIQUETAS'],
  PUNTOS_CALIDAD: ['AGUA CRUDA', 'DESPUES DE FILTROS', 'LLENADORA', 'PRODUCTO TERMINADO'],
};

// Hojas que la app agrega (no toca las de AppSheet)
const HOJAS_NUEVAS = {
  USUARIOS_APP: ['NOMBRE', 'PIN', 'ROL', 'ID_TRABAJADOR', 'ACTIVO'],
  PEDIDOS: ['ID_PEDIDO', 'FECHA_PEDIDO', 'ID_CLIENTE', 'NOMBRE', 'TELEFONO', 'DIRECCION', 'GARRAFONES', 'GALONES', 'FECHA_ENTREGA', 'NOTAS', 'ESTATUS', 'ID_VENTA', 'ATENDIO'],
  LOG_APP: ['FECHA_HORA', 'USUARIO', 'ACCION', 'DETALLE'],
  AVISOS: ['ID_AVISO', 'FECHA_HORA', 'DE', 'ROL_DE', 'PARA', 'TIPO', 'MENSAJE', 'ESTATUS', 'LEIDO_POR', 'ATENDIO', 'FECHA_ATENDIDO'],
  AGENDA: ['ID', 'ACTIVIDAD', 'TIPO', 'FECHA', 'REPETIR', 'AVISAR_DIAS_ANTES', 'ESTATUS', 'HECHO_EL', 'COSTO', 'NOTA'],
  SEPARADOR: ['CONCEPTO', 'FORMA', 'MONTO', 'NOTA'],
  VERIFICACIONES: ['ID', 'FECHA', 'TIPO', 'ID_MOV', 'CLIENTE', 'MONTO', 'REGISTRO', 'ESTATUS', 'REVISO', 'FECHA_REVISION'],
  PUSH: ['ID', 'USUARIO', 'ROL', 'ENDPOINT', 'AVISOS', 'PEDIDOS', 'VENTAS', 'CREADO', 'ULTIMO'],
};

// Lo que se separa cada día (se puede cambiar en la hoja SEPARADOR). FORMA: DIARIO, POR GARRAFON, POR GALON, PORCENTAJE o COMISION.
const SEPARADOR_INICIAL = [
  ['Comisión del repartidor', 'COMISION', 0, 'Se calcula sola: $4 por garrafón y $2 por galón vendidos en ruta'],
  ['Tapas, etiquetas y sellos', 'POR GARRAFON', 1.7, 'Tapa $0.36 + etiqueta $1.30'],
  ['Reposición de garrafones rotos', 'POR GARRAFON', 0.3, 'Garrafón nuevo cuesta ~$76'],
  ['Reposición de galones', 'POR GALON', 6.5, 'Galón vacío a $6.50'],
  ['Sueldos de planta', 'DIARIO', 435, '$11,300 al mes entre 26 días de trabajo'],
  ['Crédito de la moto', 'DIARIO', 300, '$3,901 el 15 y el 30'],
  ['Renta', 'DIARIO', 182, '$4,725 al mes'],
  ['Luz', 'DIARIO', 123, '$6,400 cada dos meses'],
  ['Agua', 'DIARIO', 67, '$1,750 al mes'],
  ['Internet', 'DIARIO', 16, '$420 al mes'],
  ['Gasolina', 'DIARIO', 85, 'Unos $2,200 al mes'],
  ['Mantenimiento (refacciones, fumigación, servicio de moto)', 'DIARIO', 160, 'Unos $4,200 al mes'],
];

const PRODUCTOS_VENTA = ['GARRAFON', 'GALON', 'BOTELLA 1 LT', 'BOTELLA 1/2 LT', 'HIELO', 'GALONCAMB'];

// ======================= ENTRADA WEB =======================
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.p === 'pedido') {
    const t = HtmlService.createTemplateFromFile('Pedido');
    t.clienteId = String(p.c || '');
    return t.evaluate()
      .setTitle('Pedido · ' + CONFIG.NEGOCIO)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p.p === 'cuenta') {
    return HtmlService.createHtmlOutput(cuentaHTML_(String(p.c || '')))
      .setTitle('Mi cuenta · ' + CONFIG.NEGOCIO)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.NEGOCIO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ======================= UTILIDADES =======================
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function hoja_(nombre) {
  const h = ss_().getSheetByName(nombre);
  if (!h) throw new Error('No existe la hoja ' + nombre);
  return h;
}
function norm_(s) { return String(s == null ? '' : s).trim(); }
function up_(s) { return norm_(s).toUpperCase(); }
function num_(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function id_() {
  // siempre con letras: un id solo de números (o tipo 12e34567) Sheets lo convierte en número
  let s; do { s = Utilities.getUuid().replace(/-/g, '').slice(0, 8); } while (/^\d*e?\d*$/i.test(s));
  return s;
}
function r2_(n) { return Math.round(n * 100) / 100; }

function aFecha_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 864e5));
  const s = norm_(v);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}
function diaKey_(d) { d = aFecha_(d); return d ? Utilities.formatDate(d, CONFIG.ZONA, 'yyyy-MM-dd') : ''; }
function hoyKey_() { return Utilities.formatDate(new Date(), CONFIG.ZONA, 'yyyy-MM-dd'); }
function fechaDeKey_(k) { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function sumaDias_(k, n) { const d = fechaDeKey_(k); d.setDate(d.getDate() + n); return Utilities.formatDate(d, CONFIG.ZONA, 'yyyy-MM-dd'); }
/** El dueño puede registrar con fecha pasada (hasta 120 días); los demás, siempre hoy. */
function fechaMov_(u, fecha) {
  const hoy = hoyKey_();
  const k = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? String(fecha) : '';
  if (!k || u.rol !== 'DUENO' || k === hoy) return fechaDeKey_(hoy);
  if (k > hoy) throw new Error('La fecha no puede ser futura.');
  if (difDias_(hoy, k) > 120) throw new Error('La fecha es demasiado vieja (máximo 120 días).');
  return fechaDeKey_(k);
}
function difDias_(a, b) { return Math.round((fechaDeKey_(a) - fechaDeKey_(b)) / 864e5); }

/** Lee una hoja como lista de objetos usando los encabezados de la fila 1. */
function leer_(nombre) {
  const h = ss_().getSheetByName(nombre);
  if (!h) return [];
  const v = h.getDataRange().getValues();
  if (v.length < 2) return [];
  const enc = v[0].map(norm_);
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (norm_(v[i][0]) === '') continue;
    const o = { _fila: i + 1 };
    enc.forEach((k, j) => { if (k) o[k] = v[i][j]; });
    out.push(o);
  }
  return out;
}

/** Escribe un registro en la primera fila vacía (columna A vacía), respetando fórmulas de la fila. */
function escribir_(nombre, obj, formulas) {
  const h = hoja_(nombre);
  const nCol = h.getLastColumn();
  const enc = h.getRange(1, 1, 1, nCol).getValues()[0].map(norm_);
  const colA = h.getRange(1, 1, Math.max(h.getLastRow(), 1), 1).getValues();
  let fila = colA.length + 1;
  for (let i = 1; i < colA.length; i++) { if (norm_(colA[i][0]) === '') { fila = i + 1; break; } }
  const rango = h.getRange(fila, 1, 1, nCol);
  const f = rango.getFormulas()[0], val = rango.getValues()[0];
  const fila_ = enc.map((k, j) => (f[j] ? f[j] : val[j]));
  enc.forEach((k, j) => {
    if (obj.hasOwnProperty(k)) fila_[j] = obj[k];
    if (formulas && formulas[k]) fila_[j] = formulas[k](fila);
  });
  rango.setValues([fila_]);
  return fila;
}

function actualizar_(nombre, fila, cambios) {
  const h = hoja_(nombre);
  const enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(norm_);
  Object.keys(cambios).forEach(k => {
    const j = enc.indexOf(k);
    if (j >= 0) h.getRange(fila, j + 1).setValue(cambios[k]);
  });
}

function conLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function log_(usuario, accion, detalle) {
  try {
    escribir_('LOG_APP', { FECHA_HORA: new Date(), USUARIO: usuario, ACCION: accion, DETALLE: typeof detalle === 'string' ? detalle : JSON.stringify(detalle) });
  } catch (e) { /* el registro nunca debe frenar una venta */ }
}

// ======================= USUARIOS Y SESIÓN =======================
function apiLogin(pin) {
  pin = norm_(pin);
  const cache = CacheService.getScriptCache();
  const fallos = num_(cache.get('fallos'));
  if (fallos >= 15) throw new Error('Demasiados intentos. Espera 10 minutos.');
  const u = leer_('USUARIOS_APP').find(x => norm_(x.PIN) === pin && up_(x.ACTIVO) !== 'NO');
  if (!pin || !u) {
    cache.put('fallos', String(fallos + 1), 600);
    throw new Error('PIN incorrecto');
  }
  const user = { nombre: norm_(u.NOMBRE), rol: up_(u.ROL) || 'RUTA', idTrabajador: norm_(u.ID_TRABAJADOR) };
  const token = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  const dias = user.rol === 'DUENO' ? 30 : 1;
  props.setProperty('t_' + token, JSON.stringify({ u: user, exp: Date.now() + dias * 864e5 }));
  limpiarSesiones_();
  log_(user.nombre, 'ENTRÓ', user.rol);
  return { token: token, user: user };
}

function apiLogout(token) {
  PropertiesService.getScriptProperties().deleteProperty('t_' + token);
  return true;
}

function sesion_(token, soloDueno) {
  const raw = token && PropertiesService.getScriptProperties().getProperty('t_' + token);
  if (!raw) throw new Error('SESION');
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) { PropertiesService.getScriptProperties().deleteProperty('t_' + token); throw new Error('SESION'); }
  if (soloDueno && s.u.rol !== 'DUENO') throw new Error('Solo el dueño puede ver esto.');
  return s.u;
}

function limpiarSesiones_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf('t_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < Date.now()) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

// ======================= DATOS BASE =======================
/** Tipo de ficha según el prefijo del nombre: "-GL- ABARROTES BARBA" es la ficha de galón de ABARROTES BARBA. */
function fichaDe_(nombre) {
  const n = up_(nombre);
  const m = n.match(/^-\s*([^-]+?)\s*-\s*(.+)$/);
  if (!m) return { base: n, producto: null };
  const pre = m[1].replace(/\s/g, '');
  const prod = pre === 'GL' ? 'GALON' : (pre === '1LT' ? 'BOTELLA 1 LT' : (pre === '1/2LT' ? 'BOTELLA 1/2 LT' : null));
  return { base: m[2].trim(), producto: prod };
}

function ubic_(s) {
  const m = norm_(s).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (Math.abs(lat) < 1 || Math.abs(lon) < 1) return null;
  return { lat: lat, lon: lon };
}

function km_(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLa = (b.lat - a.lat) * rad, dLo = (b.lon - a.lon) * rad;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Carga todo lo necesario y agrupa las fichas de un mismo cliente. */
function base_() {
  const clientes = leer_('CLIENTES');
  const ventas = leer_('VENTAS');
  const abonos = leer_('ABONOS');
  const productos = {};
  leer_('PRODUCTOS').forEach(p => { productos[up_(p.ID_PRODUCTO)] = num_(p.PRECIO); });

  // agrupar fichas por nombre base
  const grupos = {}; const grupoDe = {};
  clientes.forEach(c => {
    const id = norm_(c.ID_CLIENTE);
    const f = fichaDe_(c.NOMBRE);
    const g = grupos[f.base] || (grupos[f.base] = { base: f.base, principal: null, fichas: {}, ids: [] });
    g.ids.push(id);
    if (f.producto) g.fichas[f.producto] = id; else if (!g.principal) g.principal = c;
    grupoDe[id] = g;
  });
  Object.keys(grupos).forEach(k => {
    const g = grupos[k];
    if (!g.principal) g.principal = clientes.find(c => norm_(c.ID_CLIENTE) === g.ids[0]);
  });

  // historial por grupo
  const hist = {}; // base -> {dias:{key:{g,gl}}, precios:{prod:[{fecha,pu,id}]}, credito, ultima}
  ventas.forEach(v => {
    const g = grupoDe[norm_(v.ID_CLIENTE)];
    if (!g) return;
    const h = hist[g.base] || (hist[g.base] = { dias: {}, precios: {}, credito: 0, abonos: 0 });
    const k = diaKey_(v.FECHA); if (!k) return;
    const prod = up_(v.PRODUCTO);
    const d = h.dias[k] || (h.dias[k] = { g: 0, gl: 0, otros: 0 });
    if (prod === 'GARRAFON') d.g += num_(v.CANTIDAD); else if (prod === 'GALON') d.gl += num_(v.CANTIDAD); else d.otros += num_(v.CANTIDAD);
    const pu = num_(v['P.U.']);
    if (pu > 0) (h.precios[prod] || (h.precios[prod] = [])).push({ k: k, pu: pu, id: norm_(v.ID_CLIENTE) });
    if (up_(v.METODO) === 'CREDITO') h.credito += num_(v.TOTAL);
  });
  abonos.forEach(a => {
    const g = grupoDe[norm_(a.ID_CLIENTE)];
    if (!g) return;
    const h = hist[g.base] || (hist[g.base] = { dias: {}, precios: {}, credito: 0, abonos: 0 });
    h.abonos += num_(a.MONTO);
  });

  return { clientes: clientes, ventas: ventas, abonos: abonos, productos: productos, grupos: grupos, grupoDe: grupoDe, hist: hist };
}

/**
 * Precio que se le cobra a un cliente: el PRECIO ESPECIAL vigente de su ficha (así un aumento aplica al instante).
 * Si la ficha no tiene precio: el último que pagó; si nunca lo compró, el de lista.
 */
function precio_(B, g, prod) {
  if (esPaso_(g)) return B.productos[prod] || 0;
  const fichaId = g.fichas[prod];
  if (fichaId) {
    const f = B.clientes.find(c => norm_(c.ID_CLIENTE) === fichaId);
    if (f && num_(f['PRECIO ESPECIAL']) > 0) return num_(f['PRECIO ESPECIAL']);
  }
  if (prod === 'GARRAFON' && num_(g.principal['PRECIO ESPECIAL']) > 0) return num_(g.principal['PRECIO ESPECIAL']);
  const h = B.hist[g.base];
  const lista = ((h && h.precios[prod]) || []).slice();
  if (lista.length) { lista.sort((a, b) => (a.k < b.k ? -1 : 1)); return lista[lista.length - 1].pu; }
  return B.productos[prod] || 0;
}

/** A qué ficha se registra la venta de un producto (para que tu AppSheet siga viendo lo mismo). */
function fichaVenta_(B, g, prod) {
  if (g.fichas[prod]) return g.fichas[prod];
  if (prod === 'GARRAFON') return norm_(g.principal.ID_CLIENTE);
  const h = B.hist[g.base];
  const lista = ((h && h.precios[prod]) || []).slice().sort((a, b) => (a.k < b.k ? -1 : 1));
  if (lista.length) return lista[lista.length - 1].id;
  return g.fichas[prod] || norm_(g.principal.ID_CLIENTE);
}

let SECRETO_ = null;
/** Código de la liga de pedidos de cada cliente: su ID más una clave que no se puede adivinar. */
function codigoCliente_(id) {
  if (SECRETO_ === null) SECRETO_ = PropertiesService.getScriptProperties().getProperty('secreto') || '';
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id + '|' + SECRETO_);
  return id + '-' + d.slice(0, 4).map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}
function idDeCodigo_(codigo) {
  codigo = norm_(codigo);
  const i = codigo.lastIndexOf('-');
  if (i < 1) return '';
  const id = codigo.slice(0, i);
  return codigoCliente_(id) === codigo ? id : '';
}

function saldo_(B, g) { const h = B.hist[g.base]; return h ? r2_(h.credito - h.abonos) : 0; }

function resumenCliente_(B, g, hoy, sinHoy) {
  const c = g.principal;
  const h = B.hist[g.base] || { dias: {}, precios: {} };
  const dias = Object.keys(h.dias).filter(k => !sinHoy || k < hoy).sort();
  const inter = [];
  for (let i = 1; i < dias.length; i++) inter.push(difDias_(dias[i], dias[i - 1]));
  inter.sort((a, b) => a - b);
  const frecuencia = inter.length ? inter[Math.floor((inter.length - 1) / 2)] : null;
  const ultima = dias.length ? dias[dias.length - 1] : null;
  const vis = dias.map(k => h.dias[k]);
  const promG = vis.filter(d => d.g > 0);
  const promGl = vis.filter(d => d.gl > 0);
  const precios = {};
  PRODUCTOS_VENTA.forEach(p => { precios[p] = precio_(B, g, p); });
  return {
    id: norm_(c.ID_CLIENTE), nombre: g.base, telefono: norm_(c.TELEFONO).replace(/\.0$/, ''), direccion: norm_(c.DIRECCION),
    ubicacion: ubic_(c.UBICACION), estatus: up_(c.ESTATUS_CLIENTE) || 'ACTIVO', ids: g.ids, codigoPedido: codigoCliente_(norm_(c.ID_CLIENTE)),
    saldo: saldo_(B, g), limite: limiteCredito_(g), precios: precios, visitas: dias.length, frecuencia: frecuencia, ultima: ultima,
    diasDesde: ultima ? difDias_(hoy, ultima) : null,
    promGarrafon: promG.length ? Math.round(promG.reduce((s, d) => s + d.g, 0) / promG.length) : 0,
    promGalon: promGl.length ? Math.round(promGl.reduce((s, d) => s + d.gl, 0) / promGl.length) : 0,
    compraHoy: !!h.dias[hoy],
  };
}

function listaClientes_(B, hoy) {
  return Object.keys(B.grupos).map(k => resumenCliente_(B, B.grupos[k], hoy))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Ficha única para ventas de paso en ruta. Se crea sola la primera vez. */
function idClientePaso_() {
  const cl = leer_('CLIENTES');
  const c = cl.find(x => up_(x.NOMBRE) === CONFIG.NOMBRE_CLIENTE_PASO);
  if (c) return norm_(c.ID_CLIENTE);
  return conLock_(() => {
    const cl2 = leer_('CLIENTES');
    const c2 = cl2.find(x => up_(x.NOMBRE) === CONFIG.NOMBRE_CLIENTE_PASO);
    if (c2) return norm_(c2.ID_CLIENTE);
    let max = 0;
    cl2.forEach(x => { const m = norm_(x.ID_CLIENTE).match(/^C(\d+)$/); if (m) max = Math.max(max, +m[1]); });
    const id = 'C' + String(max + 1).padStart(3, '0');
    const precios = {}; leer_('PRODUCTOS').forEach(p => { precios[up_(p.ID_PRODUCTO)] = num_(p.PRECIO); });
    escribir_('CLIENTES', { 'ID_CLIENTE': id, 'NOMBRE': CONFIG.NOMBRE_CLIENTE_PASO, 'PRECIO ESPECIAL': precios.GARRAFON || 25, 'ESTATUS_CLIENTE': 'ACTIVO' },
      { 'SALDO PENDIENTE': r => '=SUMIFS(VENTAS!F:F, VENTAS!C:C, A' + r + ', VENTAS!H:H, "CREDITO") - SUMIF(ABONOS!C:C, A' + r + ', ABONOS!D:D)' });
    return id;
  });
}
const esPaso_ = g => g && g.base === CONFIG.NOMBRE_CLIENTE_PASO;

// ======================= INICIO (datos para la app) =======================
function apiInicio(token) {
  const u = sesion_(token);
  const idPaso = idClientePaso_();
  const hoy = hoyKey_();
  const B = base_();
  const clientes = listaClientes_(B, hoy);
  const pedidos = pedidosPendientes_();
  const vHoy = B.ventas.filter(v => diaKey_(v.FECHA) === hoy);
  const aHoy = B.abonos.filter(a => diaKey_(a.FECHA) === hoy);
  return {
    user: u, hoy: hoy, negocio: CONFIG.NEGOCIO,
    resumenHoy: {
      ventas: r2_(vHoy.reduce((s, v) => s + num_(v.TOTAL), 0)),
      garrafones: vHoy.filter(v => up_(v.PRODUCTO) === 'GARRAFON').reduce((s, v) => s + num_(v.CANTIDAD), 0),
      galones: vHoy.filter(v => up_(v.PRODUCTO) === 'GALON').reduce((s, v) => s + num_(v.CANTIDAD), 0),
      cobrado: r2_(aHoy.reduce((s, a) => s + num_(a.MONTO), 0)),
      clientes: new Set(vHoy.map(v => norm_(v.ID_CLIENTE))).size,
    },
    clientes: clientes,
    pedidos: pedidos,
    productos: PRODUCTOS_VENTA.map(p => ({ id: p, nombre: p === 'GALONCAMB' ? 'CAMBIO DE GALÓN' : p, precio: B.productos[p] || 0 })),
    categoriasGasto: CONFIG.CATEGORIAS_GASTO,
    insumos: CONFIG.INSUMOS,
    puntosCalidad: CONFIG.PUNTOS_CALIDAD,
    idPlanta: CONFIG.ID_CLIENTE_PLANTA,
    idPaso: idPaso,
    linkPedidos: urlApp_() + '?p=pedido',
    linkCuenta: urlApp_() + '?p=cuenta&c=',
    puedeSalida: CONFIG.ROLES_SALIDA.indexOf(u.rol) >= 0,
    porConfirmar: u.rol === 'DUENO' ? (function () { try { return verificacionesPendientes_().length; } catch (e) { return 0; } })() : 0,
    carga: cargaHoy_(),
    exigirUbicacion: CONFIG.EXIGIR_UBICACION_EN_RUTA,
    salidasHoy: (function () {
      const reg = leer_('REGRESO A PLANTA').filter(r => diaKey_(r.FECHA) === hoy);
      return leer_('SALIDA A RUTA').filter(s => diaKey_(s.FECHA) === hoy).map(s => {
        const r = reg.find(x => norm_(x.ID_SALIDA) === norm_(s.ID_SALIDA));
        return {
          id: norm_(s.ID_SALIDA), ruta: s['RUTA #'], garrafon: num_(s.GARRAFON), galon: num_(s.GALON),
          hora: s.HORA instanceof Date ? Utilities.formatDate(s.HORA, CONFIG.ZONA, 'HH:mm') : norm_(s.HORA),
          regreso: r ? { vacios: num_(r['GARRAFONES VACIOS']), llenos: num_(r['GARRAFONES LLENOS REGRESO']), galones: num_(r['GALONES']), rotos: num_(r['GARRAFONES ROTOS']) } : null
        };
      });
    })(),
    prestamo: u.rol !== 'DUENO' && u.idTrabajador ? (function () { try { const t = prestamos_(hoy).find(x => x.id === u.idTrabajador); return t && (t.saldo > 0 || t.descontadoHoy) ? { saldo: t.saldo, descuento: t.descuento, descontadoHoy: t.descontadoHoy } : null; } catch (e) { return null; } })() : null,
    vendidoPor: (function () { try { return ventasPorVendedor_(hoy); } catch (e) { return []; } })(),
    envases: u.rol === 'DUENO' || u.rol === 'PLANTA' ? (function () { try { return envases_(7); } catch (e) { return []; } })() : null,
    agenda: u.rol === 'DUENO' ? (function () { try { return agendaPendientes_().filter(a => a.faltan != null && a.faltan <= Math.max(a.avisar, 7)).slice(0, 4).map(limpia_); } catch (e) { return []; } })() : [],
  };
}

function urlApp_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

// ======================= RUTA AUTOMÁTICA =======================
function apiRuta(token, cual) {
  sesion_(token);
  if (cual === 'manana') {
    let d = sumaDias_(hoyKey_(), 1);
    if (fechaDeKey_(d).getDay() === 0) d = sumaDias_(d, 1); // domingo no hay ruta
    return calcularRuta_(d);
  }
  return calcularRuta_(hoyKey_());
}

/** Ventas de ruta de hoy con su ubicación y hora, en el orden en que se hicieron. */
function apiVendidoHoy(token) {
  const u = sesion_(token);
  const hoy = hoyKey_();
  return leer_('LOG_APP').filter(l => up_(l.ACCION) === 'VENTA' && diaKey_(l.FECHA_HORA) === hoy).map(l => {
    let d = {}; try { d = JSON.parse(norm_(l.DETALLE)); } catch (e) {}
    return { hora: d.hora || '', cliente: d.cliente || '', lat: +d.lat, lon: +d.lon, garrafones: num_(d.garrafones), items: d.items || [], total: u.rol === 'DUENO' ? num_(d.total) : null, quien: norm_(l.USUARIO) };
  }).filter(v => isFinite(v.lat) && isFinite(v.lon) && Math.abs(v.lat) > 1 && Math.abs(v.lon) > 1).sort((a, b) => a.hora < b.hora ? -1 : 1);
}

function calcularRuta_(dia) {
  try { clientesParaPedidos_(); } catch (e) {}
  const B = base_();
  const P = CONFIG.PLANTA;
  const pedidos = pedidosPendientes_().filter(p => !p.fechaEntrega || p.fechaEntrega <= dia);
  const pedidoDe = {};
  pedidos.forEach(p => { if (p.idCliente) pedidoDe[p.idCliente] = p; });

  const paradas = [], llamar = [], sinUbicacion = [], proximos = [], nuevosPedido = [];
  let geocodificados = 0;
  Object.keys(B.grupos).forEach(k => {
    const g = B.grupos[k];
    const c = resumenCliente_(B, g, dia, true);
    if (c.id === CONFIG.ID_CLIENTE_PLANTA || c.estatus === 'INACTIVO' || esPaso_(g)) return;
    const ped = g.ids.map(i => pedidoDe[i]).find(Boolean);
    let toca = false, atraso = null;
    if (c.frecuencia && c.ultima) {
      atraso = c.diasDesde - c.frecuencia;
      toca = c.visitas >= 3 && atraso >= 0 && c.diasDesde <= CONFIG.DIAS_CLIENTE_PERDIDO;
      if (c.visitas >= 2 && c.diasDesde > CONFIG.DIAS_CLIENTE_PERDIDO) llamar.push({ id: c.id, nombre: c.nombre, telefono: c.telefono, diasDesde: c.diasDesde, frecuencia: c.frecuencia });
      else if (!toca && atraso >= -2 && atraso < 0) proximos.push({ id: c.id, nombre: c.nombre, enDias: -atraso });
    }
    if (!toca && !ped) return;
    const parada = {
      id: c.id, nombre: c.nombre, telefono: c.telefono, direccion: c.direccion, saldo: c.saldo,
      garrafones: ped ? num_(ped.garrafones) : c.promGarrafon, galones: ped ? num_(ped.galones) : c.promGalon,
      atraso: atraso, diasDesde: c.diasDesde, frecuencia: c.frecuencia, pedido: ped || null, temprano: !!(ped && /MA[ÑN]ANA|PRIMER|TEMPRANO|URGENT/i.test(ped.notas || '')),
      visitado: c.compraHoy, lat: c.ubicacion && c.ubicacion.lat, lon: c.ubicacion && c.ubicacion.lon,
    };
    if (!c.ubicacion && c.direccion && geocodificados < 12) {
      geocodificados++;
      const pt = geocodificar_(c.direccion);
      if (pt) {
        parada.lat = pt.lat; parada.lon = pt.lon; parada.aprox = true;
        try { conLock_(() => actualizar_('CLIENTES', g.principal._fila, { 'UBICACION': pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6) })); marcarAprox_(c.id); } catch (e) {}
        c.ubicacion = pt;
      }
    } else if (c.ubicacion && esAprox_(c.id)) parada.aprox = true;
    if (!c.ubicacion || km_(c.ubicacion, P) < 0.02) sinUbicacion.push(parada); else paradas.push(parada);
  });
  // pedidos de personas que aún no son clientes
  pedidos.filter(p => !p.idCliente).forEach(p => nuevosPedido.push(p));

  const viajes = armarViajes_(paradas, P, CONFIG.CAPACIDAD_VIAJE);
  return {
    dia: dia, planta: CONFIG.PLANTA, viajes: viajes, sinUbicacion: sinUbicacion, llamar: llamar.sort((a, b) => b.diasDesde - a.diasDesde),
    proximos: proximos, pedidosNuevos: nuevosPedido,
    totalGarrafones: paradas.concat(sinUbicacion).reduce((s, p) => s + p.garrafones, 0),
    totalGalones: paradas.concat(sinUbicacion).reduce((s, p) => s + p.galones, 0),
  };
}

function esTemprano_(p) { return !!(p.pedido && /MA[ÑN]ANA|PRIMER|TEMPRANO|URGENT/i.test(p.pedido.notas || '')); }

/** Reparte por zona (barrido alrededor de la planta) en viajes con tope de garrafones y ordena cada viaje por cercanía. */
function armarViajes_(paradas, P, cap) {
  if (!paradas.length) return [];
  const ang = p => Math.atan2(p.lat - P.lat, p.lon - P.lon);
  const orden = paradas.slice().sort((a, b) => ang(a) - ang(b));
  const largo = t => { const pts = [P].concat(t, [P]); let s = 0; for (let i = 1; i < pts.length; i++) s += km_(pts[i - 1], pts[i]); return s; };
  const optimizar = pts => {
    const rest = pts.slice(); let cur = P; let t = [];
    while (rest.length) {
      let bi = 0; for (let i = 1; i < rest.length; i++) if (km_(cur, rest[i]) < km_(cur, rest[bi])) bi = i;
      cur = rest.splice(bi, 1)[0]; t.push(cur);
    }
    let mejoro = true, vueltas = 0;
    while (mejoro && vueltas++ < 50) {
      mejoro = false;
      for (let i = 0; i < t.length - 1; i++) for (let j = i + 1; j < t.length; j++) {
        const nt = t.slice(0, i).concat(t.slice(i, j + 1).reverse(), t.slice(j + 1));
        if (largo(nt) < largo(t) - 1e-9) { t = nt; mejoro = true; }
      }
    }
    return t;
  };
  let mejor = null;
  for (let s = 0; s < orden.length; s++) {
    const rot = orden.slice(s).concat(orden.slice(0, s));
    const viajes = [[]]; let carga = 0;
    rot.forEach(p => {
      const pedidoObligado = !!p.pedido;
      if (carga + p.garrafones > cap && viajes[viajes.length - 1].length && !pedidoObligado) { viajes.push([]); carga = 0; }
      viajes[viajes.length - 1].push(p); carga += p.garrafones;
    });
    const ord = viajes.map(optimizar);
    const total = ord.reduce((s2, t) => s2 + largo(t), 0);
    if (!mejor || ord.length < mejor.n || (ord.length === mejor.n && total < mejor.km)) mejor = { n: ord.length, km: total, viajes: ord };
  }
  // pedidos marcados "por la mañana", "primera" o "urgente" van al inicio de su viaje, y ese viaje va primero
  mejor.viajes = mejor.viajes.map(t => t.filter(esTemprano_).concat(t.filter(p => !esTemprano_(p))));
  const peso = t => t.reduce((s, p) => s + (p.pedido ? 100 : 0) + (esTemprano_(p) ? 10000 : 0) + Math.max(0, p.atraso || 0), 0);
  return mejor.viajes.sort((a, b) => peso(b) - peso(a)).map(t => ({
    km: r2_(largo(t)), garrafones: t.reduce((s, p) => s + p.garrafones, 0), galones: t.reduce((s, p) => s + p.galones, 0),
    paradas: t,
    mapa: 'https://www.google.com/maps/dir/' + [P].concat(t, [P]).map(p => p.lat.toFixed(6) + ',' + p.lon.toFixed(6)).join('/'),
  }));
}

// ======================= VENTAS =======================
/**
 * data = { idCliente, items:[{producto, cantidad, precio?}], metodo, idPedido?, nota? }
 * Si el usuario no es dueño, el precio lo pone el sistema (no se puede cambiar en ruta).
 */
function apiVenta(token, data) {
  const u = sesion_(token);
  const cache = CacheService.getScriptCache();
  const idLocal = norm_(data.idLocal).slice(0, 40);
  if (idLocal) { const ya = cache.get('vl_' + idLocal); if (ya) return JSON.parse(ya); } // ya se había guardado (reintento)
  const res = conLock_(() => {
    const B = base_();
    const g = B.grupoDe[norm_(data.idCliente)];
    if (!g) throw new Error('Cliente no encontrado');
    const metodo = up_(data.metodo);
    if (['EFECTIVO', 'TRANSFERENCIA', 'CREDITO'].indexOf(metodo) < 0) throw new Error('Método de pago inválido');
    if (metodo === 'CREDITO' && (esPaso_(g) || norm_(g.principal.ID_CLIENTE) === CONFIG.ID_CLIENTE_PLANTA)) throw new Error('No se puede fiar a un cliente de paso ni en mostrador.');
    const hoy = fechaDeKey_(hoyKey_());
    const esRuta = norm_(g.principal.ID_CLIENTE) !== CONFIG.ID_CLIENTE_PLANTA;
    const ub = data.ubicacion || {};
    const tieneUb = isFinite(ub.lat) && isFinite(ub.lon) && Math.abs(ub.lat) > 1 && Math.abs(ub.lon) > 1;
    if (esRuta && CONFIG.EXIGIR_UBICACION_EN_RUTA && u.rol !== 'DUENO' && !tieneUb) throw new Error('Activa la ubicación del celular para guardar la venta en ruta.');
    const ubStr = tieneUb ? Number(ub.lat).toFixed(6) + ', ' + Number(ub.lon).toFixed(6) : '';
    const ubCli = ubic_(g.principal.UBICACION);
    const aprox = esAprox_(norm_(g.principal.ID_CLIENTE));
    const distancia = tieneUb && ubCli && !aprox && !esPaso_(g) ? Math.round(km_({ lat: +ub.lat, lon: +ub.lon }, ubCli) * 1000) : null;
    const dueno = u.rol === 'DUENO';
    // venta guardada en el celular sin señal: se respeta la hora en que se hizo (solo del mismo día)
    let capturada = new Date(), diferida = false;
    const cap = num_(data.capturada);
    if (cap && cap < Date.now() && Date.now() - cap < 864e5 && diaKey_(new Date(cap)) === hoyKey_()) { capturada = new Date(cap); diferida = Date.now() - cap > 120000; }
    // ---- candados antes de guardar ----
    const pedidos = {};
    (data.items || []).forEach(it => { const p = up_(it.producto), q = Math.round(num_(it.cantidad)); if (PRODUCTOS_VENTA.indexOf(p) >= 0 && q > 0) pedidos[p] = (pedidos[p] || 0) + q; });
    if (!Object.keys(pedidos).length) throw new Error('Agrega al menos un producto');
    const precios = {};
    Object.keys(pedidos).forEach(p => {
      let pu = precio_(B, g, p);
      const it = (data.items || []).find(x => up_(x.producto) === p) || {};
      if (dueno && it.precio !== undefined && it.precio !== '' && num_(it.precio) >= 0) pu = num_(it.precio);
      if (!dueno && p !== 'GALONCAMB' && !(pu > 0)) throw new Error(nice_(p) + ' no tiene precio para este cliente. Pídele a Oscar que lo ponga.');
      precios[p] = pu;
    });
    if (esRuta && u.rol === 'RUTA') {
      const carga = cargaHoy_();
      if (!carga.registrada) throw new Error('No hay salida registrada hoy. Pide a planta que registre la salida antes de vender.');
      if ((pedidos.GARRAFON || 0) > carga.garrafones) throw new Error('Según la salida registrada solo traes ' + Math.max(0, carga.garrafones) + ' garrafones. Pide a planta que registre o corrija la salida.');
      const gl = (pedidos.GALON || 0) + (pedidos.GALONCAMB || 0);
      if (gl > carga.galones) throw new Error('Según la salida registrada solo traes ' + Math.max(0, carga.galones) + ' galones. Pide a planta que registre o corrija la salida.');
    }
    const totalPrevio = r2_(Object.keys(pedidos).reduce((s, p) => s + pedidos[p] * precios[p], 0));
    if (metodo === 'CREDITO' && !dueno) {
      const lim = limiteCredito_(g), sal = saldo_(B, g);
      if (sal + totalPrevio > lim + 0.01) throw new Error('No se puede fiar: ' + g.base + ' debe ' + dinero_(sal) + ' y su límite es ' + dinero_(lim) + '. Cobra en efectivo o pide a Oscar que suba el límite.');
    }
    const guardadas = [];
    Object.keys(pedidos).forEach(prod => {
      const cant = pedidos[prod];
      const pu = precios[prod];
      const idCli = fichaVenta_(B, g, prod);
      const idV = id_();
      escribir_('VENTAS', {
        'ID_VENTA': idV, 'FECHA': hoy, 'ID_CLIENTE': idCli, 'PRODUCTO': prod, 'CANTIDAD': cant,
        'TOTAL': r2_(cant * pu), 'P.U.': pu, 'METODO': metodo, 'UBICACION': ubStr,
      }, {
        'COMISION': r => '=IF(C' + r + '="' + CONFIG.ID_CLIENTE_PLANTA + '", 0, (E' + r + ' * IF(D' + r + '="GARRAFON", ' + (CONFIG.COMISION.GARRAFON || 0) + ', IF(D' + r + '="GALON", ' + (CONFIG.COMISION.GALON || 0) + ', 0))))',
      });
      guardadas.push({ id: idV, producto: prod, cantidad: cant, precio: pu, total: r2_(cant * pu) });
    });
    if (data.idPedido) marcarPedido_(data.idPedido, 'ENTREGADO', guardadas[0].id, u.nombre);
    const total = r2_(guardadas.reduce((s, x) => s + x.total, 0));
    // si el cliente no tenía ubicación guardada, se toma la de esta venta
    let ubicGuardada = false;
    const enPlanta = tieneUb && km_({ lat: +ub.lat, lon: +ub.lon }, CONFIG.PLANTA) < 0.15;
    if (esRuta && !esPaso_(g) && tieneUb && !enPlanta && (!ubCli || aprox) && num_(ub.precision) > 0 && num_(ub.precision) <= 100) {
      actualizar_('CLIENTES', g.principal._fila, { 'UBICACION': ubStr });
      if (aprox) PropertiesService.getScriptProperties().deleteProperty('aprox_' + norm_(g.principal.ID_CLIENTE));
      ubicGuardada = true;
    }
    log_(u.nombre, 'VENTA', {
      id: guardadas[0].id, ids: guardadas.map(x => x.id), cliente: esPaso_(g) && norm_(data.nota) ? 'DE PASO: ' + norm_(data.nota).slice(0, 80) : g.base, metodo: metodo, total: total, items: guardadas.map(x => x.cantidad + ' ' + x.producto),
      garrafones: guardadas.filter(x => x.producto === 'GARRAFON').reduce((s, x) => s + x.cantidad, 0),
      lat: tieneUb ? +Number(ub.lat).toFixed(6) : null, lon: tieneUb ? +Number(ub.lon).toFixed(6) : null,
      precision: tieneUb ? Math.round(num_(ub.precision)) : null, distancia_m: distancia, ruta: esRuta,
      fuera: distancia != null && distancia > CONFIG.DISTANCIA_ALERTA_M,
      hora: Utilities.formatDate(capturada, CONFIG.ZONA, 'HH:mm'),
      diferida: diferida ? Math.round((Date.now() - capturada.getTime()) / 60000) : undefined,
    });
    const quien = esPaso_(g) && norm_(data.nota) ? norm_(data.nota).slice(0, 60) : g.base;
    if (metodo === 'TRANSFERENCIA' && !dueno) porConfirmar_('VENTA', guardadas.map(x => x.id).join(','), quien, total, u.nombre);
    if (pedidos.GALONCAMB && !dueno) avisoDueno_(u, 'Cambio de galón sin cobro: ' + pedidos.GALONCAMB + ' a ' + quien + '.');
    const saldoNuevo = r2_(saldo_(B, g) + (metodo === 'CREDITO' ? total : 0));
    return {
      ok: true, total: total, items: guardadas, saldo: saldoNuevo, distancia: distancia, ubicacionGuardada: ubicGuardada, carga: cargaHoy_(),
      fuera: distancia != null && distancia > CONFIG.DISTANCIA_ALERTA_M && !dueno, porConfirmar: metodo === 'TRANSFERENCIA' && !dueno,
      ticket: esPaso_(g) || !esRuta ? null : ticketVenta_(g, guardadas, metodo, total, saldoNuevo),
    };
  });
  if (idLocal) { try { cache.put('vl_' + idLocal, JSON.stringify(res), 21600); } catch (e) {} }
  if (u.rol !== 'DUENO') {
    const n = res.items.map(x => x.cantidad + ' ' + nombreProd_(x.producto, x.cantidad)).join(' y ');
    const como = { EFECTIVO: 'efectivo', TRANSFERENCIA: 'transferencia', CREDITO: 'fiado' }[up_(data.metodo)] || '';
    const cli = (B_nombre_(data.idCliente) || 'cliente');
    notificar_('VENTAS', 'DUENO', nice_(u.nombre) + ' vendió ' + dinero_(res.total), n + ' a ' + cli + ', ' + como + (res.fuera ? '. Registrada lejos del cliente' : '') + (num_(data.capturada) && Date.now() - num_(data.capturada) > 600000 ? '. Se hizo sin señal a las ' + Utilities.formatDate(new Date(num_(data.capturada)), CONFIG.ZONA, 'HH:mm') : '') + '.', 'inicio');
  }
  return res;
}

function apiAbono(token, data) {
  const u = sesion_(token);
  return conLock_(() => {
    const B = base_();
    const g = B.grupoDe[norm_(data.idCliente)];
    if (!g) throw new Error('Cliente no encontrado');
    const monto = r2_(num_(data.monto));
    if (monto <= 0) throw new Error('Escribe el monto');
    const metodo = up_(data.metodo) === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO';
    const idA = id_();
    escribir_('ABONOS', { 'ID_ABONO': idA, 'FECHA': fechaMov_(u, data.fecha), 'ID_CLIENTE': norm_(g.principal.ID_CLIENTE), 'MONTO': monto, 'COMENTARIOS': 'App · ' + u.nombre + (data.nota ? ' · ' + data.nota : ''), 'METODO': metodo });
    log_(u.nombre, 'ABONO', { id: idA, cliente: g.base, monto: monto, metodo: metodo });
    if (metodo === 'TRANSFERENCIA' && u.rol !== 'DUENO') porConfirmar_('ABONO', idA, g.base, monto, u.nombre);
    const saldo = r2_(saldo_(B, g) - monto);
    return { ok: true, id: idA, saldo: saldo, porConfirmar: metodo === 'TRANSFERENCIA' && u.rol !== 'DUENO', ticket: ticketAbono_(g, idA, monto, metodo, saldo) };
  });
}

/** Solo el dueño: borra una venta capturada por error. */
function apiBorrarVenta(token, idVenta) {
  const u = sesion_(token, true);
  return conLock_(() => {
    const v = leer_('VENTAS').find(x => norm_(x.ID_VENTA) === norm_(idVenta));
    if (!v) throw new Error('No encontré esa venta');
    hoja_('VENTAS').deleteRow(v._fila);
    log_(u.nombre, 'VENTA BORRADA', { id: idVenta, cliente: norm_(v.ID_CLIENTE), producto: up_(v.PRODUCTO), cantidad: num_(v.CANTIDAD), total: num_(v.TOTAL), fecha: diaKey_(v.FECHA) });
    return { ok: true };
  });
}

// ======================= GASTOS Y COMPRAS =======================
function apiGasto(token, data) {
  const u = sesion_(token);
  return conLock_(() => {
    const hoy = fechaMov_(u, data.fecha);
    const metodo = up_(data.metodo) === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO';
    const cant = num_(data.cantidad) > 0 ? num_(data.cantidad) : 1;
    const total = r2_(num_(data.total));
    if (total <= 0) throw new Error('Escribe el total');
    if (data.tipo === 'COMPRA') {
      const prod = up_(data.concepto);
      if (CONFIG.INSUMOS.indexOf(prod) < 0) throw new Error('Elige el insumo');
      escribir_('COMPRAS', { 'ID_COMPRA': id_(), 'FECHA': hoy, 'PRODUCTO': prod, 'CANTIDAD': cant, 'TOTAL': total, 'METODO': metodo, 'REGISTRO': u.nombre },
        { 'P.U.': r => '=IF(OR(D' + r + '="", D' + r + '=0), "", F' + r + '/D' + r + ')' });
      log_(u.nombre, 'COMPRA', { insumo: prod, cantidad: cant, total: total });
    } else {
      const cat = up_(data.concepto);
      if (CONFIG.CATEGORIAS_GASTO.indexOf(cat) < 0) throw new Error('Elige la categoría');
      escribir_('GASTOS', { 'ID_GASTOS': id_(), 'FECHA': hoy, 'GASTO': cat, 'COSTO': r2_(total / cant), 'CANTIDAD': cant, 'TOTAL': total, 'METODO': metodo, 'REGISTRO': u.nombre });
      log_(u.nombre, 'GASTO', { categoria: cat, total: total, nota: data.nota || '' });
    }
    return { ok: true };
  });
}

// ======================= SALIDA, REGRESO Y CORTE =======================
function puedeSalida_(u) {
  if (CONFIG.ROLES_SALIDA.indexOf(u.rol) < 0) throw new Error('La salida y el regreso los registra planta (o Oscar), no el repartidor.');
}

function apiSalida(token, data) {
  const u = sesion_(token);
  puedeSalida_(u);
  return conLock_(() => {
    const hoy = hoyKey_();
    if (Math.round(num_(data.garrafones)) <= 0 && Math.round(num_(data.galones)) <= 0) throw new Error('Escribe cuántos garrafones o galones salen.');
    if (data.idSalida) {
      const s = leer_('SALIDA A RUTA').find(x => diaKey_(x.FECHA) === hoy && norm_(x.ID_SALIDA) === norm_(data.idSalida));
      if (!s) throw new Error('Solo se pueden corregir salidas de hoy.');
      const antes = { garrafones: num_(s.GARRAFON), galones: num_(s.GALON) };
      actualizar_('SALIDA A RUTA', s._fila, { 'GARRAFON': Math.round(num_(data.garrafones)), 'GALON': Math.round(num_(data.galones)) });
      log_(u.nombre, 'SALIDA CORREGIDA', { viaje: s['RUTA #'], antes: antes, ahora: { garrafones: Math.round(num_(data.garrafones)), galones: Math.round(num_(data.galones)) } });
      if (u.rol !== 'DUENO') avisoDueno_(u, 'Corrigió la salida del viaje ' + s['RUTA #'] + ': de ' + antes.garrafones + ' a ' + Math.round(num_(data.garrafones)) + ' garrafones y de ' + antes.galones + ' a ' + Math.round(num_(data.galones)) + ' galones.');
      return { ok: true, id: norm_(s.ID_SALIDA), ruta: s['RUTA #'], corregida: true };
    }
    const previas = leer_('SALIDA A RUTA').filter(s => diaKey_(s.FECHA) === hoy);
    const id = id_();
    escribir_('SALIDA A RUTA', { 'ID_SALIDA': id, 'FECHA': fechaDeKey_(hoy), 'RUTA #': previas.length + 1, 'GARRAFON': Math.round(num_(data.garrafones)), 'GALON': Math.round(num_(data.galones)), 'HORA': Utilities.formatDate(new Date(), CONFIG.ZONA, 'HH:mm') });
    log_(u.nombre, 'SALIDA', data);
    return { ok: true, id: id, ruta: previas.length + 1 };
  });
}

function apiRegreso(token, data) {
  const u = sesion_(token);
  puedeSalida_(u);
  return conLock_(() => {
    const hoy = hoyKey_();
    if (!data.idSalida) throw new Error('Elige el viaje que regresa');
    const campos = ['vacios', 'llenos', 'galones', 'rotos'];
    if (campos.every(k => String(data[k] == null ? '' : data[k]).trim() === '')) throw new Error('Escribe cuántos garrafones vacíos, llenos, galones o rotos regresaron (pon 0 donde no haya).');
    if (campos.some(k => num_(data[k]) < 0)) throw new Error('Los números no pueden ser negativos.');
    const valores = { 'GARRAFONES VACIOS': Math.round(num_(data.vacios)), 'GARRAFONES LLENOS REGRESO': Math.round(num_(data.llenos)), 'GALONES': Math.round(num_(data.galones)), 'GARRAFONES ROTOS': Math.round(num_(data.rotos)) };
    // un solo regreso por viaje: si ya existe, se corrige en lugar de duplicarse
    const previo = leer_('REGRESO A PLANTA').find(r => diaKey_(r.FECHA) === hoy && norm_(r.ID_SALIDA) === norm_(data.idSalida));
    if (previo) actualizar_('REGRESO A PLANTA', previo._fila, valores);
    else escribir_('REGRESO A PLANTA', Object.assign({ 'ID_REGRESO': id_(), 'FECHA': fechaDeKey_(hoy), 'ID_SALIDA': data.idSalida }, valores));
    log_(u.nombre, previo ? 'REGRESO CORREGIDO' : 'REGRESO', data);
    let cuadre = null;
    try {
      const d = envases_(1)[0];
      if (d && d.viajes && !d.sinRegreso) {
        cuadre = { vendidos: d.vendidos, vacios: d.vacios, salieron: d.salieron, llenos: d.llenos, faltanVacios: d.noRegresaron, faltanLlenos: d.llenosFaltan };
        const p = [];
        if (d.noRegresaron > 2) p.push('faltan ' + d.noRegresaron + ' vacíos (se vendieron ' + d.vendidos + ' y regresaron ' + d.vacios + ')');
        if (d.llenosFaltan > 2) p.push('faltan ' + d.llenosFaltan + ' llenos que no se vendieron ni regresaron');
        if (d.llenosFaltan < -2) p.push('se registraron ' + (-d.llenosFaltan) + ' garrafones vendidos de más contra lo que salió');
        if (p.length) avisoDueno_(u, 'Los garrafones de hoy no cuadran: ' + p.join('; ') + '.', 'PROBLEMA');
      }
    } catch (e) {}
    return { ok: true, corregido: !!previo, cuadre: cuadre };
  });
}

/** Lo que debería entregarse hoy, calculado con ventas, abonos y gastos del día. */
function cuentasDia_(dia) {
  const P = CONFIG.ID_CLIENTE_PLANTA;
  const v = leer_('VENTAS').filter(x => diaKey_(x.FECHA) === dia);
  const a = leer_('ABONOS').filter(x => diaKey_(x.FECHA) === dia);
  const gs = leer_('GASTOS').filter(x => diaKey_(x.FECHA) === dia);
  const cs = leer_('COMPRAS').filter(x => diaKey_(x.FECHA) === dia);
  const sal = leer_('SALIDA A RUTA').filter(x => diaKey_(x.FECHA) === dia);
  const reg = leer_('REGRESO A PLANTA').filter(x => diaKey_(x.FECHA) === dia);
  const sum = (arr, f) => r2_(arr.reduce((s, x) => s + f(x), 0));
  const ruta = v.filter(x => norm_(x.ID_CLIENTE) !== P), planta = v.filter(x => norm_(x.ID_CLIENTE) === P);
  const q = (arr, prod) => sum(arr.filter(x => up_(x.PRODUCTO) === prod), x => num_(x.CANTIDAD));
  const comision = sum(ruta, x => num_(x.CANTIDAD) * (CONFIG.COMISION[up_(x.PRODUCTO)] || 0));
  const duenos = leer_('USUARIOS_APP').filter(x => up_(x.ROL) === 'DUENO').map(x => up_(x.NOMBRE));
  const delDia = x => ['TRANSFERENCIA', 'DUENO'].indexOf(up_(x.METODO)) < 0 && duenos.indexOf(up_(x.REGISTRO)) < 0;
  const c = {
    dia: dia,
    garrafonesRuta: q(ruta, 'GARRAFON'), galonesRuta: q(ruta, 'GALON'),
    garrafonesPlanta: q(planta, 'GARRAFON'), galonesPlanta: q(planta, 'GALON'),
    efectivoRuta: sum(ruta.filter(x => up_(x.METODO) === 'EFECTIVO'), x => num_(x.TOTAL)),
    efectivoPlanta: sum(planta.filter(x => up_(x.METODO) === 'EFECTIVO'), x => num_(x.TOTAL)),
    transferencias: sum(v.filter(x => up_(x.METODO) === 'TRANSFERENCIA'), x => num_(x.TOTAL)),
    credito: sum(v.filter(x => up_(x.METODO) === 'CREDITO'), x => num_(x.TOTAL)),
    abonosEfectivo: sum(a.filter(x => ['TRANSFERENCIA', 'AJUSTE'].indexOf(up_(x.METODO)) < 0), x => num_(x.MONTO)),
    abonosTransferencia: sum(a.filter(x => up_(x.METODO) === 'TRANSFERENCIA'), x => num_(x.MONTO)),
    // solo lo que se pagó con el efectivo del día; lo que registró el dueño lo pagó él aparte
    gastosEfectivo: sum(gs.filter(delDia), x => num_(x.TOTAL)) + sum(cs.filter(delDia), x => num_(x.TOTAL)),
    comision: comision,
    salieron: sum(sal, x => num_(x.GARRAFON)), galonesSalieron: sum(sal, x => num_(x.GALON)),
    regresaronLlenos: sum(reg, x => num_(x['GARRAFONES LLENOS REGRESO'])),
    galonesRegreso: sum(reg, x => num_(x.GALONES)),
    vacios: sum(reg, x => num_(x['GARRAFONES VACIOS'])), rotos: sum(reg, x => num_(x['GARRAFONES ROTOS'])),
    viajes: sal.length,
    viajesSinRegreso: sal.filter(s => !reg.some(r => norm_(r.ID_SALIDA) === norm_(s.ID_SALIDA))).map(s => s['RUTA #']),
  };
  c.esperado = r2_(c.efectivoRuta + c.efectivoPlanta + c.abonosEfectivo - c.comision - c.gastosEfectivo);
  c.garrafonesFaltantes = c.salieron ? c.salieron - c.regresaronLlenos - c.rotos - c.garrafonesRuta : 0;
  c.galonesFaltantes = c.galonesSalieron ? c.galonesSalieron - c.galonesRegreso - c.galonesRuta : 0;
  return c;
}

/** Lo que debería traer la camioneta ahora: salió − regresó lleno − vendido en ruta. */
function cargaHoy_() {
  const c = cuentasDia_(hoyKey_());
  return {
    registrada: c.salieron > 0 || c.galonesSalieron > 0,
    garrafones: c.salieron - c.regresaronLlenos - c.garrafonesRuta,
    galones: c.galonesSalieron - c.galonesRegreso - c.galonesRuta,
    salieron: c.salieron, vendidos: c.garrafonesRuta,
  };
}

/** Carga actual, lo que falta entregar en la ruta y clientes cerca para dejar lo que sobre. */
function apiCarga(token, lat, lon) {
  sesion_(token);
  const hoy = hoyKey_();
  const carga = cargaHoy_();
  const ruta = calcularRuta_(hoy);
  const enRuta = {};
  let pendG = 0, pendGl = 0;
  ruta.viajes.forEach(t => t.paradas.forEach(p => { enRuta[p.id] = 1; if (!p.visitado) { pendG += p.garrafones; pendGl += p.galones; } }));
  ruta.sinUbicacion.forEach(p => { enRuta[p.id] = 1; if (!p.visitado) { pendG += p.garrafones; pendGl += p.galones; } });
  const aqui = (num_(lat) && num_(lon)) ? { lat: num_(lat), lon: num_(lon) } : CONFIG.PLANTA;
  const B = base_();
  const sug = [];
  Object.keys(B.grupos).forEach(k => {
    if (esPaso_(B.grupos[k])) return;
    const c = resumenCliente_(B, B.grupos[k], hoy, true);
    if (c.id === CONFIG.ID_CLIENTE_PLANTA || c.estatus === 'INACTIVO' || c.compraHoy || enRuta[c.id] || !c.ubicacion || !c.visitas) return;
    const d = km_(aqui, c.ubicacion);
    if (d > CONFIG.RADIO_SUGERENCIAS_KM) return;
    const faltan = c.frecuencia ? c.frecuencia - c.diasDesde : null;
    let motivo = 'Cliente de la zona';
    if (faltan != null && faltan <= 0) motivo = 'Ya le toca';
    else if (faltan != null && faltan <= 3) motivo = 'Le toca en ' + faltan + (faltan === 1 ? ' día' : ' días');
    else if (c.diasDesde > CONFIG.DIAS_CLIENTE_PERDIDO) motivo = c.diasDesde + ' días sin comprar';
    const prioridad = (faltan != null && faltan <= 3 ? 0 : 1) + d / 10;
    sug.push({ id: c.id, nombre: c.nombre, km: r2_(d), garrafones: c.promGarrafon, galones: c.promGalon, motivo: motivo, saldo: c.saldo, telefono: c.telefono, prioridad: prioridad });
  });
  sug.sort((a, b) => a.prioridad - b.prioridad);
  return {
    carga: carga, pendientes: { garrafones: pendG, galones: pendGl },
    sobran: { garrafones: carga.registrada ? carga.garrafones - pendG : null, galones: carga.registrada ? carga.galones - pendGl : null },
    desdeUbicacion: aqui !== CONFIG.PLANTA,
    sugerencias: sug.slice(0, 10),
  };
}

function apiPreCorte(token) { sesion_(token); return cuentasDia_(hoyKey_()); }

function apiCorte(token, data) {
  const u = sesion_(token);
  return conLock_(() => {
    const hoy = hoyKey_();
    const c = cuentasDia_(hoy);
    if (c.viajesSinRegreso.length && u.rol !== 'DUENO') throw new Error('Falta registrar el regreso del viaje ' + c.viajesSinRegreso.join(', ') + '. Sin eso no cuadran los garrafones.');
    const entregado = r2_(num_(data.entregado));
    escribir_('BALANCE_DIARIO', {
      'ID_BALANCE': id_(), 'FECHA': fechaDeKey_(hoy), 'G_RUTA': c.garrafonesRuta, 'GL_RUTA': c.galonesRuta, 'G_PLANTA': c.garrafonesPlanta, 'GL_PLANTA': c.galonesPlanta,
      'DINERO_RUTA': c.efectivoRuta, 'DINERO_PLANTA': c.efectivoPlanta, 'COMISION': c.comision, 'GASTOS': c.gastosEfectivo, 'TRANSFERENCIA': r2_(c.transferencias + c.abonosTransferencia),
      'CREDITO': c.credito, 'ABONO': c.abonosEfectivo, 'TOTAL_ESPERADO': c.esperado, 'EFECTIVO_ENTREGADO': entregado, 'DIFERENCIA': r2_(entregado - c.esperado),
    }, { 'DIFERENCIA_GARRAFONES': r => "=SUMIF('REGRESO A PLANTA'!B:B, B" + r + ", 'REGRESO A PLANTA'!D:D) - C" + r });
    log_(u.nombre, 'CORTE', { esperado: c.esperado, entregado: entregado, garrafonesFaltantes: c.garrafonesFaltantes, nota: data.nota || '' });
    if (Math.abs(entregado - c.esperado) >= 1 || c.garrafonesFaltantes) {
      try { MailApp.sendEmail(CONFIG.CORREO_DUENO, 'Corte con diferencia · ' + hoy, u.nombre + ' cerró el corte.\nEsperado: $' + c.esperado + '\nEntregado: $' + entregado + '\nDiferencia: $' + r2_(entregado - c.esperado) + '\nGarrafones que no cuadran: ' + c.garrafonesFaltantes + (data.nota ? '\nNota: ' + data.nota : '')); } catch (e) {}
    }
    return { ok: true, esperado: c.esperado, diferencia: r2_(entregado - c.esperado) };
  });
}

// ======================= PEDIDOS =======================
function pedidosPendientes_() {
  return leer_('PEDIDOS').filter(p => ['NUEVO', 'CONFIRMADO'].indexOf(up_(p.ESTATUS)) >= 0).map(p => ({
    id: norm_(p.ID_PEDIDO), fecha: diaKey_(p.FECHA_PEDIDO), idCliente: norm_(p.ID_CLIENTE), nombre: norm_(p.NOMBRE), telefono: norm_(p.TELEFONO),
    direccion: norm_(p.DIRECCION), garrafones: num_(p.GARRAFONES), galones: num_(p.GALONES), fechaEntrega: diaKey_(p.FECHA_ENTREGA), notas: norm_(p.NOTAS), estatus: up_(p.ESTATUS),
  }));
}

function marcarPedido_(idPedido, estatus, idVenta, quien) {
  const p = leer_('PEDIDOS').find(x => norm_(x.ID_PEDIDO) === norm_(idPedido));
  if (!p) return;
  const cambios = { 'ESTATUS': estatus, 'ATENDIO': quien };
  if (idVenta) cambios['ID_VENTA'] = idVenta;
  actualizar_('PEDIDOS', p._fila, cambios);
}

function apiPedidoEstado(token, idPedido, estatus) {
  const u = sesion_(token);
  estatus = up_(estatus);
  if (['CONFIRMADO', 'ENTREGADO', 'CANCELADO'].indexOf(estatus) < 0) throw new Error('Estado inválido');
  conLock_(() => marcarPedido_(idPedido, estatus, null, u.nombre));
  log_(u.nombre, 'PEDIDO ' + estatus, idPedido);
  return { ok: true };
}

/** Página pública: datos mínimos del cliente para su liga personal. No expone saldos ni otros clientes. */
function pubPedidoInfo(codigo) {
  const B = base_();
  const g = B.grupoDe[idDeCodigo_(codigo)];
  const precios = {};
  ['GARRAFON', 'GALON'].forEach(p => { precios[p] = g ? precio_(B, g, p) : (B.productos[p] || 0); });
  return { negocio: CONFIG.NEGOCIO, cliente: g ? { id: norm_(g.principal.ID_CLIENTE), nombre: g.base } : null, precios: precios, hoy: hoyKey_() };
}

function pubPedido(data) {
  const cache = CacheService.getScriptCache();
  const idCli = idDeCodigo_(data.idCliente);
  const llave = 'ped_' + (idCli || 'anon');
  const n = num_(cache.get(llave)), total = num_(cache.get('ped_total'));
  if (n >= 5 || total >= 80) throw new Error('Recibimos muchos pedidos seguidos. Intenta en un rato o márcanos.');
  const garr = Math.round(num_(data.garrafones)), gal = Math.round(num_(data.galones));
  if (garr <= 0 && gal <= 0) throw new Error('Indica cuántos garrafones o galones quieres');
  if (garr > 200 || gal > 200) throw new Error('Para pedidos grandes, márcanos por favor');
  const B = base_();
  const g = idCli ? B.grupoDe[idCli] : null;
  const nombre = g ? g.base : norm_(data.nombre).slice(0, 80);
  if (!g && (!nombre || !norm_(data.telefono) || !norm_(data.direccion))) throw new Error('Escribe tu nombre, teléfono y dirección');
  const hoy = hoyKey_();
  let entrega = diaKey_(data.fechaEntrega) || hoy;
  if (entrega < hoy) entrega = hoy;
  const id = id_();
  conLock_(() => escribir_('PEDIDOS', {
    'ID_PEDIDO': id, 'FECHA_PEDIDO': new Date(), 'ID_CLIENTE': g ? norm_(g.principal.ID_CLIENTE) : '', 'NOMBRE': nombre,
    'TELEFONO': norm_(data.telefono).slice(0, 20) || (g ? norm_(g.principal.TELEFONO) : ''), 'DIRECCION': norm_(data.direccion).slice(0, 200) || (g ? norm_(g.principal.DIRECCION) : ''),
    'GARRAFONES': garr, 'GALONES': gal, 'FECHA_ENTREGA': fechaDeKey_(entrega), 'NOTAS': norm_(data.notas).slice(0, 300), 'ESTATUS': 'NUEVO',
  }));
  cache.put(llave, String(n + 1), 3600); cache.put('ped_total', String(total + 1), 3600);
  try { clientesParaPedidos_(); } catch (e) {}
  try {
    hojaAvisos_();
    const txt = 'Pedido nuevo: ' + nombre + ' · ' + (garr ? garr + ' garrafones' : '') + (garr && gal ? ' y ' : '') + (gal ? gal + ' galones' : '') + ' para ' + (entrega === hoy ? 'hoy' : entrega) + '. Ya está en la ruta.' + (data.notas ? ' Nota: ' + norm_(data.notas).slice(0, 120) : '');
    conLock_(() => escribir_('AVISOS', { 'ID_AVISO': id_(), 'FECHA_HORA': new Date(), 'DE': 'PEDIDOS', 'ROL_DE': 'SISTEMA', 'PARA': CONFIG.AVISAR_PEDIDOS_A, 'TIPO': 'SOLICITUD', 'MENSAJE': txt, 'ESTATUS': 'ABIERTO', 'LEIDO_POR': '' }));
    notificar_('PEDIDOS', 'DUENO,PLANTA,' + CONFIG.AVISAR_PEDIDOS_A, 'Pedido de ' + nombre, txt.replace(/^Pedido nuevo: [^·]*· /, ''), 'pedidos');
  } catch (e) {}
  if (CONFIG.AVISAR_PEDIDOS_POR_CORREO) {
    try { MailApp.sendEmail(CONFIG.CORREO_DUENO, 'Pedido nuevo: ' + nombre, nombre + ' pidió ' + garr + ' garrafones y ' + gal + ' galones para el ' + entrega + '.' + (data.notas ? '\nNota: ' + data.notas : '')); } catch (e) {}
  }
  return { ok: true, id: id, entrega: entrega };
}


// ======================= PEDIDOS → CLIENTES Y UBICACIÓN AUTOMÁTICA =======================
/** Da de alta (o encuentra) el cliente de cada pedido pendiente que llegó sin cliente, para que entre solo a la ruta. */
function clientesParaPedidos_() {
  const pend = p => !norm_(p.ID_CLIENTE) && ['NUEVO', 'CONFIRMADO'].indexOf(up_(p.ESTATUS)) >= 0;
  if (!leer_('PEDIDOS').some(pend)) return;
  conLock_(() => {
    const clientes = leer_('CLIENTES');
    let precio = 0; leer_('PRODUCTOS').forEach(p => { if (up_(p.ID_PRODUCTO) === 'GARRAFON') precio = num_(p.PRECIO); });
    leer_('PEDIDOS').filter(pend).forEach(p => {
      const tel = digitos_(p.TELEFONO).slice(-10), nombre = up_(p.NOMBRE);
      if (!nombre) return;
      const ya = clientes.find(c => up_(c.NOMBRE) === nombre || (tel.length === 10 && digitos_(c.TELEFONO).slice(-10) === tel));
      let id;
      if (ya) id = norm_(ya.ID_CLIENTE);
      else {
        const pt = geocodificar_(p.DIRECCION);
        id = crearCliente_(clientes, { nombre: nombre, precio: precio || 20, direccion: p.DIRECCION, telefono: p.TELEFONO, ubicacion: pt ? pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6) : '' });
        if (pt) marcarAprox_(id);
        log_('PEDIDOS', 'CLIENTE NUEVO', { id: id, nombre: nombre, desde: 'pedido', ubicacion: pt ? 'aproximada por dirección' : 'sin ubicación' });
      }
      actualizar_('PEDIDOS', p._fila, { 'ID_CLIENTE': id });
    });
  });
}

function crearCliente_(clientes, d) {
  let max = 0;
  clientes.forEach(c => { const m = norm_(c.ID_CLIENTE).match(/^C(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  const id = 'C' + String(max + 1).padStart(3, '0');
  escribir_('CLIENTES', {
    'ID_CLIENTE': id, 'NOMBRE': up_(d.nombre), 'PRECIO ESPECIAL': d.precio, 'DIRECCION': norm_(d.direccion), 'TELEFONO': norm_(d.telefono),
    'UBICACION': norm_(d.ubicacion), 'ESTATUS_CLIENTE': 'ACTIVO',
  }, { 'SALDO PENDIENTE': r => '=SUMIFS(VENTAS!F:F, VENTAS!C:C, A' + r + ', VENTAS!H:H, "CREDITO") - SUMIF(ABONOS!C:C, A' + r + ', ABONOS!D:D)' });
  clientes.push({ ID_CLIENTE: id, NOMBRE: up_(d.nombre), TELEFONO: norm_(d.telefono) });
  return id;
}

/** Busca las coordenadas de una dirección con Google Maps (aproximadas). Se corrigen solas con el GPS de la primera venta. */
function geocodificar_(direccion) {
  const dir = norm_(direccion);
  if (dir.length < 6) return null;
  const cache = CacheService.getScriptCache();
  const llave = ('geo_' + up_(dir).replace(/[^A-Z0-9]/g, '')).slice(0, 200);
  const c = cache.get(llave);
  if (c) return c === 'X' ? null : JSON.parse(c);
  let r = null;
  try {
    const q = /tepic|nayarit|xalisco/i.test(dir) ? dir : dir + ', Tepic, Nayarit';
    const res = Maps.newGeocoder().setRegion('mx').setLanguage('es').geocode(q + ', México');
    if (res && res.status === 'OK' && res.results && res.results.length) {
      const loc = res.results[0].geometry.location;
      const pt = { lat: +loc.lat, lon: +loc.lng };
      if (isFinite(pt.lat) && isFinite(pt.lon) && km_(pt, CONFIG.PLANTA) <= CONFIG.RADIO_GEOCODIFICAR_KM) r = pt;
    }
  } catch (e) {}
  cache.put(llave, r ? JSON.stringify(r) : 'X', 21600);
  return r;
}
function marcarAprox_(id) { PropertiesService.getScriptProperties().setProperty('aprox_' + id, '1'); }
function esAprox_(id) { return !!PropertiesService.getScriptProperties().getProperty('aprox_' + id); }
function digitos_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }


// ======================= AGENDA =======================
function hojaNueva_(nombre) {
  const ss = ss_();
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, HOJAS_NUEVAS[nombre].length).setValues([HOJAS_NUEVAS[nombre]]).setFontWeight('bold');
    h.setFrozenRows(1);
    if (nombre === 'SEPARADOR') h.getRange(2, 1, SEPARADOR_INICIAL.length, 4).setValues(SEPARADOR_INICIAL);
  }
  return h;
}

/** Siguiente fecha según "CADA 3 MESES", "CADA 15 DIAS", "CADA 2 SEMANAS", "CADA AÑO" o "15 Y 30". */
function siguienteFecha_(k, repetir) {
  const r = up_(repetir).replace(/Í/g, 'I').replace(/Ñ/g, 'N');
  if (!r || r === 'NO') return '';
  if (/15\s*Y\s*30/.test(r)) {
    const p = k.split('-').map(Number);
    const fin = new Date(p[0], p[1], 0).getDate();
    if (p[2] < 15) return p[0] + '-' + String(p[1]).padStart(2, '0') + '-15';
    if (p[2] < Math.min(30, fin)) return p[0] + '-' + String(p[1]).padStart(2, '0') + '-' + String(Math.min(30, fin)).padStart(2, '0');
    const d = new Date(p[0], p[1], 15);
    return Utilities.formatDate(d, CONFIG.ZONA, 'yyyy-MM-dd');
  }
  const m = r.match(/(\d+)?\s*(DIA|SEMANA|MES|ANO)/);
  if (!m) return '';
  const n = +(m[1] || 1);
  if (m[2] === 'DIA') return sumaDias_(k, n);
  if (m[2] === 'SEMANA') return sumaDias_(k, 7 * n);
  const meses = m[2] === 'MES' ? n : 12 * n;
  const p = k.split('-').map(Number);
  const fin = new Date(p[0], p[1] - 1 + meses + 1, 0).getDate();
  return Utilities.formatDate(new Date(p[0], p[1] - 1 + meses, Math.min(p[2], fin)), CONFIG.ZONA, 'yyyy-MM-dd');
}

function agenda_() {
  hojaNueva_('AGENDA');
  const hoy = hoyKey_();
  return leer_('AGENDA').filter(a => norm_(a.ID) && norm_(a.ACTIVIDAD)).map(a => {
    const fecha = diaKey_(a.FECHA);
    return {
      id: norm_(a.ID), actividad: norm_(a.ACTIVIDAD), tipo: up_(a.TIPO) || 'OTRO', fecha: fecha, repetir: norm_(a.REPETIR),
      avisar: a.AVISAR_DIAS_ANTES === '' || a.AVISAR_DIAS_ANTES == null ? 3 : num_(a.AVISAR_DIAS_ANTES),
      estatus: up_(a.ESTATUS) || 'PENDIENTE', hechoEl: diaKey_(a.HECHO_EL), costo: num_(a.COSTO), nota: norm_(a.NOTA),
      faltan: fecha ? difDias_(fecha, hoy) : null, _fila: a._fila,
    };
  });
}

function agendaPendientes_() {
  return agenda_().filter(a => a.estatus === 'PENDIENTE').sort((a, b) => (a.fecha || '9999') < (b.fecha || '9999') ? -1 : 1);
}

function apiAgenda(token) {
  sesion_(token, true);
  const todos = agenda_();
  return {
    pendientes: todos.filter(a => a.estatus === 'PENDIENTE').sort((a, b) => (a.fecha || '9999') < (b.fecha || '9999') ? -1 : 1).map(limpia_),
    hechos: todos.filter(a => a.estatus === 'HECHO').sort((a, b) => a.hechoEl < b.hechoEl ? 1 : -1).slice(0, 25).map(limpia_),
  };
}
function limpia_(a) { const o = Object.assign({}, a); delete o._fila; return o; }

function apiAgendaGuardar(token, data) {
  const u = sesion_(token, true);
  const act = norm_(data.actividad).slice(0, 120);
  if (!act) throw new Error('Escribe la actividad');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.fecha || ''))) throw new Error('Elige la fecha');
  const fila = {
    'ACTIVIDAD': act, 'TIPO': up_(data.tipo) || 'OTRO', 'FECHA': fechaDeKey_(data.fecha), 'REPETIR': up_(data.repetir),
    'AVISAR_DIAS_ANTES': Math.max(0, Math.round(num_(data.avisar === '' || data.avisar == null ? 3 : data.avisar))), 'NOTA': norm_(data.nota).slice(0, 300),
  };
  return conLock_(() => {
    hojaNueva_('AGENDA');
    if (data.id) {
      const a = agenda_().find(x => x.id === norm_(data.id));
      if (!a) throw new Error('No encontré esa actividad');
      actualizar_('AGENDA', a._fila, fila);
    } else escribir_('AGENDA', Object.assign({ 'ID': id_(), 'ESTATUS': 'PENDIENTE' }, fila));
    log_(u.nombre, 'AGENDA', act + ' · ' + data.fecha);
    return { ok: true };
  });
}

/** Marca una actividad como hecha; si se repite (o se da la siguiente fecha) crea la próxima. Si tiene costo, lo registra como gasto. */
function apiAgendaHecho(token, id, data) {
  const u = sesion_(token, true);
  data = data || {};
  return conLock_(() => {
    const a = agenda_().find(x => x.id === norm_(id));
    if (!a) throw new Error('No encontré esa actividad');
    const hecho = /^\d{4}-\d{2}-\d{2}$/.test(String(data.fecha || '')) ? data.fecha : hoyKey_();
    const costo = r2_(num_(data.costo));
    actualizar_('AGENDA', a._fila, { 'ESTATUS': 'HECHO', 'HECHO_EL': fechaDeKey_(hecho), 'COSTO': costo || '', 'NOTA': [a.nota, norm_(data.nota)].filter(Boolean).join(' · ').slice(0, 300) });
    const sig = /^\d{4}-\d{2}-\d{2}$/.test(String(data.siguiente || '')) ? data.siguiente : siguienteFecha_(a.repetir && /15\s*Y\s*30/i.test(a.repetir) ? a.fecha : hecho, a.repetir);
    if (sig && data.siguiente !== 'NO') {
      escribir_('AGENDA', { 'ID': id_(), 'ACTIVIDAD': a.actividad, 'TIPO': a.tipo, 'FECHA': fechaDeKey_(sig), 'REPETIR': a.repetir, 'AVISAR_DIAS_ANTES': a.avisar, 'ESTATUS': 'PENDIENTE', 'NOTA': '' });
    }
    const cat = up_(data.categoria);
    if (costo > 0 && CONFIG.CATEGORIAS_GASTO.indexOf(cat) >= 0) {
      escribir_('GASTOS', { 'ID_GASTOS': id_(), 'FECHA': fechaMov_(u, hecho), 'GASTO': cat, 'COSTO': costo, 'CANTIDAD': 1, 'TOTAL': costo, 'METODO': up_(data.metodo) === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO', 'REGISTRO': u.nombre });
    }
    log_(u.nombre, 'AGENDA HECHO', a.actividad + (sig ? ' · próxima ' + sig : ''));
    return { ok: true, siguiente: sig || null };
  });
}

function apiAgendaBorrar(token, id) {
  const u = sesion_(token, true);
  return conLock_(() => {
    const a = agenda_().find(x => x.id === norm_(id));
    if (!a) throw new Error('No encontré esa actividad');
    actualizar_('AGENDA', a._fila, { 'ESTATUS': 'CANCELADO' });
    log_(u.nombre, 'AGENDA CANCELADA', a.actividad);
    return { ok: true };
  });
}

// ======================= SEPARADOR =======================
/** Cuánto apartar para cada gasto según el dinero que entró (ventas en efectivo y transferencia + cobros de fiado). */
function apiSeparador(token, desde, hasta) {
  sesion_(token, true);
  const hoy = hoyKey_();
  hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(hasta || '')) ? hasta : hoy;
  desde = /^\d{4}-\d{2}-\d{2}$/.test(String(desde || '')) ? desde : hasta;
  if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }
  hojaNueva_('SEPARADOR');
  const r = panel_(desde, hasta);
  const diasTrabajo = r.porDia.filter(d => d.ventas > 0).length || (desde === hasta ? 1 : 0);
  const entro = r2_(r.efectivo + r.transferencia + r.abonos);
  const sobres = leer_('SEPARADOR').filter(x => norm_(x.CONCEPTO)).map(x => {
    const forma = up_(x.FORMA), monto = num_(x.MONTO);
    let total = 0, detalle = '';
    if (forma === 'COMISION') { total = r.comisiones; detalle = 'según lo vendido en ruta'; }
    else if (forma === 'POR GARRAFON') { total = monto * r.garrafones; detalle = r.garrafones + ' garrafones × $' + monto; }
    else if (forma === 'POR GALON') { total = monto * r.galones; detalle = r.galones + ' galones × $' + monto; }
    else if (forma === 'PORCENTAJE') { total = entro * monto / 100; detalle = monto + '% de lo que entró'; }
    else { total = monto * diasTrabajo; detalle = diasTrabajo > 1 ? diasTrabajo + ' días × $' + monto : '$' + monto + ' por día'; }
    return { concepto: norm_(x.CONCEPTO), forma: forma || 'DIARIO', monto: monto, total: r2_(total), detalle: detalle, nota: norm_(x.NOTA) };
  });
  const total = r2_(sobres.reduce((s, x) => s + x.total, 0));
  return {
    desde: desde, hasta: hasta, dias: diasTrabajo, entro: entro, efectivo: r.efectivo, transferencia: r.transferencia, abonos: r.abonos,
    fiado: r.credito, garrafones: r.garrafones, galones: r.galones, sobres: sobres, totalSobres: total, queda: r2_(entro - total),
  };
}



/** Garrafones, galones y botellas vendidos hoy por cada quien: repartidores, mostrador de planta y dueño. */
function ventasPorVendedor_(dia) {
  const P = CONFIG.ID_CLIENTE_PLANTA;
  const usuarios = leer_('USUARIOS_APP').filter(x => norm_(x.NOMBRE) && up_(x.ACTIVO) !== 'NO');
  const rolDe = {}; usuarios.forEach(x => { rolDe[up_(x.NOMBRE)] = up_(x.ROL); });
  const quien = {};
  leer_('LOG_APP').forEach(l => {
    if (up_(l.ACCION) !== 'VENTA' || diaKey_(l.FECHA_HORA) !== dia) return;
    let d = {}; try { d = JSON.parse(norm_(l.DETALLE)); } catch (e) {}
    (d.ids && d.ids.length ? d.ids : [d.id]).forEach(id => { if (id) quien[norm_(id)] = up_(l.USUARIO); });
  });
  const grupos = {}, orden = [];
  const g = n => grupos[n] || (orden.push(n), grupos[n] = { nombre: n, garrafon: 0, galon: 0, botella: 0 });
  usuarios.filter(x => up_(x.ROL) === 'RUTA').forEach(x => g(up_(x.NOMBRE)));
  g('PLANTA');
  usuarios.filter(x => up_(x.ROL) === 'DUENO').forEach(x => g(up_(x.NOMBRE)));
  let previo = '';
  leer_('VENTAS').filter(v => diaKey_(v.FECHA) === dia).forEach(v => {
    const vendedor = quien[norm_(v.ID_VENTA)] || previo;   // una venta con varios productos ocupa filas seguidas
    previo = vendedor;
    const enPlanta = norm_(v.ID_CLIENTE) === P;
    const n = enPlanta ? (rolDe[vendedor] === 'DUENO' ? vendedor : 'PLANTA') : (rolDe[vendedor] === 'PLANTA' ? 'PLANTA' : vendedor || 'SIN REGISTRO');
    const prod = up_(v.PRODUCTO), cant = num_(v.CANTIDAD);
    if (prod === 'GARRAFON') g(n).garrafon += cant;
    else if (prod === 'GALON') g(n).galon += cant;
    else if (prod.indexOf('BOTELLA') === 0) g(n).botella += cant;
  });
  return orden.map(n => grupos[n]);
}

// ======================= PRÉSTAMOS A TRABAJADORES =======================
function prestamos_(dia) {
  dia = dia || hoyKey_();
  const trab = leer_('TRABAJADORES').filter(t => norm_(t.ID_TRABAJADOR) && norm_(t.NOMBRE));
  const P = leer_('PRESTAMO_TRABAJADORES'), A = leer_('ABONO_TRABAJADORES');
  const de = (x, t, campoId) => norm_(x[campoId]) === norm_(t.ID_TRABAJADOR) || up_(x.NOMBRE) === up_(t.NOMBRE);
  const trabajaron = {};
  leer_('LOG_APP').forEach(l => { if (diaKey_(l.FECHA_HORA) === dia) trabajaron[up_(l.USUARIO)] = true; });
  return trab.map(t => {
    const p = P.filter(x => num_(x.MONTO_PRESTADO) > 0 && de(x, t, 'ID_EMPLEADO'));
    const a = A.filter(x => num_(x['ABONA:']) !== 0 && de(x, t, 'ID_TRABAJADOR'));
    const prestado = r2_(p.reduce((s, x) => s + num_(x.MONTO_PRESTADO), 0));
    const abonado = r2_(a.reduce((s, x) => s + num_(x['ABONA:']), 0));
    const hoy = a.filter(x => diaKey_(x.FECHA) === dia && up_(x.METODO) === 'DESCUENTO DIARIO');
    const movs = p.map(x => ({ tipo: 'PRESTAMO', dia: diaKey_(x.FECHA), monto: num_(x.MONTO_PRESTADO), nota: norm_(x.MOTIVO) }))
      .concat(a.map(x => ({ tipo: 'ABONO', dia: diaKey_(x.FECHA), monto: num_(x['ABONA:']), nota: nice_(x.METODO) })))
      .sort((x, y) => x.dia < y.dia ? 1 : -1).slice(0, 12);
    return {
      id: norm_(t.ID_TRABAJADOR), nombre: norm_(t.NOMBRE), puesto: up_(t.PUESTO), prestado: prestado, abonado: abonado, saldo: r2_(prestado - abonado),
      descuento: num_(t.DESCUENTO_DIARIO), descontadoHoy: r2_(hoy.reduce((s, x) => s + num_(x['ABONA:']), 0)), trabajoHoy: !!trabajaron[up_(t.NOMBRE)], movimientos: movs,
    };
  });
}
function nice_(s) { s = norm_(s).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
function trabajador_(id) {
  const t = prestamos_().find(x => x.id === norm_(id));
  if (!t) throw new Error('No encontré a ese trabajador');
  return t;
}
function abonoTrabajador_(t, monto, metodo, fecha) {
  escribir_('ABONO_TRABAJADORES', { 'ID_ABONO': id_(), 'ID_TRABAJADOR': t.id, 'NOMBRE': t.nombre, 'ABONA:': monto, 'METODO': metodo, 'FECHA': fecha }, {
    'TOTAL_PRESTADO': r => '=SUMIF(PRESTAMO_TRABAJADORES!B:B, B' + r + ', PRESTAMO_TRABAJADORES!E:E)',
    'TOTAL_ABONADO': r => '=SUMIF(B:B, B' + r + ', D:D)',
    'SALDO_PENDIENTE': r => '=G' + r + '-H' + r,
  });
}

function apiPrestamos(token) {
  sesion_(token, true);
  hojaTrabajadoresDescuento_();
  return { trabajadores: prestamos_(), hoy: hoyKey_() };
}

function hojaTrabajadoresDescuento_() {
  const h = hoja_('TRABAJADORES');
  const enc = h.getRange(1, 1, 1, Math.max(1, h.getLastColumn())).getValues()[0].map(norm_);
  if (enc.indexOf('DESCUENTO_DIARIO') < 0) h.getRange(1, enc.filter(Boolean).length + 1).setValue('DESCUENTO_DIARIO');
}

function apiPrestamoNuevo(token, data) {
  const u = sesion_(token, true);
  const monto = r2_(num_(data.monto));
  if (monto <= 0) throw new Error('Escribe cuánto le prestaste');
  return conLock_(() => {
    hojaTrabajadoresDescuento_();
    const t = trabajador_(data.id);
    escribir_('PRESTAMO_TRABAJADORES', { 'ID_PRESTAMO': id_(), 'ID_EMPLEADO': t.id, 'NOMBRE': t.nombre, 'FECHA': fechaMov_(u, data.fecha), 'MONTO_PRESTADO': monto, 'MOTIVO': norm_(data.motivo).slice(0, 200), 'METODO': up_(data.metodo) === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO' });
    if (data.descuento !== '' && data.descuento != null) guardarDescuento_(t.id, data.descuento);
    log_(u.nombre, 'PRÉSTAMO', { trabajador: t.nombre, monto: monto });
    return { ok: true };
  });
}

function guardarDescuento_(id, monto) {
  const T = leer_('TRABAJADORES').find(x => norm_(x.ID_TRABAJADOR) === norm_(id));
  if (T) actualizar_('TRABAJADORES', T._fila, { 'DESCUENTO_DIARIO': Math.max(0, r2_(num_(monto))) });
}

function apiPrestamoDescuento(token, id, monto) {
  sesion_(token, true);
  return conLock_(() => { hojaTrabajadoresDescuento_(); guardarDescuento_(id, monto); return { ok: true }; });
}

/** Abono manual (pagó en efectivo) o "descontar hoy" (usa el descuento diario, una vez por día). */
function apiPrestamoAbono(token, data) {
  const u = sesion_(token, true);
  return conLock_(() => {
    const t = trabajador_(data.id);
    if (data.hoy) {
      if (t.descontadoHoy > 0) throw new Error('Hoy ya se le descontó ' + t.descontadoHoy);
      const m = Math.min(t.descuento, t.saldo);
      if (m <= 0) throw new Error(t.saldo <= 0 ? 'No debe nada' : 'Ponle primero cuánto se le descuenta al día');
      abonoTrabajador_(t, m, 'DESCUENTO DIARIO', fechaDeKey_(hoyKey_()));
      log_(u.nombre, 'DESCUENTO PRÉSTAMO', { trabajador: t.nombre, monto: m });
      return { ok: true, monto: m };
    }
    const monto = r2_(num_(data.monto));
    if (monto <= 0) throw new Error('Escribe el monto');
    abonoTrabajador_(t, monto, up_(data.metodo) === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO', fechaMov_(u, data.fecha));
    log_(u.nombre, 'ABONO PRÉSTAMO', { trabajador: t.nombre, monto: monto });
    return { ok: true, monto: monto };
  });
}

/** Cada noche: a quien trabajó hoy y debe, se le descuenta su monto diario (si no se hizo ya a mano). */
function descuentosDiarios_() {
  const hoy = hoyKey_();
  const hechos = [];
  conLock_(() => {
    prestamos_(hoy).forEach(t => {
      if (t.saldo > 0 && t.descuento > 0 && t.trabajoHoy && !t.descontadoHoy) {
        const m = Math.min(t.descuento, t.saldo);
        abonoTrabajador_(t, m, 'DESCUENTO DIARIO', fechaDeKey_(hoy));
        hechos.push(t.nombre + ': ' + m);
      }
    });
  });
  return hechos;
}

// ======================= CLIENTES Y CALIDAD =======================
function apiNuevoCliente(token, data) {
  const u = sesion_(token);
  return conLock_(() => {
    const nombre = up_(data.nombre);
    if (!nombre) throw new Error('Escribe el nombre');
    const clientes = leer_('CLIENTES');
    if (clientes.some(c => up_(c.NOMBRE) === nombre)) throw new Error('Ya existe un cliente con ese nombre');
    const precio = u.rol === 'DUENO' && num_(data.precio) > 0 ? num_(data.precio) : 20;
    let ubicacion = norm_(data.ubicacion), aprox = false;
    if (!ubic_(ubicacion) && data.direccion) { const pt = geocodificar_(data.direccion); if (pt) { ubicacion = pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6); aprox = true; } }
    const id = crearCliente_(clientes, { nombre: nombre, precio: precio, direccion: data.direccion, telefono: data.telefono, ubicacion: ubicacion });
    if (aprox) marcarAprox_(id);
    log_(u.nombre, 'CLIENTE NUEVO', { id: id, nombre: nombre });
    if (data.idPedido) {
      const p = leer_('PEDIDOS').find(x => norm_(x.ID_PEDIDO) === norm_(data.idPedido));
      if (p) actualizar_('PEDIDOS', p._fila, { 'ID_CLIENTE': id });
    }
    return { ok: true, id: id };
  });
}

function apiCalidad(token, data) {
  const u = sesion_(token);
  conLock_(() => escribir_('BITACORA_CALIDAD', {
    'ID_REGISTRO': id_(), 'FECHA_HORA': new Date(), 'RESPONSABLE': u.nombre, 'PUNTO_MUESTREO': up_(data.punto),
    'CLORO_RESIDUAL': data.cloro === '' ? '' : num_(data.cloro), 'TDS_PPM': data.tds === '' ? '' : num_(data.tds), 'PH': data.ph === '' ? '' : num_(data.ph),
  }));
  log_(u.nombre, 'CALIDAD', data);
  return { ok: true };
}

// ======================= AVISOS ENTRE EL EQUIPO =======================
function hojaAvisos_() {
  const ss = ss_();
  let h = ss.getSheetByName('AVISOS');
  if (!h) {
    h = ss.insertSheet('AVISOS');
    h.getRange(1, 1, 1, HOJAS_NUEVAS.AVISOS.length).setValues([HOJAS_NUEVAS.AVISOS]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
}

function visibleAviso_(a, u) {
  if (u.rol === 'DUENO') return true;
  const para = up_(a.PARA);
  return para === 'TODOS' || para === u.rol || para === up_(u.nombre) || up_(a.DE) === up_(u.nombre);
}

function leidoPor_(a) { return norm_(a.LEIDO_POR).split(',').map(up_).filter(Boolean); }

/** Avisos recientes para quien pregunta y cuántos no ha visto. */
function apiAvisos(token) {
  const u = sesion_(token);
  hojaAvisos_();
  const hace = new Date(Date.now() - 4 * 864e5);
  const todos = leer_('AVISOS').filter(a => visibleAviso_(a, u));
  const lista = todos.filter(a => up_(a.ESTATUS) !== 'ATENDIDO' || (a.FECHA_HORA instanceof Date && a.FECHA_HORA > hace))
    .map(a => {
      const lp = leidoPor_(a);
      return {
        id: norm_(a.ID_AVISO), cuando: a.FECHA_HORA instanceof Date ? a.FECHA_HORA.getTime() : 0, de: norm_(a.DE), rolDe: up_(a.ROL_DE), para: up_(a.PARA),
        tipo: up_(a.TIPO) || 'INDICACION', mensaje: norm_(a.MENSAJE), estatus: up_(a.ESTATUS) || 'ABIERTO', leidoPor: lp, atendio: norm_(a.ATENDIO),
        mio: up_(a.DE) === up_(u.nombre), leido: up_(a.DE) === up_(u.nombre) || lp.indexOf(up_(u.nombre)) >= 0,
      };
    }).sort((x, y) => y.cuando - x.cuando).slice(0, 60);
  const noLeidos = lista.filter(a => !a.leido);
  return { avisos: lista, noLeidos: noLeidos.length, ultimoNoLeido: noLeidos[0] || null, ahora: Date.now() };
}

function apiAvisoNuevo(token, data) {
  const u = sesion_(token);
  const msg = norm_(data.mensaje).slice(0, 500);
  if (!msg) throw new Error('Escribe el aviso');
  const tipo = ['SOLICITUD', 'PROBLEMA', 'INDICACION', 'URGENTE'].indexOf(up_(data.tipo)) >= 0 ? up_(data.tipo) : 'INDICACION';
  const para = ['TODOS', 'DUENO', 'RUTA', 'PLANTA'].indexOf(up_(data.para)) >= 0 ? up_(data.para) : 'TODOS';
  hojaAvisos_();
  const id = id_();
  conLock_(() => escribir_('AVISOS', { 'ID_AVISO': id, 'FECHA_HORA': new Date(), 'DE': u.nombre, 'ROL_DE': u.rol, 'PARA': para, 'TIPO': tipo, 'MENSAJE': msg, 'ESTATUS': 'ABIERTO', 'LEIDO_POR': '' }));
  if (tipo === 'URGENTE' && u.rol !== 'DUENO') {
    try { MailApp.sendEmail(CONFIG.CORREO_DUENO, 'URGENTE · ' + u.nombre + ': ' + msg.slice(0, 60), u.nombre + ' mandó un aviso urgente desde la app:\n\n' + msg + '\n\nÁbrelo en la app para marcarlo como resuelto.'); } catch (e) {}
  }
  log_(u.nombre, 'AVISO ' + tipo, msg);
  notificar_('AVISOS', para === 'TODOS' ? 'TODOS' : para + ',DUENO', (tipo === 'URGENTE' ? 'Urgente: ' : 'Aviso de ') + nice_(u.nombre), msg, 'avisos', u.nombre);
  return { ok: true, id: id };
}

function apiAvisoLeido(token, ids) {
  const u = sesion_(token);
  ids = (ids || []).map(norm_);
  if (!ids.length) return { ok: true };
  hojaAvisos_();
  conLock_(() => {
    leer_('AVISOS').forEach(a => {
      if (ids.indexOf(norm_(a.ID_AVISO)) < 0) return;
      const lp = leidoPor_(a);
      if (lp.indexOf(up_(u.nombre)) >= 0) return;
      lp.push(up_(u.nombre));
      actualizar_('AVISOS', a._fila, { 'LEIDO_POR': lp.join(', ') });
    });
  });
  return { ok: true };
}

function apiAvisoAtendido(token, id) {
  const u = sesion_(token);
  hojaAvisos_();
  conLock_(() => {
    const a = leer_('AVISOS').find(x => norm_(x.ID_AVISO) === norm_(id));
    if (!a) throw new Error('No encontré ese aviso');
    const lp = leidoPor_(a); if (lp.indexOf(up_(u.nombre)) < 0) lp.push(up_(u.nombre));
    actualizar_('AVISOS', a._fila, { 'ESTATUS': 'ATENDIDO', 'ATENDIO': u.nombre, 'FECHA_ATENDIDO': new Date(), 'LEIDO_POR': lp.join(', ') });
  });
  log_(u.nombre, 'AVISO RESUELTO', id);
  return { ok: true };
}

// ======================= PANEL DEL DUEÑO =======================
function apiPanel(token, desde, hasta) {
  sesion_(token, true);
  return panel_(desde, hasta);
}

function panel_(desde, hasta) {
  const hoy = hoyKey_();
  hasta = hasta || hoy; desde = desde || hasta.slice(0, 8) + '01';
  const n = difDias_(hasta, desde) + 1;
  const pDesde = sumaDias_(desde, -n), pHasta = sumaDias_(desde, -1);
  const B = base_();
  const en = (d, a, b) => { const k = diaKey_(d); return k && k >= a && k <= b; };
  const V = B.ventas.filter(v => en(v.FECHA, desde, hasta));
  const Vp = B.ventas.filter(v => en(v.FECHA, pDesde, pHasta));
  const A = B.abonos.filter(a => en(a.FECHA, desde, hasta));
  const G = leer_('GASTOS').filter(g => en(g.FECHA, desde, hasta));
  const C = leer_('COMPRAS').filter(c => en(c.FECHA, desde, hasta));
  const Bal = leer_('BALANCE_DIARIO').filter(b => en(b.FECHA, desde, hasta));
  const sum = (arr, f) => r2_(arr.reduce((s, x) => s + f(x), 0));
  const tot = x => num_(x.TOTAL);
  const P = CONFIG.ID_CLIENTE_PLANTA;
  const comisionDe = arr => sum(arr.filter(v => norm_(v.ID_CLIENTE) !== P), v => num_(v.CANTIDAD) * (CONFIG.COMISION[up_(v.PRODUCTO)] || 0));

  const garr = V.filter(v => up_(v.PRODUCTO) === 'GARRAFON');
  const r = {
    desde: desde, hasta: hasta, dias: n, anteriorDesde: pDesde, anteriorHasta: pHasta,
    ventas: sum(V, tot), ventasAnterior: sum(Vp, tot),
    efectivo: sum(V.filter(v => up_(v.METODO) === 'EFECTIVO'), tot),
    transferencia: sum(V.filter(v => up_(v.METODO) === 'TRANSFERENCIA'), tot),
    credito: sum(V.filter(v => up_(v.METODO) === 'CREDITO'), tot),
    abonos: sum(A, x => num_(x.MONTO)),
    garrafones: sum(garr, x => num_(x.CANTIDAD)), garrafonesAnterior: sum(Vp.filter(v => up_(v.PRODUCTO) === 'GARRAFON'), x => num_(x.CANTIDAD)),
    galones: sum(V.filter(v => up_(v.PRODUCTO) === 'GALON'), x => num_(x.CANTIDAD)),
    precioPromedio: 0,
    ventasPlanta: sum(V.filter(v => norm_(v.ID_CLIENTE) === P), tot),
    comisiones: comisionDe(V),
    gastos: sum(G, tot), compras: sum(C, tot),
    diferenciasCorte: sum(Bal.filter(b => b.EFECTIVO_ENTREGADO !== '' && b.EFECTIVO_ENTREGADO != null), b => num_(b.DIFERENCIA)),
  };
  r.precioPromedio = r.garrafones ? r2_(sum(garr, tot) / r.garrafones) : 0;
  r.utilidad = r2_(r.ventas - r.comisiones - r.gastos - r.compras);
  r.cobradoReal = r2_(r.efectivo + r.transferencia + r.abonos);

  // por día
  const porDia = {};
  for (let i = 0; i < n; i++) porDia[sumaDias_(desde, i)] = { ventas: 0, garrafones: 0, gastos: 0 };
  V.forEach(v => { const k = diaKey_(v.FECHA); porDia[k].ventas += tot(v); if (up_(v.PRODUCTO) === 'GARRAFON') porDia[k].garrafones += num_(v.CANTIDAD); });
  G.concat(C).forEach(g => { const k = diaKey_(g.FECHA); if (porDia[k]) porDia[k].gastos += tot(g); });
  r.porDia = Object.keys(porDia).map(k => ({ dia: k, ventas: r2_(porDia[k].ventas), garrafones: porDia[k].garrafones, gastos: r2_(porDia[k].gastos) }));

  // gastos por categoría
  const cat = {};
  G.forEach(g => { const k = up_(g.GASTO) || 'OTRO'; cat[k] = (cat[k] || 0) + tot(g); });
  C.forEach(c => { const k = 'INSUMO: ' + up_(c.PRODUCTO); cat[k] = (cat[k] || 0) + tot(c); });
  r.gastosPorCategoria = Object.keys(cat).map(k => ({ categoria: k, total: r2_(cat[k]) })).sort((a, b) => b.total - a.total);

  // clientes
  const porGrupo = (arr) => { const o = {}; arr.forEach(v => { const g = B.grupoDe[norm_(v.ID_CLIENTE)]; if (!g) return; o[g.base] = (o[g.base] || 0) + tot(v); }); return o; };
  const act = porGrupo(V), ant = porGrupo(Vp);
  const todos = listaClientes_(B, hoy);
  const idx = {}; todos.forEach(c => { idx[c.nombre] = c; });
  r.topClientes = Object.keys(act).map(k => ({ nombre: k, total: r2_(act[k]), anterior: r2_(ant[k] || 0) })).sort((a, b) => b.total - a.total).slice(0, 15);
  r.bajaron = Object.keys(ant).map(k => ({ nombre: k, total: r2_(act[k] || 0), anterior: r2_(ant[k]) }))
    .filter(x => x.anterior >= 200 && x.total < x.anterior * 0.6 && (!idx[x.nombre] || idx[x.nombre].estatus !== 'INACTIVO'))
    .sort((a, b) => (b.anterior - b.total) - (a.anterior - a.total)).slice(0, 12);
  r.deudores = todos.filter(c => c.saldo > 0.5).map(c => ({ id: c.id, nombre: c.nombre, saldo: c.saldo, telefono: c.telefono, diasDesde: c.diasDesde, estatus: c.estatus }))
    .sort((a, b) => b.saldo - a.saldo);
  r.porCobrar = r2_(r.deudores.reduce((s, d) => s + d.saldo, 0));
  r.perdidos = todos.filter(c => c.nombre !== CONFIG.NOMBRE_CLIENTE_PASO && c.estatus !== 'INACTIVO' && c.visitas >= 2 && c.diasDesde > CONFIG.DIAS_CLIENTE_PERDIDO && c.id !== P)
    .map(c => ({ nombre: c.nombre, diasDesde: c.diasDesde, telefono: c.telefono })).sort((a, b) => a.diasDesde - b.diasDesde);
  r.clientes = todos.filter(c => c.id !== P && c.nombre !== CONFIG.NOMBRE_CLIENTE_PASO).map(c => ({ id: c.id, nombre: c.nombre, saldo: c.saldo, ultima: c.ultima, diasDesde: c.diasDesde, frecuencia: c.frecuencia, promGarrafon: c.promGarrafon, promGalon: c.promGalon, precio: c.precios.GARRAFON, estatus: c.estatus, telefono: c.telefono }));

  // cortes
  r.cortes = Bal.filter(b => b.EFECTIVO_ENTREGADO !== '' && b.EFECTIVO_ENTREGADO != null)
    .map(b => ({ dia: diaKey_(b.FECHA), esperado: num_(b.TOTAL_ESPERADO), entregado: num_(b.EFECTIVO_ENTREGADO), diferencia: num_(b.DIFERENCIA) }))
    .sort((a, b) => (a.dia < b.dia ? 1 : -1));
  r.hoy = cuentasDia_(hoy);

  // ventas recientes
  r.ventasDetalle = V.slice(-300).reverse().map(v => {
    const g = B.grupoDe[norm_(v.ID_CLIENTE)];
    return { id: norm_(v.ID_VENTA), dia: diaKey_(v.FECHA), cliente: g ? g.base : norm_(v.ID_CLIENTE), producto: up_(v.PRODUCTO), cantidad: num_(v.CANTIDAD), precio: num_(v['P.U.']), total: tot(v), metodo: up_(v.METODO) };
  });
  r.gastosDetalle = G.map(g => ({ dia: diaKey_(g.FECHA), concepto: up_(g.GASTO), total: tot(g), metodo: up_(g.METODO) }))
    .concat(C.map(c => ({ dia: diaKey_(c.FECHA), concepto: 'COMPRA ' + up_(c.PRODUCTO) + ' x' + num_(c.CANTIDAD), total: tot(c), metodo: up_(c.METODO) })))
    .sort((a, b) => (a.dia < b.dia ? 1 : -1));
  r.pedidos = pedidosPendientes_();
  r.actividad = leer_('LOG_APP').slice(-60).reverse().map(l => ({ cuando: l.FECHA_HORA instanceof Date ? Utilities.formatDate(l.FECHA_HORA, CONFIG.ZONA, 'dd/MM HH:mm') : norm_(l.FECHA_HORA), usuario: norm_(l.USUARIO), accion: norm_(l.ACCION), detalle: norm_(l.DETALLE) }));
  r.recorrido = leer_('LOG_APP').filter(l => up_(l.ACCION) === 'VENTA' && en(l.FECHA_HORA, desde, hasta)).map(l => {
    let d = {}; try { d = JSON.parse(l.DETALLE); } catch (e) {}
    return { dia: diaKey_(l.FECHA_HORA), hora: l.FECHA_HORA instanceof Date ? Utilities.formatDate(l.FECHA_HORA, CONFIG.ZONA, 'HH:mm') : (d.hora || ''), usuario: norm_(l.USUARIO), cliente: d.cliente || '', total: num_(d.total), garrafones: num_(d.garrafones), lat: d.lat == null ? null : num_(d.lat), lon: d.lon == null ? null : num_(d.lon), precision: d.precision == null ? null : num_(d.precision), distancia: d.distancia_m == null ? null : num_(d.distancia_m), ruta: d.ruta !== false };
  }).filter(x => x.ruta);
  r.distanciaAlerta = CONFIG.DISTANCIA_ALERTA_M;
  r.linkPedidos = urlApp_() + '?p=pedido';
  r.usuarios = leer_('USUARIOS_APP').map(u => ({ nombre: norm_(u.NOMBRE), rol: up_(u.ROL), activo: up_(u.ACTIVO) !== 'NO' }));
  return r;
}

// ======================= REPORTE DIARIO POR CORREO =======================
function reporteDiario() {
  const hoy = hoyKey_();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('reporte_enviado') === hoy) return 'ya enviado';
  props.setProperty('reporte_enviado', hoy);
  const r = panel_(hoy, hoy);
  const c = r.hoy;
  const m = x => '$' + Number(x).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const lineas = [
    CONFIG.NEGOCIO + ' · Resumen del ' + hoy,
    '',
    'Ventas: ' + m(r.ventas) + ' (' + r.garrafones + ' garrafones, ' + r.galones + ' galones)',
    'Efectivo: ' + m(r.efectivo) + ' · Transferencia: ' + m(r.transferencia) + ' · Fiado: ' + m(r.credito),
    'Cobros de fiado: ' + m(r.abonos),
    'Gastos y compras: ' + m(r.gastos + r.compras) + ' · Comisiones: ' + m(r.comisiones),
    'Utilidad estimada del día: ' + m(r.utilidad),
    '',
    'Efectivo esperado: ' + m(c.esperado) + (r.cortes.length ? ' · Entregado: ' + m(r.cortes[0].entregado) + ' · Diferencia: ' + m(r.cortes[0].diferencia) : ' · Corte sin cerrar'),
    'Garrafones: salieron ' + c.salieron + ', regresaron llenos ' + c.regresaronLlenos + ', rotos ' + c.rotos,
    '',
    'Por cobrar total: ' + m(r.porCobrar),
    'Pedidos pendientes: ' + r.pedidos.length,
  ];
  try {
    const d = descuentosDiarios_();
    if (d.length) lineas.push('', 'Descuentos de préstamos hoy: ' + d.join(' · '));
  } catch (e) {}
  try {
    const ag = agendaPendientes_().filter(a => a.faltan != null && a.faltan <= Math.max(a.avisar, 1));
    if (ag.length) {
      lineas.push('', 'AGENDA:');
      ag.forEach(a => lineas.push('- ' + a.actividad + ': ' + (a.faltan < 0 ? 'VENCIDO hace ' + (-a.faltan) + ' días' : a.faltan === 0 ? 'HOY' : a.faltan === 1 ? 'mañana' : 'en ' + a.faltan + ' días') + ' (' + a.fecha + ')'));
      hojaAvisos_();
      ag.filter(a => a.faltan >= 0 && a.faltan <= 1 && props.getProperty('agaviso_' + a.id) !== a.fecha).forEach(a => {
        props.setProperty('agaviso_' + a.id, a.fecha);
        escribir_('AVISOS', { 'ID_AVISO': id_(), 'FECHA_HORA': new Date(), 'DE': 'AGENDA', 'ROL_DE': 'SISTEMA', 'PARA': 'DUENO', 'TIPO': 'INDICACION', 'MENSAJE': (a.faltan === 0 ? 'Hoy toca: ' : 'Mañana toca: ') + a.actividad + (a.nota ? ' · ' + a.nota : ''), 'ESTATUS': 'ABIERTO', 'LEIDO_POR': '' });
      });
    }
  } catch (e) {}
  MailApp.sendEmail(CONFIG.CORREO_DUENO, 'Resumen ' + hoy + ' · ' + CONFIG.NEGOCIO, lineas.join('\n'));
}

// ======================= CONTROLES Y CUADRE =======================
function dinero_(n) { return '$' + (Math.round(num_(n) * 100) / 100).toLocaleString('es-MX'); }
function esc_(s) { return norm_(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** Asegura una columna en CLIENTES y regresa su número. */
function columnaCliente_(nombre) {
  const h = hoja_('CLIENTES');
  const enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(norm_);
  const i = enc.indexOf(nombre);
  if (i >= 0) return i + 1;
  h.getRange(1, enc.length + 1).setValue(nombre);
  return enc.length + 1;
}

/** Fiado máximo del cliente: su LIMITE_CREDITO en CLIENTES o el general. */
function limiteCredito_(g) {
  const l = num_(g && g.principal && g.principal.LIMITE_CREDITO);
  return l > 0 ? l : CONFIG.LIMITE_CREDITO;
}

function avisoDueno_(u, mensaje, tipo) {
  try {
    hojaAvisos_();
    escribir_('AVISOS', { 'ID_AVISO': id_(), 'FECHA_HORA': new Date(), 'DE': u.nombre || 'SISTEMA', 'ROL_DE': u.rol || 'SISTEMA', 'PARA': 'DUENO', 'TIPO': tipo || 'INDICACION', 'MENSAJE': mensaje, 'ESTATUS': 'ABIERTO', 'LEIDO_POR': '' });
  } catch (e) { /* un aviso nunca frena una venta */ }
  notificar_('AVISOS', 'DUENO', 'Aviso: ' + nice_(u.nombre || 'El Diamante'), mensaje, 'avisos');
}
function avisoA_(para, mensaje, tipo) {
  try {
    hojaAvisos_();
    escribir_('AVISOS', { 'ID_AVISO': id_(), 'FECHA_HORA': new Date(), 'DE': 'OSCAR', 'ROL_DE': 'DUENO', 'PARA': para, 'TIPO': tipo || 'INDICACION', 'MENSAJE': mensaje, 'ESTATUS': 'ABIERTO', 'LEIDO_POR': '' });
  } catch (e) {}
  notificar_('AVISOS', para, tipo === 'URGENTE' ? 'Urgente de Oscar' : 'Aviso de Oscar', mensaje, 'avisos');
}

// ---------- transferencias por confirmar ----------
function porConfirmar_(tipo, idMov, cliente, monto, quien) {
  hojaNueva_('VERIFICACIONES');
  escribir_('VERIFICACIONES', { 'ID': id_(), 'FECHA': fechaDeKey_(hoyKey_()), 'TIPO': tipo, 'ID_MOV': idMov, 'CLIENTE': cliente, 'MONTO': monto, 'REGISTRO': quien, 'ESTATUS': 'PENDIENTE' });
  avisoDueno_({ nombre: quien, rol: 'SISTEMA' }, 'Revisa tu banco: ' + quien + ' registró una transferencia de ' + dinero_(monto) + ' de ' + cliente + ' (' + (tipo === 'VENTA' ? 'venta' : 'abono') + '). Confírmala en Cuadre del negocio.');
}
function verificacionesPendientes_() {
  return leer_('VERIFICACIONES').filter(v => up_(v.ESTATUS) === 'PENDIENTE').map(v => ({
    id: norm_(v.ID), dia: diaKey_(v.FECHA), tipo: up_(v.TIPO), cliente: norm_(v.CLIENTE), monto: num_(v.MONTO), registro: norm_(v.REGISTRO),
  }));
}
function apiVerificaciones(token) { sesion_(token, true); return verificacionesPendientes_(); }

/** El dueño revisa su banco. accion: OK (llegó), FIADO (no pagó: pasa a fiado o se anula el abono), REPARTIDOR (se cuenta como efectivo que debe entregar). */
function apiVerificar(token, id, accion) {
  const u = sesion_(token, true);
  accion = up_(accion);
  if (['OK', 'FIADO', 'REPARTIDOR'].indexOf(accion) < 0) throw new Error('Acción no válida');
  return conLock_(() => {
    const v = leer_('VERIFICACIONES').find(x => norm_(x.ID) === norm_(id));
    if (!v) throw new Error('No encontré esa transferencia');
    if (up_(v.ESTATUS) !== 'PENDIENTE') throw new Error('Esa transferencia ya se revisó');
    const tipo = up_(v.TIPO), ids = norm_(v.ID_MOV).split(',').map(norm_).filter(Boolean);
    if (accion !== 'OK') {
      if (tipo === 'VENTA') {
        leer_('VENTAS').filter(x => ids.indexOf(norm_(x.ID_VENTA)) >= 0).forEach(x => actualizar_('VENTAS', x._fila, { 'METODO': accion === 'FIADO' ? 'CREDITO' : 'EFECTIVO' }));
      } else {
        leer_('ABONOS').filter(x => ids.indexOf(norm_(x.ID_ABONO)) >= 0).forEach(x => {
          if (accion === 'FIADO') actualizar_('ABONOS', x._fila, { 'MONTO': 0, 'COMENTARIOS': norm_(x.COMENTARIOS) + ' · ANULADO: la transferencia de ' + dinero_(v.MONTO) + ' no llegó' });
          else actualizar_('ABONOS', x._fila, { 'METODO': 'EFECTIVO' });
        });
      }
      if (accion === 'REPARTIDOR') avisoA_(up_(v.REGISTRO), 'La transferencia de ' + dinero_(v.MONTO) + ' de ' + norm_(v.CLIENTE) + ' no llegó a la cuenta. Se cuenta como efectivo que debes entregar.', 'URGENTE');
    }
    const est = { OK: 'CONFIRMADA', FIADO: tipo === 'VENTA' ? 'NO LLEGO · A FIADO' : 'NO LLEGO · ABONO ANULADO', REPARTIDOR: 'NO LLEGO · LO PAGA ' + up_(v.REGISTRO) }[accion];
    actualizar_('VERIFICACIONES', v._fila, { 'ESTATUS': est, 'REVISO': u.nombre, 'FECHA_REVISION': new Date() });
    log_(u.nombre, 'TRANSFERENCIA ' + (accion === 'OK' ? 'CONFIRMADA' : 'RECHAZADA'), { id: id, cliente: norm_(v.CLIENTE), monto: num_(v.MONTO), accion: accion });
    return { ok: true, estatus: est, pendientes: verificacionesPendientes_() };
  });
}

// ---------- ticket por WhatsApp y estado de cuenta ----------
function linkCuenta_(g) { return urlApp_() + '?p=cuenta&c=' + codigoCliente_(norm_(g.principal.ID_CLIENTE)); }
function telCliente_(g) { const t = digitos_(g.principal.TELEFONO).replace(/^52(?=\d{10}$)/, ''); return t.length === 10 ? t : ''; }
function B_nombre_(idCliente) {
  try { const c = leer_('CLIENTES').find(x => norm_(x.ID_CLIENTE) === norm_(idCliente)); return c ? fichaDe_(c.NOMBRE).base.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()) : ''; } catch (e) { return ''; }
}
function nombreProd_(p, n) {
  const uno = n === 1;
  return ({ GARRAFON: uno ? 'garrafón' : 'garrafones', GALON: uno ? 'galón' : 'galones', 'BOTELLA 1 LT': uno ? 'botella de 1 L' : 'botellas de 1 L', 'BOTELLA 1/2 LT': uno ? 'botella de 1/2 L' : 'botellas de 1/2 L', HIELO: uno ? 'bolsa de hielo' : 'bolsas de hielo', GALONCAMB: uno ? 'cambio de galón' : 'cambios de galón' })[up_(p)] || nice_(p).toLowerCase();
}
function ticketVenta_(g, items, metodo, total, saldo) {
  const ahora = Utilities.formatDate(new Date(), CONFIG.ZONA, 'dd/MM/yyyy HH:mm');
  const lineas = items.map(x => '• ' + x.cantidad + ' ' + nombreProd_(x.producto, x.cantidad) + ' × ' + dinero_(x.precio) + ' = ' + dinero_(x.total));
  const texto = ['*' + CONFIG.NEGOCIO + '*', 'Ticket de venta · ' + ahora, 'Cliente: ' + g.base, ''].concat(lineas).concat([
    '', 'Total: *' + dinero_(total) + '*', 'Pago: ' + ({ EFECTIVO: 'efectivo', TRANSFERENCIA: 'transferencia', CREDITO: 'a cuenta (fiado)' }[metodo] || metodo.toLowerCase()),
    'Saldo pendiente: ' + dinero_(Math.max(0, saldo)), '', 'Tus compras y tu saldo: ' + linkCuenta_(g), 'Si algo no coincide con lo que pagaste, avísale a Oscar. ¡Gracias!']).join('\n');
  return { ids: items.map(x => x.id), telefono: telCliente_(g), texto: texto, idCliente: norm_(g.principal.ID_CLIENTE) };
}
function ticketAbono_(g, idA, monto, metodo, saldo) {
  const ahora = Utilities.formatDate(new Date(), CONFIG.ZONA, 'dd/MM/yyyy HH:mm');
  const texto = ['*' + CONFIG.NEGOCIO + '*', 'Recibo de pago · ' + ahora, 'Cliente: ' + g.base, '', 'Pagaste: *' + dinero_(monto) + '* (' + (metodo === 'TRANSFERENCIA' ? 'transferencia' : 'efectivo') + ')',
    'Saldo pendiente: ' + dinero_(Math.max(0, saldo)), '', 'Tus compras y tu saldo: ' + linkCuenta_(g), 'Si algo no coincide, avísale a Oscar. ¡Gracias!'].join('\n');
  return { ids: [idA], telefono: telCliente_(g), texto: texto, idCliente: norm_(g.principal.ID_CLIENTE) };
}
function apiTicket(token, ids, idCliente) {
  const u = sesion_(token);
  log_(u.nombre, 'TICKET', { ids: (ids || []).slice(0, 10), cliente: norm_(idCliente) });
  return { ok: true };
}

/** Guarda el WhatsApp del cliente. Un trabajador solo puede ponerlo si estaba vacío (para que nadie desvíe los tickets). */
function apiTelefono(token, idCliente, tel) {
  const u = sesion_(token);
  return conLock_(() => {
    const B = base_();
    const g = B.grupoDe[norm_(idCliente)];
    if (!g) throw new Error('Cliente no encontrado');
    const t = digitos_(tel).replace(/^52(?=\d{10}$)/, '');
    if (t.length !== 10) throw new Error('Escribe el WhatsApp a 10 dígitos.');
    const antes = telCliente_(g);
    if (antes && antes !== t && u.rol !== 'DUENO') throw new Error('Este cliente ya tiene teléfono. Solo Oscar lo puede cambiar.');
    actualizar_('CLIENTES', g.principal._fila, { 'TELEFONO': t });
    log_(u.nombre, 'TELEFONO', { cliente: g.base, antes: antes, ahora: t });
    return { ok: true, telefono: t };
  });
}

function apiLimite(token, idCliente, monto) {
  const u = sesion_(token, true);
  return conLock_(() => {
    const B = base_();
    const g = B.grupoDe[norm_(idCliente)];
    if (!g) throw new Error('Cliente no encontrado');
    const m = Math.round(num_(monto));
    if (m < 0) throw new Error('El límite no puede ser negativo');
    columnaCliente_('LIMITE_CREDITO');
    actualizar_('CLIENTES', g.principal._fila, { 'LIMITE_CREDITO': m || '' });
    log_(u.nombre, 'LIMITE CREDITO', { cliente: g.base, limite: m });
    return { ok: true, limite: m || CONFIG.LIMITE_CREDITO };
  });
}

/** Página pública "Mi cuenta": el cliente ve sus compras, pagos y saldo con su liga personal. */
const LOGO_CUENTA_ = 'data:image/webp;base64,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';
function cuentaHTML_(codigo) {
  const css = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"><style>' +
    ':root{--bg:#04070b;--panel:#0a1017;--ink:#e9f6ff;--muted:#7d91a4;--line:rgba(0,200,255,.16);--agua:#00c8ff;--ok:#3dffa8;--warn:#ffc247}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg) radial-gradient(120% 50% at 50% -8%,rgba(0,200,255,.16),transparent 60%) no-repeat;color:var(--ink);font:15px/1.5 "Plus Jakarta Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}' +
    'main{max-width:520px;margin:0 auto;padding:28px 18px 48px}.logo{display:block;width:118px;margin:0 auto 6px;filter:drop-shadow(0 0 14px rgba(0,200,255,.45))}' +
    '.quien{text-align:center;color:var(--muted);font-size:14px;margin:0 0 22px}.quien b{display:block;color:var(--ink);font-size:20px;letter-spacing:-.02em}' +
    '.saldo{position:relative;overflow:hidden;border-radius:24px;padding:24px 22px;border:1px solid color-mix(in srgb,var(--t) 55%,transparent);background:radial-gradient(120% 140% at 100% 0%,color-mix(in srgb,var(--t) 18%,transparent),transparent 60%),var(--panel);box-shadow:0 0 34px color-mix(in srgb,var(--t) 18%,transparent)}' +
    '.saldo p{margin:0;color:var(--muted);font-size:14px}.saldo .n{font-weight:800;font-size:44px;letter-spacing:-.04em;color:var(--t);text-shadow:0 0 22px color-mix(in srgb,var(--t) 50%,transparent);line-height:1.15;margin:4px 0 2px}' +
    'h2{font-size:16px;margin:30px 0 12px;letter-spacing:-.01em}.dia{position:relative;padding:0 0 16px 22px;border-left:2px solid var(--line);margin-left:6px}.dia:last-child{padding-bottom:0}' +
    '.dia::before{content:"";position:absolute;left:-7px;top:3px;width:12px;height:12px;border-radius:50%;background:var(--bg);border:2px solid var(--agua);box-shadow:0 0 8px rgba(0,200,255,.6)}' +
    '.dia>span{display:block;font-size:13px;font-weight:700;color:var(--agua);margin-bottom:6px}.it{display:flex;justify-content:space-between;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:11px 14px;margin-bottom:6px}' +
    '.it small{display:block;color:var(--muted);font-size:12.5px}.it b{white-space:nowrap;font-variant-numeric:tabular-nums}.pago{color:var(--ok)}.nota{margin-top:28px;color:var(--muted);font-size:13px;text-align:center}</style>';
  const pagina = cuerpo => '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#04070b">' + css +
    '</head><body><main><img class="logo" src="' + LOGO_CUENTA_ + '" alt="Purificadora El Diamante">' + cuerpo + '</main></body></html>';
  const id = idDeCodigo_(codigo);
  if (!id) return pagina('<p class="quien">Esta liga no es válida. Pide tu liga a la purificadora.</p>');
  const B = base_();
  const g = B.grupoDe[id];
  if (!g) return pagina('<p class="quien">No encontramos tu cuenta. Pide tu liga a la purificadora.</p>');
  const saldo = saldo_(B, g);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fmt = k => +k.slice(8, 10) + ' de ' + meses[+k.slice(5, 7) - 1];
  const pago = m => ({ EFECTIVO: 'pagado en efectivo', TRANSFERENCIA: 'pagado por transferencia', CREDITO: 'a cuenta' }[up_(m)] || nice_(m).toLowerCase());
  const ventas = B.ventas.filter(v => g.ids.indexOf(norm_(v.ID_CLIENTE)) >= 0 && diaKey_(v.FECHA)).map(v => ({ k: diaKey_(v.FECHA), v: v })).sort((a, b) => (a.k < b.k ? 1 : -1)).slice(0, 30);
  const abonos = B.abonos.filter(a => g.ids.indexOf(norm_(a.ID_CLIENTE)) >= 0 && num_(a.MONTO) > 0 && up_(a.METODO) !== 'AJUSTE' && diaKey_(a.FECHA)).map(a => ({ k: diaKey_(a.FECHA), a: a })).sort((a, b) => (a.k < b.k ? 1 : -1)).slice(0, 15);
  const porDia = {};
  ventas.forEach(x => (porDia[x.k] || (porDia[x.k] = [])).push('<div class="it"><div>' + num_(x.v.CANTIDAD) + ' ' + esc_(nombreProd_(x.v.PRODUCTO, num_(x.v.CANTIDAD))) + '<small>' + dinero_(x.v['P.U.']) + ' c/u, ' + pago(x.v.METODO) + '</small></div><b>' + dinero_(x.v.TOTAL) + '</b></div>'));
  abonos.forEach(x => (porDia[x.k] || (porDia[x.k] = [])).push('<div class="it"><div class="pago">Tu pago<small>' + (up_(x.a.METODO) === 'TRANSFERENCIA' ? 'por transferencia' : 'en efectivo') + '</small></div><b class="pago">' + dinero_(x.a.MONTO) + '</b></div>'));
  const dias = Object.keys(porDia).sort().reverse();
  const debe = saldo > 0.5;
  return pagina('<p class="quien">Cuenta de<b>' + esc_(norm_(g.base).toLowerCase().replace(/(^|\s)(\S)/g, (m, x, y) => x + y.toUpperCase())) + '</b></p>' +
    '<section class="saldo" style="--t:' + (debe ? 'var(--warn)' : 'var(--ok)') + '"><p>' + (debe ? 'Tienes a cuenta' : 'Estás al corriente') + '</p><div class="n">' + dinero_(Math.max(0, saldo)) + '</div><p>' + (debe ? 'Puedes pagarle al repartidor o por transferencia.' : 'No debes nada. ¡Gracias por tu preferencia!') + '</p></section>' +
    '<h2>Tus compras y pagos</h2>' + (dias.length ? dias.map(k => '<div class="dia"><span>' + fmt(k) + '</span>' + porDia[k].join('') + '</div>').join('') : '<p class="quien">Aún no hay movimientos.</p>') +
    '<p class="nota">Si algo no coincide con lo que pagaste o recibiste, avísale directamente a Oscar.<br>Actualizado el ' + Utilities.formatDate(new Date(), CONFIG.ZONA, 'dd/MM/yyyy') + ' a las ' + Utilities.formatDate(new Date(), CONFIG.ZONA, 'HH:mm') + '.</p>');
}

// ---------- Cuadre del negocio (solo dueño) ----------
function apiControl(token, desde, hasta) {
  sesion_(token, true);
  const hoy = hoyKey_();
  hasta = hasta || hoy; desde = desde || sumaDias_(hasta, -6);
  const en = k => k && k >= desde && k <= hasta;
  const B = base_();
  const P = CONFIG.ID_CLIENTE_PLANTA;
  const duenos = leer_('USUARIOS_APP').filter(x => up_(x.ROL) === 'DUENO').map(x => up_(x.NOMBRE));
  const log = leer_('LOG_APP').filter(l => en(diaKey_(l.FECHA_HORA)));
  const det = l => { try { return JSON.parse(norm_(l.DETALLE)); } catch (e) { return {}; } };
  const minutos = (l, d) => {
    const m = String(d.hora || '').match(/(\d{1,2}):(\d{2})/); if (m) return +m[1] * 60 + +m[2];
    if (l.FECHA_HORA instanceof Date) { const h = Utilities.formatDate(l.FECHA_HORA, CONFIG.ZONA, 'HH:mm').split(':'); return +h[0] * 60 + +h[1]; }
    return null;
  };
  // quién registró cada venta
  const vendedor = {};
  const porTrab = {};
  const T = n => porTrab[n] || (porTrab[n] = { nombre: n, ventas: 0, ruta: 0, enCliente: 0, fuera: 0, sinReferencia: 0, enPlanta: 0, rafaga: 0, efectivo: 0, credito: 0, transferencia: 0, tickets: 0, cambiosGalon: 0, garrafones: 0 });
  const ventasLog = [];
  log.forEach(l => {
    const u = up_(l.USUARIO), acc = up_(l.ACCION);
    if (acc === 'VENTA') {
      const d = det(l);
      (d.ids || [d.id]).forEach(i => { if (i) vendedor[i] = u; });
      if (duenos.indexOf(u) >= 0) return;
      const t = T(u); t.ventas++; t[{ EFECTIVO: 'efectivo', CREDITO: 'credito', TRANSFERENCIA: 'transferencia' }[up_(d.metodo)] || 'efectivo'] += num_(d.total);
      t.garrafones += num_(d.garrafones);
      if ((d.items || []).some(x => /GALONCAMB/.test(x))) t.cambiosGalon++;
      if (d.ruta === false) return;
      t.ruta++;
      if (d.distancia_m == null) t.sinReferencia++;
      else if (num_(d.distancia_m) <= CONFIG.DISTANCIA_ALERTA_M) t.enCliente++;
      else t.fuera++;
      if (d.lat != null && km_({ lat: num_(d.lat), lon: num_(d.lon) }, CONFIG.PLANTA) < 0.15) t.enPlanta++;
      ventasLog.push({ u: u, dia: diaKey_(l.FECHA_HORA), min: minutos(l, d) });
    } else if (acc === 'TICKET' && duenos.indexOf(u) < 0) T(u).tickets++;
  });
  // ráfagas: muchas ventas capturadas en pocos minutos
  const grupos = {};
  ventasLog.forEach(v => { if (v.min != null) (grupos[v.u + '|' + v.dia] || (grupos[v.u + '|' + v.dia] = [])).push(v); });
  const rafagasDia = [];
  Object.keys(grupos).forEach(k => {
    const arr = grupos[k].sort((a, b) => a.min - b.min);
    const marcada = arr.map(() => false);
    for (let i = 0, j = 0; i < arr.length; i++) {
      while (arr[i].min - arr[j].min > CONFIG.RAFAGA.minutos) j++;
      if (i - j + 1 >= CONFIG.RAFAGA.ventas) for (let x = j; x <= i; x++) marcada[x] = true;
    }
    const n = marcada.filter(Boolean).length;
    if (n) { T(arr[0].u).rafaga += n; rafagasDia.push({ nombre: arr[0].u, dia: arr[0].dia, ventas: n, de: arr.length }); }
  });
  // cuadre de garrafones por día
  const sal = leer_('SALIDA A RUTA').filter(s => en(diaKey_(s.FECHA)));
  const reg = leer_('REGRESO A PLANTA').filter(r => en(diaKey_(r.FECHA)));
  const V = B.ventas.filter(v => en(diaKey_(v.FECHA)));
  const dias = {};
  const D = k => dias[k] || (dias[k] = { dia: k, viajes: 0, sinRegreso: 0, salieron: 0, galSalieron: 0, llenos: 0, rotos: 0, galRegreso: 0, vendidos: 0, galVendidos: 0 });
  sal.forEach(s => { const d = D(diaKey_(s.FECHA)); d.viajes++; d.salieron += num_(s.GARRAFON); d.galSalieron += num_(s.GALON); if (!reg.some(r => norm_(r.ID_SALIDA) === norm_(s.ID_SALIDA))) d.sinRegreso++; });
  reg.forEach(r => { const d = D(diaKey_(r.FECHA)); d.llenos += num_(r['GARRAFONES LLENOS REGRESO']); d.rotos += num_(r['GARRAFONES ROTOS']); d.galRegreso += num_(r.GALONES); });
  V.forEach(v => {
    if (norm_(v.ID_CLIENTE) === P) return;
    if (duenos.indexOf(vendedor[norm_(v.ID_VENTA)] || '') >= 0) return; // lo que entrega Oscar no sale en el motocarro
    const d = D(diaKey_(v.FECHA)), p = up_(v.PRODUCTO);
    if (p === 'GARRAFON') d.vendidos += num_(v.CANTIDAD); else if (p === 'GALON' || p === 'GALONCAMB') d.galVendidos += num_(v.CANTIDAD);
  });
  const cuadre = Object.keys(dias).sort().reverse().map(k => {
    const d = dias[k];
    d.diferencia = d.viajes ? d.salieron - d.llenos - d.rotos - d.vendidos : null;
    d.galDiferencia = d.viajes ? d.galSalieron - d.galRegreso - d.galVendidos : null;
    d.sinSalida = !d.viajes && (d.vendidos > 0 || d.galVendidos > 0);
    return d;
  });
  // ventas por debajo del precio vigente (registradas por trabajadores)
  const bajoPrecio = {};
  V.forEach(v => {
    const quien = vendedor[norm_(v.ID_VENTA)];
    if (!quien || duenos.indexOf(quien) >= 0 || diaKey_(v.FECHA) < CONFIG.PRECIOS_DESDE) return;
    const p = up_(v.PRODUCTO); if (p !== 'GARRAFON' && p !== 'GALON') return;
    const g = B.grupoDe[norm_(v.ID_CLIENTE)]; if (!g) return;
    const vig = precio_(B, g, p), pu = num_(v['P.U.']);
    if (vig > 0 && pu < vig - 0.01) {
      const k = g.base + '|' + p + '|' + pu;
      const x = bajoPrecio[k] || (bajoPrecio[k] = { cliente: g.base, producto: p, cobrado: pu, vigente: vig, cantidad: 0, perdido: 0, quien: quien });
      x.cantidad += num_(v.CANTIDAD); x.perdido = r2_(x.perdido + (vig - pu) * num_(v.CANTIDAD));
    }
  });
  // ajustes, cortes, tapas, teléfonos, salidas corregidas
  const ajustes = B.abonos.filter(a => en(diaKey_(a.FECHA)) && up_(a.METODO) === 'AJUSTE').map(a => ({ dia: diaKey_(a.FECHA), cliente: (B.grupoDe[norm_(a.ID_CLIENTE)] || { base: norm_(a.ID_CLIENTE) }).base, monto: num_(a.MONTO), nota: norm_(a.COMENTARIOS) }));
  const cortes = leer_('BALANCE_DIARIO').filter(b => en(diaKey_(b.FECHA)) && norm_(b.EFECTIVO_ENTREGADO) !== '').map(b => ({ dia: diaKey_(b.FECHA), esperado: num_(b.TOTAL_ESPERADO), entregado: num_(b.EFECTIVO_ENTREGADO), diferencia: num_(b.DIFERENCIA) }));
  const tapas = leer_('COMPRAS').filter(x => en(diaKey_(x.FECHA)) && /TAPA/.test(up_(x.PRODUCTO))).reduce((s, x) => s + num_(x.CANTIDAD), 0)
    + leer_('GASTOS').filter(x => en(diaKey_(x.FECHA)) && /TAPA/.test(up_(x.GASTO))).reduce((s, x) => s + num_(x.CANTIDAD), 0);
  const garrafonesVendidos = V.filter(v => up_(v.PRODUCTO) === 'GARRAFON').reduce((s, v) => s + num_(v.CANTIDAD), 0);
  const cambios = log.filter(l => ['TELEFONO', 'SALIDA CORREGIDA', 'TRANSFERENCIA RECHAZADA', 'VENTA BORRADA'].indexOf(up_(l.ACCION)) >= 0).map(l => ({
    cuando: l.FECHA_HORA instanceof Date ? Utilities.formatDate(l.FECHA_HORA, CONFIG.ZONA, 'dd/MM HH:mm') : diaKey_(l.FECHA_HORA), quien: norm_(l.USUARIO), accion: up_(l.ACCION), detalle: norm_(l.DETALLE).slice(0, 200),
  })).reverse();
  const trabajadores = Object.keys(porTrab).map(k => porTrab[k]).sort((a, b) => b.ventas - a.ventas);
  // alertas en palabras
  const alertas = [];
  const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0);
  trabajadores.forEach(t => {
    if (t.ruta >= 5 && pct(t.enCliente, t.ruta) < 60) alertas.push({ nivel: 'alta', texto: nice_(t.nombre) + ' registró solo el ' + pct(t.enCliente, t.ruta) + '% de sus ventas junto al cliente (' + t.enCliente + ' de ' + t.ruta + ').' });
    if (t.rafaga >= CONFIG.RAFAGA.ventas) alertas.push({ nivel: 'alta', texto: nice_(t.nombre) + ' capturó ' + t.rafaga + ' ventas de golpe (5 o más en 10 minutos), no frente al cliente. Conviene pedirle que registre cada venta al momento.' });
    if (t.ruta >= 5 && pct(t.tickets, t.ruta) < 50) alertas.push({ nivel: 'media', texto: nice_(t.nombre) + ' mandó ticket en ' + t.tickets + ' de ' + t.ruta + ' ventas. Con el ticket, el cliente puede avisarte si algo no coincide.' });
    const tot = t.efectivo + t.credito + t.transferencia;
    if (tot > 0 && pct(t.credito, tot) >= 25) alertas.push({ nivel: 'media', texto: nice_(t.nombre) + ' vendió el ' + pct(t.credito, tot) + '% a fiado (' + dinero_(t.credito) + '). Confirma con los clientes que de verdad quedaron debiendo.' });
    if (t.cambiosGalon) alertas.push({ nivel: 'baja', texto: nice_(t.nombre) + ' registró ' + t.cambiosGalon + ' cambio(s) de galón sin cobro.' });
  });
  const sinReg = cuadre.filter(d => d.sinRegreso).length, sinSal = cuadre.filter(d => d.sinSalida).length;
  if (sinSal) alertas.push({ nivel: 'alta', texto: sinSal + ' día(s) con ventas en ruta y ninguna salida registrada.' });
  if (sinReg) alertas.push({ nivel: 'alta', texto: sinReg + ' día(s) con viajes sin regreso registrado. Sin eso no se pueden contar los garrafones.' });
  const desc = cuadre.filter(d => d.diferencia != null && !d.sinRegreso && Math.abs(d.diferencia) > 2);
  if (desc.length) alertas.push({ nivel: 'alta', texto: desc.length + ' día(s) completos donde los garrafones no cuadran por más de 2.' });
  const perdido = Object.keys(bajoPrecio).reduce((s, k) => s + bajoPrecio[k].perdido, 0);
  if (perdido > 0) alertas.push({ nivel: 'media', texto: 'Ventas registradas abajo del precio vigente: ' + dinero_(perdido) + ' menos.' });
  const sumAj = ajustes.reduce((s, a) => s + a.monto, 0);
  if (sumAj > 0) alertas.push({ nivel: 'media', texto: 'Se cancelaron ' + dinero_(sumAj) + ' de deudas con "ajustes" (pagos que nunca se registraron).' });
  const faltantes = cortes.filter(c => c.diferencia <= -1);
  if (faltantes.length) alertas.push({ nivel: 'alta', texto: faltantes.length + ' corte(s) con faltante de efectivo: ' + dinero_(-faltantes.reduce((s, c) => s + c.diferencia, 0)) + ' en total.' });
  const tels = cambios.filter(c => c.accion === 'TELEFONO' && duenos.indexOf(up_(c.quien)) < 0);
  if (tels.length) alertas.push({ nivel: 'baja', texto: tels.length + ' teléfono(s) de cliente capturados por trabajadores. Revisa que sean del cliente.' });
  const orden = { alta: 0, media: 1, baja: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  return {
    desde: desde, hasta: hasta, alertas: alertas, trabajadores: trabajadores, rafagas: rafagasDia, cuadre: cuadre,
    bajoPrecio: Object.keys(bajoPrecio).map(k => bajoPrecio[k]).sort((a, b) => b.perdido - a.perdido),
    ajustes: ajustes, cortes: cortes, tapas: tapas, garrafonesVendidos: garrafonesVendidos, cambios: cambios.slice(0, 40),
    pendientes: verificacionesPendientes_(), distancia: CONFIG.DISTANCIA_ALERTA_M,
  };
}

// ======================= GARRAFONES, HISTORIAL Y ZONAS (dueño) =======================
/** Quién registró cada venta (por su id), según LOG_APP. */
function vendedores_() {
  const m = {};
  leer_('LOG_APP').forEach(l => {
    if (up_(l.ACCION) !== 'VENTA') return;
    let d = {}; try { d = JSON.parse(norm_(l.DETALLE)); } catch (e) { return; }
    const u = up_(l.USUARIO), h = d.hora || '';
    (d.ids || [d.id]).forEach(i => { if (i) m[i] = { u: u, h: h }; });
  });
  return m;
}

/** Garrafones por día: los que salieron llenos, los vendidos en ruta, los vacíos y llenos que regresaron. */
function envases_(dias) {
  const hoy = hoyKey_(), desde = sumaDias_(hoy, -(dias - 1));
  const en = k => k && k >= desde && k <= hoy;
  const duenos = leer_('USUARIOS_APP').filter(x => up_(x.ROL) === 'DUENO').map(x => up_(x.NOMBRE));
  const quien = vendedores_();
  const D = {};
  const d0 = k => D[k] || (D[k] = { dia: k, salieron: 0, vendidos: 0, vacios: 0, llenos: 0, rotos: 0, viajes: 0, sinRegreso: 0 });
  for (let i = 0; i < dias; i++) d0(sumaDias_(desde, i));
  const sal = leer_('SALIDA A RUTA').filter(s => en(diaKey_(s.FECHA)));
  const reg = leer_('REGRESO A PLANTA').filter(r => en(diaKey_(r.FECHA)));
  sal.forEach(s => { const d = d0(diaKey_(s.FECHA)); d.salieron += num_(s.GARRAFON); d.viajes++; if (!reg.some(r => norm_(r.ID_SALIDA) === norm_(s.ID_SALIDA))) d.sinRegreso++; });
  reg.forEach(r => { const d = d0(diaKey_(r.FECHA)); d.vacios += num_(r['GARRAFONES VACIOS']); d.llenos += num_(r['GARRAFONES LLENOS REGRESO']); d.rotos += num_(r['GARRAFONES ROTOS']); });
  leer_('VENTAS').forEach(v => {
    const k = diaKey_(v.FECHA);
    if (!en(k) || up_(v.PRODUCTO) !== 'GARRAFON' || norm_(v.ID_CLIENTE) === CONFIG.ID_CLIENTE_PLANTA) return;
    const q = quien[norm_(v.ID_VENTA)];
    if (q && duenos.indexOf(q.u) >= 0) return; // lo que entregas tú no sale en el motocarro
    d0(k).vendidos += num_(v.CANTIDAD);
  });
  return Object.keys(D).sort().map(k => {
    const d = D[k];
    d.noRegresaron = d.viajes ? d.vendidos - d.vacios : 0;            // vacíos que debieron volver por cada lleno vendido
    d.llenosFaltan = d.viajes ? d.salieron - d.llenos - d.rotos - d.vendidos : 0; // llenos que no se explican
    return d;
  });
}
function apiEnvases(token, dias) { sesion_(token, true); return envases_(Math.min(60, Math.max(1, Math.round(num_(dias) || 7)))); }

/** Historial de ventas para revisar o corregir (solo dueño). */
function apiVentasHistorial(token, desde, hasta) {
  sesion_(token, true);
  hasta = hasta || hoyKey_(); desde = desde || hasta;
  const B = base_();
  const quien = vendedores_();
  return B.ventas.filter(v => { const k = diaKey_(v.FECHA); return k && k >= desde && k <= hasta; }).map(v => {
    const g = B.grupoDe[norm_(v.ID_CLIENTE)], q = quien[norm_(v.ID_VENTA)] || {};
    return { id: norm_(v.ID_VENTA), dia: diaKey_(v.FECHA), hora: q.h || '', quien: q.u || '', cliente: g ? g.base : norm_(v.ID_CLIENTE),
      producto: up_(v.PRODUCTO), cantidad: num_(v.CANTIDAD), precio: num_(v['P.U.']), total: num_(v.TOTAL), metodo: up_(v.METODO) };
  }).sort((a, b) => (a.dia + a.hora < b.dia + b.hora ? 1 : -1)).slice(0, 600);
}

/** Corrige cantidad, precio o forma de pago de una venta (solo dueño). Queda registrado el antes y el después. */
function apiEditarVenta(token, id, cambios) {
  const u = sesion_(token, true);
  return conLock_(() => {
    const v = leer_('VENTAS').find(x => norm_(x.ID_VENTA) === norm_(id));
    if (!v) throw new Error('No encontré esa venta');
    const cant = cambios.cantidad === undefined || cambios.cantidad === '' ? num_(v.CANTIDAD) : Math.round(num_(cambios.cantidad));
    const pu = cambios.precio === undefined || cambios.precio === '' ? num_(v['P.U.']) : r2_(num_(cambios.precio));
    const met = cambios.metodo ? up_(cambios.metodo) : up_(v.METODO);
    if (!(cant > 0)) throw new Error('La cantidad debe ser mayor a 0. Para quitar la venta usa Borrar.');
    if (pu < 0) throw new Error('El precio no puede ser negativo');
    if (['EFECTIVO', 'TRANSFERENCIA', 'CREDITO'].indexOf(met) < 0) throw new Error('Forma de pago no válida');
    const antes = { cantidad: num_(v.CANTIDAD), precio: num_(v['P.U.']), metodo: up_(v.METODO) };
    actualizar_('VENTAS', v._fila, { 'CANTIDAD': cant, 'P.U.': pu, 'TOTAL': r2_(cant * pu), 'METODO': met });
    log_(u.nombre, 'VENTA EDITADA', { id: id, cliente: norm_(v.ID_CLIENTE), antes: antes, ahora: { cantidad: cant, precio: pu, metodo: met } });
    return { ok: true, total: r2_(cant * pu) };
  });
}

/** Dónde se vende más: garrafones por ubicación de cliente en los últimos días (solo dueño). */
function apiZonas(token, dias) {
  sesion_(token, true);
  dias = Math.min(180, Math.max(7, Math.round(num_(dias) || 60)));
  const desde = sumaDias_(hoyKey_(), -(dias - 1));
  const B = base_();
  const por = {};
  B.ventas.forEach(v => {
    const k = diaKey_(v.FECHA); if (!k || k < desde) return;
    const g = B.grupoDe[norm_(v.ID_CLIENTE)];
    if (!g || esPaso_(g) || norm_(g.principal.ID_CLIENTE) === CONFIG.ID_CLIENTE_PLANTA) return;
    const ub = ubic_(g.principal.UBICACION); if (!ub || km_(ub, CONFIG.PLANTA) > 25) return;
    const x = por[g.base] || (por[g.base] = { nombre: g.base, lat: ub.lat, lon: ub.lon, garrafones: 0, total: 0 });
    const p = up_(v.PRODUCTO);
    x.garrafones += p === 'GARRAFON' ? num_(v.CANTIDAD) : p === 'GALON' ? num_(v.CANTIDAD) / 5 : 0;
    x.total += num_(v.TOTAL);
  });
  const lista = Object.keys(por).map(k => por[k]).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  lista.forEach(x => { x.garrafones = Math.round(x.garrafones); x.total = r2_(x.total); });
  return { dias: dias, planta: CONFIG.PLANTA, clientes: lista };
}

/** Reporte de un día (solo dueño): cada venta con quién, dónde y cómo pagó; efectivo de planta, ruta y dueño; posibles duplicadas y el pago del repartidor. */
function apiReporteDia(token, dia) {
  sesion_(token, true);
  dia = /^\d{4}-\d{2}-\d{2}$/.test(String(dia || '')) ? String(dia) : hoyKey_();
  const B = base_();
  const usuarios = leer_('USUARIOS_APP');
  const rolDe = {}; usuarios.forEach(x => { rolDe[up_(x.NOMBRE)] = up_(x.ROL); });
  const info = {};
  leer_('LOG_APP').forEach(l => {
    if (up_(l.ACCION) !== 'VENTA' || diaKey_(l.FECHA_HORA) !== dia) return;
    let d = {}; try { d = JSON.parse(norm_(l.DETALLE)); } catch (e) { return; }
    const lugar = d.lat == null ? null : { planta: Math.round(km_({ lat: +d.lat, lon: +d.lon }, CONFIG.PLANTA) * 1000), cliente: d.distancia_m == null ? null : num_(d.distancia_m) };
    (d.ids || [d.id]).forEach(i => { if (i) info[i] = { quien: up_(l.USUARIO), hora: d.hora || '', lugar: lugar }; });
  });
  const ventas = B.ventas.filter(v => diaKey_(v.FECHA) === dia).map(v => {
    const g = B.grupoDe[norm_(v.ID_CLIENTE)], i = info[norm_(v.ID_VENTA)] || {};
    const quien = i.quien || '';
    const planta = norm_(v.ID_CLIENTE) === CONFIG.ID_CLIENTE_PLANTA;
    const grupo = planta || rolDe[quien] === 'PLANTA' ? 'PLANTA' : rolDe[quien] === 'RUTA' ? 'RUTA' : 'DUENO';
    return { id: norm_(v.ID_VENTA), quien: quien, grupo: grupo, hora: i.hora || '', cliente: g ? g.base : norm_(v.ID_CLIENTE), producto: up_(v.PRODUCTO),
      cantidad: num_(v.CANTIDAD), precio: num_(v['P.U.']), total: num_(v.TOTAL), metodo: up_(v.METODO), lugar: i.lugar || null };
  }).sort((a, b) => (a.hora || '99') < (b.hora || '99') ? -1 : 1);
  // posibles duplicadas: mismo cliente, producto y cantidad el mismo día, capturadas con menos de 15 minutos o sin hora
  const min = h => { const m = String(h).match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : null; };
  ventas.forEach((v, i) => {
    for (let j = 0; j < i; j++) {
      const w = ventas[j];
      if (w.cliente === v.cliente && w.producto === v.producto && w.cantidad === v.cantidad && (min(v.hora) == null || min(w.hora) == null || Math.abs(min(v.hora) - min(w.hora)) <= 15)) { v.duplicadaDe = w.id; break; }
    }
  });
  const suma = (f) => r2_(ventas.filter(f).reduce((s, v) => s + v.total, 0));
  const efectivo = { PLANTA: suma(v => v.grupo === 'PLANTA' && v.metodo === 'EFECTIVO'), RUTA: suma(v => v.grupo === 'RUTA' && v.metodo === 'EFECTIVO'), DUENO: suma(v => v.grupo === 'DUENO' && v.metodo === 'EFECTIVO') };
  // abonos cobrados en efectivo por cada quien
  const abonos = { PLANTA: 0, RUTA: 0, DUENO: 0 };
  B.abonos.filter(a => diaKey_(a.FECHA) === dia && up_(a.METODO) === 'EFECTIVO' && num_(a.MONTO) > 0).forEach(a => {
    const m = norm_(a.COMENTARIOS).match(/App · ([^·]+)/); const q = m ? up_(m[1]) : '';
    abonos[rolDe[q] === 'RUTA' ? 'RUTA' : rolDe[q] === 'PLANTA' ? 'PLANTA' : 'DUENO'] += num_(a.MONTO);
  });
  // pago de cada repartidor: comisión de su ruta menos el descuento del préstamo
  const repartidores = usuarios.filter(x => up_(x.ROL) === 'RUTA').map(x => {
    const n = up_(x.NOMBRE);
    const mias = ventas.filter(v => v.quien === n && v.producto !== 'GALONCAMB' && norm_(v.cliente) !== '');
    const garr = mias.filter(v => v.producto === 'GARRAFON').reduce((s, v) => s + v.cantidad, 0);
    const gal = mias.filter(v => v.producto === 'GALON').reduce((s, v) => s + v.cantidad, 0);
    const comision = garr * (CONFIG.COMISION.GARRAFON || 0) + gal * (CONFIG.COMISION.GALON || 0);
    let prestamo = 0;
    try { const t = prestamos_(dia).find(p => norm_(p.id) === norm_(x.ID_TRABAJADOR) || up_(p.nombre) === n); if (t) prestamo = t.descontadoHoy || (t.saldo > 0 ? Math.min(t.descuento, t.saldo) : 0); } catch (e) {}
    const efe = r2_(mias.filter(v => v.metodo === 'EFECTIVO').reduce((s, v) => s + v.total, 0));
    const fiado = r2_(mias.filter(v => v.metodo === 'CREDITO').reduce((s, v) => s + v.total, 0));
    const pago = r2_(comision - prestamo);
    return { nombre: n, garrafones: garr, galones: gal, comision: comision, prestamo: prestamo, pago: pago, efectivo: efe, fiado: fiado, abonos: abonos.RUTA, entrega: r2_(efe + abonos.RUTA - pago),
      enPlanta: mias.filter(v => v.lugar && v.lugar.planta < 150).length, lejos: mias.filter(v => v.lugar && v.lugar.cliente != null && v.lugar.cliente > CONFIG.DISTANCIA_ALERTA_M).length, conGps: mias.filter(v => v.lugar).length, ventas: mias.length };
  }).filter(r => r.ventas);
  return {
    dia: dia, total: suma(() => true), efectivo: efectivo, abonos: abonos,
    transferencia: suma(v => v.metodo === 'TRANSFERENCIA'), fiado: suma(v => v.metodo === 'CREDITO'),
    ventas: ventas, duplicadas: ventas.filter(v => v.duplicadaDe).length, repartidores: repartidores, distancia: CONFIG.DISTANCIA_ALERTA_M,
  };
}

// ======================= NOTIFICACIONES (app instalable) =======================
/*
 * Web Push con VAPID. La notificación viaja vacía y el celular le pide a este servidor el texto
 * (pubPushPendiente), así no hace falta cifrar el contenido. Cada celular elige qué quiere recibir:
 * avisos del equipo, pedidos de clientes y ventas registradas.
 */
const PUSH_TIPOS = ['AVISOS', 'PEDIDOS', 'VENTAS'];
function pushDefault_(rol, tipo) { return tipo === 'VENTAS' ? rol === 'DUENO' : true; }

var P256_ = null;
function p256_() {
  if (P256_) return P256_;
  var B = function (h) { return BigInt('0x' + h); };
  P256_ = {
    p: B('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: B('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    G: [B('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), B('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')]
  };
  P256_.a = P256_.p - BigInt(3);
  return P256_;
}
function mod_(a, m) { var r = a % m; return r < BigInt(0) ? r + m : r; }
function inv_(a, m) {
  var lm = BigInt(1), hm = BigInt(0), low = mod_(a, m), high = m, Z = BigInt(0);
  while (low > BigInt(1)) { var r = high / low, nm = hm - lm * r, nw = high - low * r; hm = lm; high = low; lm = nm; low = nw; }
  return mod_(lm, m);
}
function sumaPt_(P, Q) {
  var c = p256_(), p = c.p;
  if (!P) return Q; if (!Q) return P;
  var l;
  if (P[0] === Q[0]) {
    if (mod_(P[1] + Q[1], p) === BigInt(0)) return null;
    l = mod_((BigInt(3) * P[0] * P[0] + c.a) * inv_(BigInt(2) * P[1], p), p);
  } else {
    l = mod_((Q[1] - P[1]) * inv_(Q[0] - P[0], p), p);
  }
  var x = mod_(l * l - P[0] - Q[0], p);
  return [x, mod_(l * (P[0] - x) - P[1], p)];
}
function porEscalar_(k, P) {
  var R = null, A = P;
  while (k > BigInt(0)) { if (k & BigInt(1)) R = sumaPt_(R, A); A = sumaPt_(A, A); k = k >> BigInt(1); }
  return R;
}
function bytesAHex_(b) { return b.map(function (x) { var v = (x < 0 ? x + 256 : x).toString(16); return v.length === 1 ? '0' + v : v; }).join(''); }
function hexABytes_(h) { var o = []; for (var i = 0; i < h.length; i += 2) { var v = parseInt(h.substr(i, 2), 16); o.push(v > 127 ? v - 256 : v); } return o; }
function big32_(x) { var h = x.toString(16); while (h.length < 64) h = '0' + h; return h; }
function b64url_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function azarN_() {
  var c = p256_(), k = BigInt(0);
  while (k === BigInt(0)) {
    var h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random(), Utilities.Charset.UTF_8);
    k = mod_(BigInt('0x' + bytesAHex_(h)), c.n);
  }
  return k;
}
function vapid_() {
  var pr = PropertiesService.getScriptProperties(), d = pr.getProperty('VAPID_D'), pub = pr.getProperty('VAPID_PUB');
  if (!d || !pub) {
    var c = p256_(), k = azarN_(), Q = porEscalar_(k, c.G);
    d = big32_(k); pub = b64url_(hexABytes_('04' + big32_(Q[0]) + big32_(Q[1])));
    pr.setProperty('VAPID_D', d); pr.setProperty('VAPID_PUB', pub);
  }
  return { d: d, pub: pub };
}
function firmarES256_(texto, dHex) {
  var c = p256_(), d = BigInt('0x' + dHex);
  var e = BigInt('0x' + bytesAHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)));
  while (true) {
    var k = azarN_(), R = porEscalar_(k, c.G), r = mod_(R[0], c.n);
    if (r === BigInt(0)) continue;
    var s = mod_(inv_(k, c.n) * (e + r * d), c.n);
    if (s === BigInt(0)) continue;
    return b64url_(hexABytes_(big32_(r) + big32_(s)));
  }
}
function jwtVapid_(endpoint) {
  const aud = String(endpoint).match(/^https:\/\/[^\/]+/)[0];
  const cache = CacheService.getScriptCache(), k = 'jwt_' + aud.replace(/[^a-z0-9]/gi, '').slice(0, 200);
  const ya = cache.get(k);
  if (ya) return JSON.parse(ya);
  const v = vapid_();
  const enc = o => b64url_(Utilities.newBlob(JSON.stringify(o)).getBytes());
  const cuerpo = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + CONFIG.CORREO_DUENO });
  const t = { jwt: cuerpo + '.' + firmarES256_(cuerpo, v.d), pub: v.pub };
  try { cache.put(k, JSON.stringify(t), 6 * 3600); } catch (e) {}
  return t;
}
function idSub_(endpoint) { return bytesAHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(endpoint), Utilities.Charset.UTF_8)).slice(0, 24); }

function apiPushClave(token) { sesion_(token); return { llave: vapid_().pub }; }

/** Guarda (o actualiza) el celular de quien está dentro y lo que quiere recibir. */
function apiPushSuscribir(token, endpoint, prefs) {
  const u = sesion_(token);
  const ep = norm_(endpoint);
  if (!/^https:\/\/[a-z0-9.-]+\//i.test(ep) || ep.length > 1000) throw new Error('No se pudo activar en este celular.');
  hojaNueva_('PUSH');
  return conLock_(() => {
    const id = idSub_(ep);
    const previa = leer_('PUSH').find(s => norm_(s.ID) === id);
    const p = {};
    PUSH_TIPOS.forEach(t => {
      const v = prefs ? prefs[t.toLowerCase()] : undefined;
      p[t] = v === undefined ? (previa ? up_(previa[t]) : (pushDefault_(u.rol, t) ? 'SI' : 'NO')) : (v ? 'SI' : 'NO');
    });
    const fila = Object.assign({ 'ID': id, 'USUARIO': u.nombre, 'ROL': u.rol, 'ENDPOINT': ep, 'ULTIMO': new Date() }, p);
    if (previa) actualizar_('PUSH', previa._fila, fila);
    else escribir_('PUSH', Object.assign({ 'CREADO': new Date() }, fila));
    return { ok: true, prefs: { avisos: p.AVISOS === 'SI', pedidos: p.PEDIDOS === 'SI', ventas: p.VENTAS === 'SI' } };
  });
}
function apiPushQuitar(token, endpoint) {
  sesion_(token);
  return conLock_(() => {
    const s = leer_('PUSH').find(x => norm_(x.ID) === idSub_(endpoint));
    if (s) hoja_('PUSH').deleteRow(s._fila);
    return { ok: true };
  });
}
function apiPushProbar(token, endpoint) {
  const u = sesion_(token);
  const s = leer_('PUSH').find(x => norm_(x.ID) === idSub_(endpoint));
  if (!s) throw new Error('Primero activa las notificaciones en este celular.');
  return { ok: true, enviadas: enviarPush_([s], 'Prueba de El Diamante', 'Así te llegarán los avisos, pedidos y ventas, ' + nice_(u.nombre) + '.', 'inicio') };
}

/** Manda una notificación a quien corresponda. para: 'TODOS', un rol ('DUENO','RUTA','PLANTA') o un nombre; lista separada por comas. */
function notificar_(tipo, para, titulo, texto, vista, menos) {
  try {
    const dest = String(para || '').split(',').map(up_).filter(Boolean);
    const subs = leer_('PUSH').filter(s => {
      if (up_(s[tipo]) !== 'SI') return false;
      if (menos && up_(s.USUARIO) === up_(menos)) return false;
      return dest.indexOf('TODOS') >= 0 || dest.indexOf(up_(s.ROL)) >= 0 || dest.indexOf(up_(s.USUARIO)) >= 0;
    });
    return enviarPush_(subs, titulo, texto, vista);
  } catch (e) { console.warn('push', e); return 0; }
}
function enviarPush_(subs, titulo, texto, vista) {
  if (!subs.length) return 0;
  const cache = CacheService.getScriptCache();
  const msg = { t: String(titulo).slice(0, 80), b: String(texto).slice(0, 240), v: vista || 'inicio', id: id_() };
  subs.forEach(s => {
    const k = 'pn_' + norm_(s.ID);
    let cola = []; try { cola = JSON.parse(cache.get(k) || '[]'); } catch (e) {}
    cola.push(msg); cache.put(k, JSON.stringify(cola.slice(-8)), 21600);
  });
  const reqs = subs.map(s => {
    const t = jwtVapid_(norm_(s.ENDPOINT));
    return { url: norm_(s.ENDPOINT), method: 'post', muteHttpExceptions: true, contentType: 'application/octet-stream', payload: '',
      headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + t.jwt + ', k=' + t.pub } };
  });
  const res = UrlFetchApp.fetchAll(reqs);
  const muertas = [];
  res.forEach((r, i) => { const c = r.getResponseCode(); if (c === 404 || c === 410) muertas.push(subs[i]._fila); });
  if (muertas.length) conLock_(() => muertas.sort((a, b) => b - a).forEach(f => hoja_('PUSH').deleteRow(f)));
  return res.length - muertas.length;
}
/** El celular, al recibir la notificación vacía, pide aquí el texto. */
function pubPushPendiente(endpoint) {
  const id = idSub_(norm_(endpoint)), cache = CacheService.getScriptCache(), k = 'pn_' + id;
  let cola = []; try { cola = JSON.parse(cache.get(k) || '[]'); } catch (e) {}
  if (!cola.length) return null;
  const m = cola.shift();
  if (cola.length) cache.put(k, JSON.stringify(cola), 21600); else cache.remove(k);
  return m;
}

/** Ejecútala una vez desde el editor de Apps Script para autorizar el envío de notificaciones. */
function autorizarNotificaciones() {
  hojaNueva_('PUSH');
  vapid_();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('Listo: notificaciones autorizadas.');
}

// ======================= APP INSTALABLE (GitHub Pages) =======================
/** La app instalable manda {fn, args} y recibe {ok, r} o {ok:false, error}. Solo funciones api* y pub*. */
function doPost(e) {
  let out;
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = String(b.fn || '');
    const f = /^(api|pub)[A-Z]\w*$/.test(fn) ? globalThis[fn] : null;
    if (typeof f !== 'function') throw new Error('Función no válida');
    out = { ok: true, r: f.apply(null, Array.isArray(b.args) ? b.args : []) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ======================= INSTALACIÓN =======================
/** Ejecuta esta función una vez desde el editor. Crea las hojas nuevas, los PIN y el correo diario. */
function instalar() {
  const ss = ss_();
  Object.keys(HOJAS_NUEVAS).forEach(n => hojaNueva_(n));
  // hoja CLIENTES: asegurar columna de estatus
  const cl = hoja_('CLIENTES');
  const enc = cl.getRange(1, 1, 1, cl.getLastColumn()).getValues()[0].map(norm_);
  if (enc.indexOf('ESTATUS_CLIENTE') < 0) { cl.getRange(1, enc.length + 1).setValue('ESTATUS_CLIENTE'); enc.push('ESTATUS_CLIENTE'); }
  if (enc.indexOf('LIMITE_CREDITO') < 0) cl.getRange(1, enc.length + 1).setValue('LIMITE_CREDITO');

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('secreto')) props.setProperty('secreto', Utilities.getUuid());
  const us = leer_('USUARIOS_APP');
  if (us.length) return 'La app ya estaba instalada. Los PIN están en la hoja USUARIOS_APP.';
  const pin = () => String(Math.floor(100000 + Math.random() * 900000));
  const creados = [];
  if (!us.some(u => up_(u.ROL) === 'DUENO')) {
    const p = pin(); escribir_('USUARIOS_APP', { NOMBRE: 'OSCAR', PIN: p, ROL: 'DUENO', ID_TRABAJADOR: '', ACTIVO: 'SI' }); creados.push('OSCAR (dueño): ' + p);
  }
  leer_('TRABAJADORES').forEach(t => {
    if (us.some(u => up_(u.NOMBRE) === up_(t.NOMBRE))) return;
    const p = pin(); escribir_('USUARIOS_APP', { NOMBRE: up_(t.NOMBRE), PIN: p, ROL: up_(t.PUESTO) === 'RUTA' ? 'RUTA' : 'PLANTA', ID_TRABAJADOR: norm_(t.ID_TRABAJADOR), ACTIVO: 'SI' });
    creados.push(up_(t.NOMBRE) + ': ' + p);
  });
  hoja_('USUARIOS_APP').getRange('B:B').setNumberFormat('@');

  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'reporteDiario').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('reporteDiario').timeBased().everyDays(1).atHour(CONFIG.HORA_REPORTE_DIARIO).inTimezone(CONFIG.ZONA).create();

  Logger.log('PIN creados:\n' + creados.join('\n'));
  return 'Listo. Hojas creadas y correo diario activado a las ' + CONFIG.HORA_REPORTE_DIARIO + ':00. Abre la hoja USUARIOS_APP para ver los PIN.';
}
