# ⚽ DT Táctico - Match Center & Pizarra de Fútbol

Aplicación web profesional para la **gestión de partidos de fútbol y diagramación de formaciones tácticas** (11v11, 7v7, 5v5), con vista pública para jugadores y panel de administración protegido para el Director Técnico (DT).

---

## 🎯 Características Principales

- **Vista Pública (`/`)**: 
  - Tarjeta informativa del encuentro (Rival, Fecha, Hora, Cancha, Indicaciones del DT).
  - Cancha táctica interactiva de solo lectura con nombres y dorsales clarísimos.
  - Lista de titulares citados y banca de suplentes.
  - **Exportador PNG**: Botón para descargar la ficha táctica como imagen `.PNG` lista para compartir por WhatsApp.

- **Panel de Administración DT (`/admin`)**:
  - **Seguridad**: Autenticación por contraseña/PIN definida en variable de entorno.
  - **Pizarra Interactiva (Drag & Drop)**: Arrastra y suelta jugadores y el balón libremente (compatible con Mouse y Touchscreen).
  - **Edición de Jugador**: Haz clic o doble clic para editar nombre, dorsal y posición (GK, DEF, MID, FWD) o mover a la banca.
  - **Formaciones Predefinidas**: Botones para armar la base rápida (`4-3-3`, `4-4-2`, `3-5-2`, `4-2-3-1`, `2-3-1`, `1-2-1`, etc.).
  - **Formato Regulable**: Selector de formato 11 vs 11, 7 vs 7 o 5 vs 5 (Futsal/Futbolito).
  - **Publicación Instantánea**: Guarda los cambios en SQLite y actualiza la vista pública inmediatamente.

---

## 🚀 Despliegue en Máquina Virtual Linux (Docker Compose)

### Requisitos Previos
- Linux (Ubuntu, Debian, CentOS, etc.)
- Docker & Docker Compose plugin instalado.

### Paso a Paso para Desplegar

1. **Clonar el repositorio o copiar el directorio del proyecto en la VM:**
   ```bash
   git clone <tu-repositorio>.git
   cd "Plantilla Futbol"
   ```

2. **Configurar las variables de entorno:**
   Copia el archivo `.env.example` a `.env` y define tu contraseña de administración:
   ```bash
   cp .env.example .env
   nano .env
   ```
   *Contenido del `.env`:*
   ```env
   PORT=3000
   ADMIN_PASSWORD=mi_contraseÃ±a_segura_dt
   JWT_SECRET=clave_secreta_jwt_futbol
   ```

3. **Iniciar los servicios con Docker Compose:**
   ```bash
   docker compose up -d --build
   ```

4. **Verificar el estado del contenedor:**
   ```bash
   docker compose ps
   ```

5. **Acceder a la aplicación:**
   - **Vista Pública**: `http://IP_DE_TU_VM:3000/`
   - **Panel DT Admin**: `http://IP_DE_TU_VM:3000/admin` (Ingresa la contraseña configurada en `ADMIN_PASSWORD`).

> 💾 **Persistencia de Datos**: La base de datos SQLite se almacena en el volumen local `./data/tactics.db`, manteniendo intacta la información tras reinicios o actualizaciones del contenedor.

---

## 💻 Despliegue Local o Directo con Node.js (Sin Docker)

Si prefieres ejecutar directamente con Node.js en la máquina:

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar la aplicación:**
   ```bash
   npm start
   ```
   O en modo desarrollo con auto-reload:
   ```bash
   npm run dev
   ```

3. Abrir en el navegador: `http://localhost:3000`

---

## 🛠️ Stack Tecnológico

- **Backend**: Node.js, Express, `better-sqlite3`, JSON Web Token (`jsonwebtoken`).
- **Base de Datos**: SQLite local sin configuración externa.
- **Frontend**: HTML5 Semántico, Vanilla CSS (Dark Mode Premium, Glassmorphism, CSS Grid/Flexbox), JavaScript ES6+.
- **Exportación**: `html2canvas` para renderizado de imagen PNG.
- **Infraestructura**: Docker Engine, Alpine Linux, Docker Compose.

---

## 🔐 Credenciales por Defecto

- **Contraseña Admin por defecto**: `admin123` (Modificar en `.env`).
