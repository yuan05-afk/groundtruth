import { useEffect, useState } from 'react'

export type Route = { page: 'brief' } | { page: 'queue'; id: number | null } | { page: 'method' }

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'queue') {
    const id = parts[1] !== undefined ? Number(parts[1]) : null
    return { page: 'queue', id: Number.isFinite(id) ? id : null }
  }
  if (parts[0] === 'method') return { page: 'method' }
  return { page: 'brief' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(hash: string, replace = false) {
  if (replace) {
    history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}
