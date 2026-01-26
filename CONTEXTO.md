# Contexto rápido del proyecto

- **App**: React 19 + TypeScript + Vite. Vistas principales: actas (`src/App.tsx`), notas (`src/NotasPage.tsx`), tareas (`src/TasksPage.tsx`) y home (`src/HomePage.tsx`).
- **Datos**: Actas con título, cliente, fecha, tipo (cliente/interna), HTML de editores y checklist. Notas rápidas por cliente. Tareas tipo kanban con `bucket` (`today|week|none`), `order`, estado `done` y cliente.
- **Estado local**: IndexedDB vía `localforage`. Auto-guardado a los 600 ms. Export/import CSV para actas y notas. Sin copia a portapapeles.
- **Menciones**: `@` busca otras actas (por título/cliente/fecha) y enlaza; al click salta a esa acta.
- **Backup**: Persistencia principal en MySQL vía API; no se usa ya el backup local en carpeta.

## Sincronización con API
- **Endpoint**: si existe `VITE_API_BASE_URL`, la app sincroniza estado completo (notes + clients + quickNotes + tasks) con `GET/PUT {VITE_API_BASE_URL}/api/state`. Si no está definido, solo usa IndexedDB.
- **Backend**: `server/index.js` (Express + MySQL). Tablas por entidad: `actas`, `acta_tasks`, `quick_notes`, `tasks`, `clients`, `users`. Rutas: `/api/health`, `/api/login` y `/api/state` (GET/PUT).
- **Seguridad API**: login con usuario/contraseña y JWT (cabecera `Authorization: Bearer …`). Si no hay `JWT_SECRET`/usuario en env, no hay auth (solo para dev local).
- **Frontend**: `VITE_API_BASE_URL` activa el login; el token JWT se guarda en `localStorage` y se envía en cada llamada.
- **Env backend**: `DB_HOST`, `DB_PORT` (3306), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT` (3000), `CORS_ORIGIN`, `JWT_SECRET`, `JWT_TTL` (opcional), `APP_USER_EMAIL`, `APP_USER_PASSWORD`.

## Build y contenedores
- **Frontend**: `npm run dev/build/preview/lint`. Docker multistage (`Dockerfile`) build con Vite; Nginx sirve `dist` sin autenticación adicional.
- **Backend**: `server/Dockerfile` ejecuta `node index.js` en puerto 3000.

## UX/UI clave
- **Actas**: "Notas previas" y "Próximos pasos" ocultos por defecto con toggle; se auto-muestran si hay contenido. "Acta" siempre visible. Enlaces por hash para saltar a acta (`/actas#id`).
- **Notas**: sidebar con scroll y filtro por cliente (solo clientes con notas).
- **Tareas**: vista kanban con 3 columnas (Hoy / Esta semana / Sin fecha), drag & drop entre columnas y reordenación. Creación inline por columna con `+`. Edición vía modal con selector de clientes. Menú contextual (click derecho) para editar/eliminar. Botón de completar verde.
- **Deshacer**: actas y notas permiten deshacer eliminación durante 5s (sin confirm modal).

## Estado en Dokploy (VPS)
- **Frontend**: configurar `VITE_API_BASE_URL` apuntando al backend.
- **Backend**: definir `DB_*`, `JWT_SECRET`, `JWT_TTL` (opcional), `APP_USER_EMAIL`, `APP_USER_PASSWORD`, `CORS_ORIGIN`, `PORT`.
- **Arranque**: el backend crea tablas automáticamente en el primer arranque.
- **Credenciales**: si cambias `APP_USER_EMAIL` o `APP_USER_PASSWORD`, elimina el usuario actual en `users` o crea uno nuevo.
- **Seguridad**: rota tokens/secretos si se compartieron en algún momento.

## Qué revisar rápido
- Si no sincroniza: comprobar `VITE_API_BASE_URL` en build y que `/api/state` responde.
- Si falta persistencia en servidor: confirmar MySQL accesible desde backend (variables env correctas y tablas creadas automáticamente).
- Si hay 401: revisar `JWT_SECRET`, `APP_USER_EMAIL` y `APP_USER_PASSWORD`.
