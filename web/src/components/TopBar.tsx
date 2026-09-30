import { BrandMark } from './BrandMark'
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
        <BrandMark size={20} className="wordmark-mark" />
        <span className="wordmark-text">GroundTruth</span>
      </a>
      <nav className="nav">
        {link('brief', '#/', 'Brief')}
        {link('queue', '#/queue', 'Queue')}
        {link('method', '#/method', 'Method')}
      </nav>
    </header>
  )
}
