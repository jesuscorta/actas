# Contexto rápido del proyecto

- **App**: React 19 + TypeScript + Vite. Vistas principales: actas (`src/App.tsx`), notas (`src/NotasPage.tsx`), tareas (`src/TasksPage.tsx`) y home (`src/HomePage.tsx`).
- **Datos**: Actas con título, cliente, fecha, tipo (cliente/interna), HTML de editores y checklist. Notas rápidas por cliente. Tareas tipo kanban con `bucket` (`today|week|none`), `order`, estado `done` y cliente.
- **Estado local**: IndexedDB vía `localforage`. Auto-guardado a los 600 ms. Export/import CSV para actas y notas. Sin copia a portapapeles.
- **Menciones**: `@` busca otras actas (por título/cliente/fecha) y enlaza; al click salta a esa acta.
- **Backup**: Persistencia principal en MySQL vía API; no se usa ya el backup local en carpeta.

## Sincronización con API
- **Endpoint**: si existe `VITE_API_BASE_URL`, la app sincroniza estado completo (notes + clients + quickNotes + tasks) con `GET/PUT {VITE_API_BASE_URL}/api/state`. Si no está definido, solo usa IndexedDB.
- **Backend**: `server/index.js` (Express + MySQL). Tabla `app_state_users` guarda JSON `{notes, clients, quickNotes, tasks}` por email de usuario (PK `email`). Rutas: `/api/health`, `/api/state` (GET/PUT).
- **Seguridad API**: acepta `Authorization: Bearer {id_token_google}` (verificado contra `GOOGLE_CLIENT_ID`, dominio/allowlist opcional). `API_KEY` queda como fallback; si ninguno está configurado, no hay auth (solo para dev local).
- **Frontend**: `VITE_GOOGLE_CLIENT_ID` habilita login Google y envía el ID token en cada llamada (cabecera `Authorization: Bearer …`). `VITE_API_KEY` opcional añade `x-api-key`.
- **Env backend**: `DB_HOST`, `DB_PORT` (3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT` (3000), `CORS_ORIGIN`, `API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_ALLOWED_EMAILS`, `GOOGLE_ALLOWED_DOMAIN`, `MIGRATION_DEFAULT_OWNER` (asigna estado legacy al primer usuario).
  - **Nota**: `google-auth-library` es dependencia del backend y debe estar instalada.

## Build y contenedores
- **Frontend**: `npm run dev/build/preview/lint`. Docker multistage (`Dockerfile`) build con Vite; Nginx sirve `dist` sin autenticación adicional.
- **Backend**: `server/Dockerfile` ejecuta `node index.js` en puerto 3000.

## UX/UI clave
- **Actas**: "Notas previas" y "Próximos pasos" ocultos por defecto con toggle; se auto-muestran si hay contenido. "Acta" siempre visible. Enlaces por hash para saltar a acta (`/actas#id`).
- **Notas**: sidebar con scroll y filtro por cliente (solo clientes con notas).
- **Tareas**: vista kanban con 3 columnas (Hoy / Esta semana / Sin fecha), drag & drop entre columnas y reordenación. Creación inline por columna con `+`. Edición vía modal con selector de clientes. Menú contextual (click derecho) para editar/eliminar. Botón de completar verde.
- **Deshacer**: actas y notas permiten deshacer eliminación durante 5s (sin confirm modal).

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
- Si hay 401: revisar `GOOGLE_CLIENT_ID` y allowlist (`GOOGLE_ALLOWED_EMAILS`/`GOOGLE_ALLOWED_DOMAIN`).
