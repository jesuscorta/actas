# Contexto rápido del proyecto

- **App**: React 19 + TypeScript + Vite. Una sola pantalla (`src/App.tsx`) para crear/editar actas con tres editores ricos (notas previas, acta, próximos pasos) usando Tiptap (StarterKit + enlaces + menciones + placeholder + subrayado).
- **Datos**: Cada acta tiene título, cliente, fecha, tipo de reunión (cliente/interna), HTML de los 3 editores y checklist de tareas. Clientes gestionados con autocompletado y modal de administración.
- **Estado local**: IndexedDB vía `localforage`. Auto-guardado a los 600 ms de editar; export/import CSV; copia a portapapeles en Markdown.
- **Menciones**: `@` busca otras actas (por título/cliente/fecha) y enlaza; al click salta a esa acta.
- **Backup local**: Soporte opcional (solo navegadores con File System Access API); guarda `actas-backup.json` en carpeta elegida.

## Sincronización con API
- **Endpoint**: si existe `VITE_API_BASE_URL`, la app sincroniza estado completo (notas + clientes) con `GET/PUT {VITE_API_BASE_URL}/api/state`. Si no está definido, solo usa IndexedDB.
- **Backend**: `server/index.js` (Express + MySQL). Tabla `app_state` (id=1) almacena JSON `{notes, clients}`. Rutas: `/api/health`, `/api/state` (GET/PUT).
- **Seguridad API**: si `API_KEY` está definido, todas las rutas salvo `/api/health` exigen cabecera `x-api-key` o `Authorization: Bearer {API_KEY}`; responde 401 si falta/no coincide.
- **Frontend**: si `VITE_API_KEY` está definido, las peticiones al backend incluyen `x-api-key` con ese valor.
- **Env backend**: `DB_HOST`, `DB_PORT` (3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT` (3000), `CORS_ORIGIN`, `API_KEY`.

## Build y contenedores
- **Frontend**: `npm run dev/build/preview/lint`. Docker multistage (`Dockerfile`) build con Vite; Nginx sirve `dist`. Requiere `.htpasswd` para el `auth_basic` del `nginx.conf`.
- **Backend**: `server/Dockerfile` ejecuta `node index.js` en puerto 3000.

## Estado en Dokploy (VPS)
*(Rellenar/confirmar con los datos actuales del panel de Dokploy)*  
- Dominios/hosts activos para frontend y API: _pendiente_.  
- Variables de entorno cargadas: _pendiente_.  
- Credenciales MySQL/host/db usados: _pendiente_.  
- Imagenes/containers desplegados (frontend/backend) y versiones: _pendiente_.  
- Backups/snapshots configurados: _pendiente_.  
- Observaciones pendientes: _pendiente_.  

## Qué revisar rápido
- Si no sincroniza: comprobar `VITE_API_BASE_URL` en build y que `/api/state` responde.
- Si no hay auth: asegurarse de montar `.htpasswd` en la imagen Nginx.
- Si falta persistencia en servidor: confirmar MySQL accesible desde backend (variables env correctas y tabla `app_state` creada automáticamente).
