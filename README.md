# CurMis - Management Information System

A modern, high-performance Management Information System built with a secure PHP backend and a dynamic React frontend.

## 🚀 Getting Started

### Prerequisites

- **Backend**: PHP 8.2+, Composer, MySQL 8.0+ (or MAMP/XAMPP/WAMP)
- **Frontend**: Node.js 18+, npm

---

## 🛠 Backend Setup

1. **Install Dependencies**:
   ```bash
   cd backend
   composer install
   ```

2. **Configuration**:
   - Copy `.env.example` to `.env`.
   - Update `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` to match your local database.
   - Set a unique `JWT_SECRET`.

3. **Database Setup**:
   - Create a database named `cur_mis`.
   - Import the latest schema from `database/schema.sql` (if available) or create the `users` table manually.

4. **Serve**:
   - Using MAMP: Point your host to `backend/public`.
   - Using PHP CLI: `php -S localhost:8888 -t public`

---

## 💻 Frontend Setup

1. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Configuration**:
   - Ensure `VITE_API_BASE_URL` in your `.env` (if used) points to your backend URL.

3. **Development**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

---

## 📖 API Documentation

The project includes built-in interactive API documentation.
When the backend is running, visit:
`http://localhost:8888/cur-mis/backend/public/api-docs.php#-api-auth-register` (adjust port/path based on your server setup).

> [!NOTE]
> API Docs are enabled by default in development. To enable in production, set `API_DOCS_PUBLIC=true` in your `.env`.

---

## 🎨 Architecture Highlights

- **Backend**: Modular routing system (`routes/api/`), state-of-the-art security with PDO prepared statements, and rate-limiting.
- **Frontend**: Tailwind CSS with Dark/Light theme persistence, Framer Motion animations, and robust state management via Zustand.