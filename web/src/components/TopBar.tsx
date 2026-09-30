import type { Route } from '../lib/router'

export function TopBar({ route }: { route: Route }) {
  const link = (page: Route['page'], href: string, text: string) => (
    <a href={href} className={route.page === page ? 'nav-link active' : 'nav-link'} aria-current={route.page === page ? 'page' : undefined}>
      {text}
    </a>
  )
  return (
    <header className="topbar">
      <a href="#/" className="wordmark" aria-label="GroundTruth home">
        <span className="wordmark-mark" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="18" height="18">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="10" cy="10" r="2.6" fill="currentColor" />
            <line x1="10" y1="0" x2="10" y2="4" stroke="currentColor" strokeWidth="1.3" />
            <line x1="10" y1="16" x2="10" y2="20" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </span>
        GroundTruth
      </a>
      <nav className="nav">
        {link('brief', '#/', 'Brief')}
        {link('queue', '#/queue', 'Inspection queue')}
        {link('method', '#/method', 'Method')}
      </nav>
      <div className="topbar-note">Public DPWH records, checked against the map</div>
    </header>
  )
}
