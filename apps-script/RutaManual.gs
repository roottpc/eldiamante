/**
 * RUTA MANUAL · archivo nuevo en Apps Script (no reemplaza a Code.gs).
 * El dueño arma el orden de los clientes del día; el repartidor lo ve en "Ruta de hoy".
 */
function claveRutaManual_() { return 'ruta_manual_' + Utilities.formatDate(new Date(), 'America/Mazatlan', 'yyyy-MM-dd'); }
function apiRutaManual(token) {
  sesion_(token);
  const raw = PropertiesService.getScriptProperties().getProperty(claveRutaManual_());
  return raw ? JSON.parse(raw) : { orden: [], por: '', at: '' };
}
function apiRutaManualGuardar(token, orden) {
  const u = sesion_(token);
  const ids = (Array.isArray(orden) ? orden : []).map(x => String(x).trim()).filter(Boolean).slice(0, 150);
  const props = PropertiesService.getScriptProperties();
  if (!ids.length) { props.deleteProperty(claveRutaManual_()); return { orden: [], por: '', at: '' }; }
  const d = { orden: ids, por: u.nombre || '', at: Utilities.formatDate(new Date(), 'America/Mazatlan', 'HH:mm') };
  props.setProperty(claveRutaManual_(), JSON.stringify(d));
  try { log_(u.nombre, 'RUTA MANUAL', { clientes: ids.length }); } catch (e) {}
  return d;
}
