import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { useRoute } from './lib/router'
import { Brief } from './pages/Brief'
import { Method } from './pages/Method'
import { Queue } from './pages/Queue'

export default function App() {
  const route = useRoute()

  useEffect(() => {
    if (route.page !== 'queue') window.scrollTo({ top: 0 })
    document.body.dataset.page = route.page
  }, [route.page])

  return (
    <>
      <TopBar route={route} />
      {route.page === 'brief' && <Brief />}
      {route.page === 'queue' && <Queue selectedId={route.id} />}
      {route.page === 'method' && <Method />}
    </>
  )
}
