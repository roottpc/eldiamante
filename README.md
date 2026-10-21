# El Diamante · Purificadora

App de ventas, ruta, cobranza y control de Purificadora El Diamante (Tepic).

- `index.html`, `manifest.webmanifest`, `sw.js`, `icons/`: la app instalable que se publica en GitHub Pages.
- `apps-script/`: el servidor en Google Apps Script, pegado en la hoja **EL DIAMANTE 1.0**. Los datos viven en esa hoja.

La app habla con el servidor por `doPost` (ver `apps-script/Code.gs`). La versión anterior dentro de Google (`/exec`) sigue funcionando igual.
