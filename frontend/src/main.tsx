import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { request_json, submit_json } from './services/http_client';
import { list_projects, create_project, type Project } from './services/workspace_service';
import { read_model_status, type ModelStatus } from './services/research_service';
import { ResearchPage } from './pages/research_page';
import { LibraryPage } from './pages/library_page';
import { VisualsPage } from './pages/visuals_page';
import { AnalyticsPage } from './pages/analytics_page';
import { SciencePage } from './pages/science_page';
import { EvidencePage } from './pages/evidence_page';
import { BriefPage } from './pages/brief_page';
import { InstallControl, OfflineNotes } from './components/install_control';
import { ImplementationPage } from './pages/implementation_page';
import './styles.css';

function ResearchOffice() {
  const [authenticated, set_authenticated] = useState(false);
  const [loading, set_loading] = useState(true);
  const [password, set_password] = useState('');
  const [projects, set_projects] = useState<Project[]>([]);
  const [project, set_project] = useState<Project | null>(null);
  const [page, set_page] = useState<
    'research' | 'library' | 'analytics' | 'visuals' | 'science' | 'evidence' | 'brief' | 'implementation'
  >('research');
  const [status, set_status] = useState<ModelStatus | null>(null);
  const [error, set_error] = useState('');
  const [name, set_name] = useState('');
  const [dialog, set_dialog] = useState(false);

  async function load_workspace() {
    const [projects, status] = await Promise.all([list_projects(), read_model_status()]);
    set_projects(projects);
    set_status(status);
    set_project(
      projects.find((project) => project.id === localStorage.getItem('research_project_id')) ??
        projects[0] ??
        null,
    );
  }
  useEffect(() => {
    void request_json('/api/auth/session')
      .then(() => set_authenticated(true))
      .catch(() => {})
      .finally(() => set_loading(false));
  }, []);
  useEffect(() => {
    if (authenticated) void load_workspace().catch((error) => set_error(error.message));
  }, [authenticated]);
  function select_project(project: Project) {
    set_project(project);
    localStorage.setItem('research_project_id', project.id);
    set_error('');
  }
  async function submit_login(event: React.FormEvent) {
    event.preventDefault();
    set_error('');
    try {
      await submit_json('/api/auth/login', { password });
      set_password('');
      set_authenticated(true);
    } catch (error) {
      set_error((error as Error).message);
    }
  }
  async function submit_project(event: React.FormEvent) {
    event.preventDefault();
    set_error('');
    try {
      const project = await create_project(name);
      set_projects(await list_projects());
      select_project(project);
      set_name('');
      set_dialog(false);
    } catch (error) {
      set_error((error as Error).message);
    }
  }
  async function submit_logout() {
    try {
      await submit_json('/api/auth/logout', {});
      set_authenticated(false);
      set_projects([]);
      set_project(null);
    } catch (error) {
      set_error((error as Error).message);
    }
  }
  if (loading)
    return (
      <main className="login">
        <p>Opening your research office…</p>
      </main>
    );
  if (!authenticated)
    return (
      <main className="login">
        <section className="login_card">
          <span className="brand">◈ Research Office</span>
          <p className="eyebrow">YOUR PRIVATE THINKING SPACE</p>
          <h1>
            Good ideas deserve
            <br />a closer look.
          </h1>
          <p className="intro">An executive research team for the questions worth pursuing.</p>
          <form onSubmit={submit_login}>
            <label>
              Owner password
              <input
                type="password"
                value={password}
                onChange={(event) => set_password(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <button>Enter your workspace ↗</button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="hint">Private access. Your workspace is available only after owner login.</p>
          <OfflineNotes />
          <InstallControl />
        </section>
      </main>
    );
  return (
    <div className="app_shell">
      <aside className="sidebar">
        <div className="brand">◈ Research Office</div>
        <span className="eyebrow">IDEAS INTO EVIDENCE</span>
        <button className="new_project" onClick={() => set_dialog(true)}>
          ＋ New research project
        </button>
        <nav aria-label="Research projects">
          {projects.map((item) => (
            <button
              key={item.id}
              className={item.id === project?.id ? 'selected' : ''}
              onClick={() => select_project(item)}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <div className="sidebar_footer">
          <InstallControl />
          <p>
            Books → evidence
            <br />
            Possibilities → decisions
          </p>
          <button onClick={submit_logout}>Sign out ↗</button>
          <button
            onClick={() =>
              void submit_json('/api/auth/revoke_others', {})
                .then(() => set_error('Other devices have been signed out.'))
                .catch((error) => set_error(error.message))
            }
          >
            Sign out other devices
          </button>
        </div>
      </aside>
      <main className="workspace">
        <OfflineNotes />
        <header>
          <span className="eyebrow">YOUR INDEPENDENT RESEARCH WORKSPACE</span>
          <span className="badge">
            {status?.mode === 'simulation'
              ? '● Local simulation'
              : status?.configured
                ? '● Azure configured'
                : '○ Azure setup needed'}
          </span>
        </header>
        <h1>{project?.name ?? 'A better question. A stronger business.'}</h1>
        <p className="intro">
          Explore the fundamentals. Challenge the assumptions. Build a case for what comes next.
        </p>
        {status?.mode === 'simulation' && (
          <div className="simulation_notice">
            Simulation mode · The workflow works locally with fixed test responses. Configure Azure to perform
            real AI research.
          </div>
        )}
        <section className="team" aria-label="Research team">
          {[
            {
              title: 'Research director',
              category: 'COORDINATE',
              text: 'Frames the investigation and turns specialist findings into a decision.',
            },
            {
              title: 'Science & technology',
              category: 'UNDERSTAND',
              text: 'Mechanisms, equations, feasibility and reproducible experiments.',
            },
            {
              title: 'Business & analytics',
              category: 'EVALUATE',
              text: 'Commercial assumptions, calculated scenarios and employee impact.',
            },
            {
              title: 'Independent reviewer',
              category: 'CHALLENGE',
              text: 'Reviews specialist findings before the director synthesizes them.',
            },
          ].map((agent, index) => (
            <div className="agent_card" key={agent.title}>
              <small>
                0{index + 1} / {agent.category}
              </small>
              <h2>{agent.title}</h2>
              <p>{agent.text}</p>
            </div>
          ))}
        </section>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {project ? (
          <>
            <nav className="tabs" aria-label="Workspace features">
              {(
                [
                  'research',
                  'brief',
                  'library',
                  'evidence',
                  'science',
                  'implementation',
                  'analytics',
                  'visuals',
                ] as const
              ).map((tab) => (
                <button key={tab} className={page === tab ? 'active' : ''} onClick={() => set_page(tab)}>
                  {tab === 'research'
                    ? 'Research & reports'
                    : tab === 'library'
                      ? 'Document library'
                      : tab === 'analytics'
                        ? 'Analytics & scenarios'
                        : tab === 'visuals'
                          ? 'Diagrams & images'
                          : tab === 'science'
                            ? 'Scientific workbench'
                            : tab === 'evidence'
                              ? 'Sources & internet'
                              : tab === 'implementation'
                                ? 'Implementation lab'
                                : 'Company brief'}
                </button>
              ))}
            </nav>
            <div key={`${project.id}-${page}`}>
              {page === 'research' ? (
                <ResearchPage project_id={project.id} simulation={status?.mode === 'simulation'} />
              ) : page === 'library' ? (
                <LibraryPage project_id={project.id} />
              ) : page === 'analytics' ? (
                <AnalyticsPage project_id={project.id} />
              ) : page === 'visuals' ? (
                <VisualsPage project_id={project.id} />
              ) : page === 'science' ? (
                <SciencePage project_id={project.id} />
              ) : page === 'evidence' ? (
                <EvidencePage project_id={project.id} />
              ) : page === 'implementation' ? (
                <ImplementationPage project_id={project.id} />
              ) : (
                <BriefPage project_id={project.id} />
              )}
            </div>
          </>
        ) : (
          <section className="panel empty">
            <span className="empty_symbol">✳</span>
            <h2>Start with a question that matters.</h2>
            <p>Create a project, bring your evidence, and explore the possibilities.</p>
            <button onClick={() => set_dialog(true)}>Create your first project ↗</button>
          </section>
        )}
        <footer>Research Office · Private research workspace · Evidence before certainty</footer>
      </main>
      {dialog && (
        <div className="dialog_backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="project_dialog_title" className="dialog">
            <h2 id="project_dialog_title">Start a research project</h2>
            <form onSubmit={submit_project}>
              <label>
                Company or research topic
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => set_name(event.target.value)}
                  maxLength={160}
                  required
                  placeholder="e.g. Lower-energy data centres"
                />
              </label>
              <div className="dialog_actions">
                <button>Create project</button>
                <button type="button" className="secondary" onClick={() => set_dialog(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ResearchOffice />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
