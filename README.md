# TaskFlow — Full-Stack Project Management App

An intermediate portfolio project built with React, Express, Node.js, SQLite, and JWT authentication.

## Features
- Register and log in with hashed passwords
- JWT-protected API
- Create, edit, complete, and delete tasks
- Task status and priority
- Three analytics charts (completion activity, status distribution, priority breakdown) derived from the signed-in user's task data
- Search and status filters
- Responsive dashboard
- SQLite persistence (simple local setup)

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
Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## API
- `POST /api/auth/register` — `{ "name", "email", "password" }`
- `POST /api/auth/login` — `{ "email", "password" }`
- `GET /api/tasks` — list current user's tasks; optional `?status=todo|in_progress|done&q=...`
- `POST /api/tasks` — create task `{ "title", "description", "priority", "status", "dueDate" }`
- `PATCH /api/tasks/:id` — update task fields
- `DELETE /api/tasks/:id` — delete task
- `GET /api/health` — health check

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
    └── package.json
```

## Production checklist
- Set a long random `JWT_SECRET`; never commit `.env`.
- Use HTTPS in production.
- Add rate limiting, email verification, password reset, tests, and database backups before real-world use.
- SQLite is used to keep local setup easy; PostgreSQL is a good upgrade for deployment and multi-user workloads.
