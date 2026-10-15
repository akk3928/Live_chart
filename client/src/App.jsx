import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  clearSession,
  getStoredSession,
  saveSession,
  setUnauthorizedHandler,
} from './api.js';

/* ---------- constants & helpers ---------- */

const STATUS = {
  todo: { label: 'To do', color: '#8c97a9' },
  in_progress: { label: 'In progress', color: '#3b4cca' },
  done: { label: 'Done', color: '#1f9d78' },
};

const PRIORITY = {
  high: { label: 'High', color: '#d6455d' },
  medium: { label: 'Medium', color: '#d99a1b' },
  low: { label: 'Low', color: '#4f9bd1' },
};

const FILTERS = [
  ['all', 'All'],
  ['todo', 'To do'],
  ['in_progress', 'In progress'],
  ['done', 'Done'],
];

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function formatDay(key) {
  const d = new Date(`${key}T00:00:00`);
  const opts =
    d.getFullYear() === new Date().getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Open tasks first, soonest due date first (no date last), newest first as the tie-break. */
function sortTasks(list) {
  return [...list].sort((a, b) => {
    const aDone = a.status === 'done';
    const bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return b.id - a.id;
  });
}

const isOverdue = (t, today) => t.status !== 'done' && !!t.dueDate && t.dueDate < today;

function activityData(tasks, days = 14) {
  const counts = {};
  for (const t of tasks) {
    if (t.completedAt) {
      const k = dateKey(new Date(t.completedAt));
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dateKey(d);
    out.push({ day: formatDay(k), completed: counts[k] || 0 });
  }
  return out;
}

/* ---------- root ---------- */

export default function App() {
  const [session, setSession] = useState(getStoredSession);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  // If the API ever answers 401, drop the session and return to the sign-in screen.
  useEffect(() => {
    setUnauthorizedHandler(signOut);
  }, [signOut]);

  const handleAuth = (data) => {
    saveSession(data);
    setSession(data);
  };

  return session ? (
    <Dashboard user={session.user} onSignOut={signOut} />
  ) : (
    <AuthScreen onAuth={handleAuth} />
  );
}

/* ---------- auth ---------- */

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function switchMode() {
    setMode(isLogin ? 'register' : 'login');
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = isLogin
        ? await api.login({ email: form.email, password: form.password })
        : await api.register(form);
      onAuth(data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-brand" aria-hidden="true">
        <span className="brand-mark">TaskFlow</span>
        <p className="auth-statement">Every task, deadline and priority in one place.</p>
      </section>

      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1>{isLogin ? 'Sign in' : 'Create your account'}</h1>

          {!isLogin && (
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={set('name')}
                required
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={set('password')}
              minLength={isLogin ? undefined : 8}
              required
            />
            {!isLogin && <small>Use at least 8 characters.</small>}
          </label>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : isLogin ? 'Sign in' : 'Create account'}
          </button>

          <p className="auth-switch">
            {isLogin ? 'New to TaskFlow?' : 'Already have an account?'}{' '}
            <button type="button" className="link" onClick={switchMode}>
              {isLogin ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}

/* ---------- dashboard ---------- */

function Dashboard({ user, onSignOut }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null | 'new' | task
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setTasks(await api.listTasks());
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = dateKey(new Date());

  const stats = useMemo(
    () => ({
      total: tasks.length,
      open: tasks.filter((t) => t.status !== 'done').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
      overdue: tasks.filter((t) => isOverdue(t, today)).length,
    }),
    [tasks, today]
  );

  const counts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => t.status === 'todo').length,
      in_progress: stats.inProgress,
      done: stats.done,
    }),
    [tasks, stats]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTasks(tasks).filter(
      (t) =>
        (filter === 'all' || t.status === filter) &&
        (!q || `${t.title} ${t.description}`.toLowerCase().includes(q))
    );
  }, [tasks, query, filter]);

  async function saveTask(payload) {
    if (editing && editing !== 'new') {
      const updated = await api.updateTask(editing.id, payload);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } else {
      const created = await api.createTask(payload);
      setTasks((prev) => [created, ...prev]);
    }
    setEditing(null);
  }

  async function toggleDone(task) {
    setBusyId(task.id);
    setNotice('');
    try {
      const updated = await api.updateTask(task.id, {
        status: task.status === 'done' ? 'todo' : 'done',
      });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeTask(task) {
    if (!window.confirm(`Delete “${task.title}”? This can’t be undone.`)) return;
    setBusyId(task.id);
    setNotice('');
    try {
      await api.deleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const firstName = user.name.split(' ')[0];
  let summary;
  if (stats.total === 0) summary = 'Add your first task to start tracking your work.';
  else if (stats.open === 0) summary = 'Everything is done. Add something new when you’re ready.';
  else {
    summary = `You have ${stats.open} open ${stats.open === 1 ? 'task' : 'tasks'}${
      stats.overdue ? `, ${stats.overdue} overdue.` : '.'
    }`;
  }

  const closeModal = useCallback(() => setEditing(null), []);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand-mark">TaskFlow</span>
        <div className="topbar-user">
          <span className="user-name">{user.name}</span>
          <button className="btn btn-quiet" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        <section className="hero">
          <div>
            <h1>
              {greeting()}, {firstName}.
            </h1>
            <p className="hero-summary">{summary}</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            New task
          </button>
        </section>

        {loading ? (
          <p className="state-msg">Loading your tasks…</p>
        ) : loadError ? (
          <div className="state-msg">
            <p className="alert" role="alert">
              {loadError}
            </p>
            <button className="btn btn-secondary" onClick={load}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <dl className="stats">
              <Stat label="Total tasks" value={stats.total} />
              <Stat label="In progress" value={stats.inProgress} />
              <Stat label="Done" value={stats.done} />
              <Stat label="Overdue" value={stats.overdue} danger={stats.overdue > 0} />
            </dl>

            <Charts tasks={tasks} />

            <section className="tasks" aria-labelledby="tasks-heading">
              <div className="tasks-head">
                <h2 id="tasks-heading">Tasks</h2>
                <input
                  className="search"
                  type="search"
                  placeholder="Search tasks"
                  aria-label="Search tasks"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="filters" role="group" aria-label="Filter by status">
                {FILTERS.map(([value, label]) => (
                  <button
                    key={value}
                    className="filter"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label} <span className="filter-count">{counts[value]}</span>
                  </button>
                ))}
              </div>

              {notice && (
                <p className="alert" role="alert">
                  {notice}
                </p>
              )}

              {visible.length === 0 ? (
                <div className="empty">
                  {tasks.length === 0 ? (
                    <>
                      <p>No tasks yet.</p>
                      <button className="btn btn-secondary" onClick={() => setEditing('new')}>
                        Add a task
                      </button>
                    </>
                  ) : (
                    <>
                      <p>No tasks match your search or filter.</p>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setQuery('');
                          setFilter('all');
                        }}
                      >
                        Clear search and filter
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <ul className="task-list">
                  {visible.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      overdue={isOverdue(t, today)}
                      busy={busyId === t.id}
                      onToggle={() => toggleDone(t)}
                      onEdit={() => setEditing(t)}
                      onDelete={() => removeTask(t)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {editing && (
        <TaskModal
          task={editing === 'new' ? null : editing}
          onClose={closeModal}
          onSave={saveTask}
        />
      )}
    </div>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={danger ? 'is-danger' : undefined}>{value}</dd>
    </div>
  );
}

/* ---------- task row ---------- */

function TaskRow({ task, overdue, busy, onToggle, onEdit, onDelete }) {
  const done = task.status === 'done';
  const p = PRIORITY[task.priority];
  const s = STATUS[task.status];

  return (
    <li className={`task${done ? ' is-done' : ''}`} style={{ '--priority': p.color }}>
      <button
        className="check"
        onClick={onToggle}
        disabled={busy}
        aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        aria-pressed={done}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="task-body">
        <p className="task-title">{task.title}</p>
        {task.description && <p className="task-desc">{task.description}</p>}
        <p className="task-meta">
          <span className="tag">
            <i className="dot" style={{ background: p.color }} />
            {p.label} priority
          </span>
          <span className="tag">
            <i className="dot" style={{ background: s.color }} />
            {s.label}
          </span>
          {task.dueDate && (
            <span className={`tag${overdue ? ' is-overdue' : ''}`}>
              {overdue ? 'Overdue, was due ' : done ? 'Was due ' : 'Due '}
              {formatDay(task.dueDate)}
            </span>
          )}
        </p>
      </div>

      <div className="task-actions">
        <button className="btn btn-quiet" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        <button className="btn btn-quiet btn-danger" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </li>
  );
}

/* ---------- modal ---------- */

function TaskModal({ task, onClose, onSave }) {
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'medium',
    status: task?.status ?? 'todo',
    dueDate: task?.dueDate ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Enter a title.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onSubmit={submit}
        noValidate
      >
        <h2 id="modal-title">{task ? 'Edit task' : 'New task'}</h2>

        <label className="field">
          <span>Title</span>
          <input type="text" value={form.title} onChange={set('title')} maxLength={200} autoFocus />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={set('description')} maxLength={2000} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Priority</span>
            <select value={form.priority} onChange={set('priority')}>
              {Object.entries(PRIORITY).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={set('status')}>
              {Object.entries(STATUS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Due date</span>
            <input type="date" value={form.dueDate} onChange={set('dueDate')} />
          </label>
        </div>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : task ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- charts ---------- */

const tooltipStyle = {
  border: '1px solid #d9dde8',
  borderRadius: 8,
  boxShadow: 'none',
  fontSize: 13,
};
const axisTick = { fontSize: 12, fill: '#5b6478' };

function Charts({ tasks }) {
  return (
    <section className="charts" aria-label="Task analytics">
      <ActivityChart tasks={tasks} />
      <StatusChart tasks={tasks} />
      <PriorityChart tasks={tasks} />
    </section>
  );
}

function ChartPanel({ title, note, className = '', children }) {
  return (
    <figure className={`panel ${className}`}>
      <figcaption>
        <h2>{title}</h2>
        {note && <span>{note}</span>}
      </figcaption>
      {children}
    </figure>
  );
}

const ChartEmpty = ({ children }) => <p className="chart-empty">{children}</p>;

function ActivityChart({ tasks }) {
  const data = useMemo(() => activityData(tasks), [tasks]);
  const total = data.reduce((sum, d) => sum + d.completed, 0);

  return (
    <ChartPanel
      title="Completed in the last 14 days"
      note={total ? `${total} finished` : null}
      className="panel-activity"
    >
      {total === 0 ? (
        <ChartEmpty>Finish a task and your activity shows up here.</ChartEmpty>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e3e6ee" />
            <XAxis
              dataKey="day"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              allowDecimals={false}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="completed"
              name="Completed"
              stroke="#3b4cca"
              strokeWidth={2}
              fill="#3b4cca"
              fillOpacity={0.12}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}

function StatusChart({ tasks }) {
  const data = useMemo(
    () =>
      Object.entries(STATUS)
        .map(([key, { label, color }]) => ({
          key,
          label,
          color,
          value: tasks.filter((t) => t.status === key).length,
        }))
        .filter((d) => d.value > 0),
    [tasks]
  );

  return (
    <ChartPanel title="Tasks by status">
      {tasks.length === 0 ? (
        <ChartEmpty>Add a task to see how work is split.</ChartEmpty>
      ) : (
        <>
          <div className="donut">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <span className="donut-total">{tasks.length}</span>
          </div>
          <ul className="legend">
            {data.map((d) => (
              <li key={d.key}>
                <i className="dot" style={{ background: d.color }} />
                {d.label}
                <b>{d.value}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartPanel>
  );
}

function PriorityChart({ tasks }) {
  const data = useMemo(
    () =>
      ['high', 'medium', 'low'].map((key) => ({
        name: PRIORITY[key].label,
        color: PRIORITY[key].color,
        count: tasks.filter((t) => t.priority === key).length,
      })),
    [tasks]
  );

  return (
    <ChartPanel title="Tasks by priority">
      {tasks.length === 0 ? (
        <ChartEmpty>Add a task to see its priority.</ChartEmpty>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e3e6ee" />
            <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis
              allowDecimals={false}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#eef0f5' }} />
            <Bar dataKey="count" name="Tasks" radius={[6, 6, 0, 0]} maxBarSize={48}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}
