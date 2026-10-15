# TaskFlow — Full-Stack Project Management App

An intermediate portfolio project built with React, Express, Node.js, SQLite, and JWT authentication.

## Features
- Register and log in with hashed passwords (bcrypt)
- JWT-protected API
- Create, edit, complete, and delete tasks
- Task status and priority
- Three analytics charts (completion activity, status distribution, priority breakdown) derived from the signed-in user's task data
- Search and status filters
- Responsive dashboard
- SQLite persistence (simple local setup)

## Tech stack
- **Client:** React 18, Vite, Recharts
- **Server:** Node.js, Express 4, better-sqlite3, bcryptjs, jsonwebtoken

## Requirements
- Node.js 18+
- npm

## Run locally

### 1. Start the backend
```bash
cd server
npm install
cp .env.example .env
npm run dev
```
The API runs at `http://localhost:4000`. The SQLite database is created automatically.

### 2. Start the frontend in another terminal
```bash
cd client
npm install
npm run dev
```
Open the Vite URL shown in the terminal (normally `http://localhost:5173`). In development, Vite proxies `/api` to the backend, so no extra configuration is needed.

## Environment variables (`server/.env`)
| Variable | Purpose |
| --- | --- |
| `PORT` | Port the API listens on (default `4000`) |
| `JWT_SECRET` | Secret used to sign tokens. Required; use a long random string in production |
| `CLIENT_ORIGIN` | Allowed CORS origin(s), comma-separated (default `http://localhost:5173`) |
| `DB_PATH` | Optional path to the SQLite file (default `server/taskflow.db`) |

For a deployed client on a different origin, set `VITE_API_URL` (e.g. `https://api.example.com`) when building the client.

## API
Protected routes need the header `Authorization: Bearer <token>`. Register and login both return `{ "token", "user": { "id", "name", "email" } }`. Errors return `{ "error": "message" }`.

- `POST /api/auth/register` — `{ "name", "email", "password" }` (password 8–72 characters)
- `POST /api/auth/login` — `{ "email", "password" }`
- `GET /api/tasks` — list current user's tasks; optional `?status=todo|in_progress|done&q=...`
- `POST /api/tasks` — create task `{ "title", "description", "priority", "status", "dueDate" }`
- `PATCH /api/tasks/:id` — update task fields
- `DELETE /api/tasks/:id` — delete task
- `GET /api/health` — health check

Task fields: `priority` is `low | medium | high` (default `medium`), `status` is `todo | in_progress | done` (default `todo`), and `dueDate` is `YYYY-MM-DD` or `null`. Tasks are returned with `id`, `createdAt`, `updatedAt`, and `completedAt` (set when a task moves to `done`, cleared when it moves back).

## Design decisions
- **SQLite** keeps setup to two commands. Every query is scoped by `user_id`, and PostgreSQL is the natural upgrade for multi-user deployment.
- **Charts are computed on the client** from the full task list, so they stay accurate while the list is searched or filtered, and no analytics endpoint is needed. At larger scale, move the aggregation into SQL.
- **`completedAt`** is stored on the task so the completion-activity chart reflects when work was actually finished, not when it was last edited.
- **Login** compares against a dummy hash when the email is unknown so response time doesn't reveal which emails are registered.

## Project structure
```text
taskflow-portfolio/
├── server/
│   ├── src/
│   │   ├── db.js
│   │   ├── middleware/auth.js
│   │   ├── routes/auth.js
│   │   ├── routes/tasks.js
│   │   └── index.js
│   ├── .env.example
│   └── package.json
└── client/
    ├── src/
    │   ├── api.js
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── styles.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Production checklist
- Set a long random `JWT_SECRET`; never commit `.env`.
- Use HTTPS in production.
- Add rate limiting, email verification, password reset, tests, and database backups before real-world use.
- SQLite is used to keep local setup easy; PostgreSQL is a good upgrade for deployment and multi-user workloads.
