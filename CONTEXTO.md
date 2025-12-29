# Contexto rápido del proyecto

- **App**: React 19 + TypeScript + Vite. Una sola pantalla (`src/App.tsx`) para crear/editar actas con tres editores ricos (notas previas, acta, próximos pasos) usando Tiptap (StarterKit + enlaces + menciones + placeholder + subrayado).
- **Datos**: Cada acta tiene título, cliente, fecha, tipo de reunión (cliente/interna), HTML de los 3 editores y checklist de tareas. Clientes gestionados con autocompletado y modal de administración.
- **Estado local**: IndexedDB vía `localforage`. Auto-guardado a los 600 ms de editar; export/import CSV; copia a portapapeles en Markdown.
- **Menciones**: `@` busca otras actas (por título/cliente/fecha) y enlaza; al click salta a esa acta.
- **Backup**: Persistencia principal en MySQL vía API; no se usa ya el backup local en carpeta.

## Sincronización con API
- **Endpoint**: si existe `VITE_API_BASE_URL`, la app sincroniza estado completo (notas + clientes) con `GET/PUT {VITE_API_BASE_URL}/api/state`. Si no está definido, solo usa IndexedDB.
- **Backend**: `server/index.js` (Express + MySQL). Tabla `app_state` (id=1) almacena JSON `{notes, clients}`. Rutas: `/api/health`, `/api/state` (GET/PUT).
- **Seguridad API**: acepta `Authorization: Bearer {id_token_google}` (verificado contra `GOOGLE_CLIENT_ID`, dominio/allowlist opcional). `API_KEY` queda como fallback; si ninguno está configurado, no hay auth (solo para dev local).
- **Frontend**: `VITE_GOOGLE_CLIENT_ID` habilita login Google y envía el ID token en cada llamada (cabecera `Authorization: Bearer …`). `VITE_API_KEY` opcional añade `x-api-key`.
- **Env backend**: `DB_HOST`, `DB_PORT` (3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT` (3000), `CORS_ORIGIN`, `API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_ALLOWED_EMAILS`, `GOOGLE_ALLOWED_DOMAIN`.

## Build y contenedores
- **Frontend**: `npm run dev/build/preview/lint`. Docker multistage (`Dockerfile`) build con Vite; Nginx sirve `dist` sin autenticación adicional.
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
- Si falta persistencia en servidor: confirmar MySQL accesible desde backend (variables env correctas y tabla `app_state` creada automáticamente).
