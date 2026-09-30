import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { OpeningIntro } from './components/OpeningIntro'
import { TopBar } from './components/TopBar'
import { loadProjects, loadSummary } from './lib/data'
import { useRoute } from './lib/router'
import { Brief } from './pages/Brief'
import { Method } from './pages/Method'
import { Queue } from './pages/Queue'

const pageEase = [0.22, 1, 0.36, 1] as const

function prefetchQueueAssets() {
  void loadSummary()
  void loadProjects()
  const base = import.meta.env.BASE_URL
  void fetch(`${base}maplibre-worker.mjs`).catch(() => {})
  void fetch(`${base}maplibre-gl-shared.mjs`).catch(() => {})
}

export default function App() {
  const route = useRoute()
  const [introDone, setIntroDone] = useState(false)

  useEffect(() => {
    prefetchQueueAssets()
  }, [])

  useEffect(() => {
    if (route.page !== 'queue') window.scrollTo({ top: 0, behavior: 'smooth' })
    document.body.dataset.page = route.page
  }, [route.page])

  return (
    <>
      <OpeningIntro onDone={() => setIntroDone(true)} />
      <TopBar route={route} />
      <AnimatePresence mode="wait">
        {introDone && route.page === 'brief' && (
          <motion.div
            key="brief"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: pageEase }}
          >
            <Brief />
          </motion.div>
        )}
        {introDone && route.page === 'queue' && (
          <motion.div
            key="queue"
            className="page-queue"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: pageEase }}
          >
            <Queue selectedId={route.id} />
          </motion.div>
        )}
        {introDone && route.page === 'method' && (
          <motion.div
            key="method"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: pageEase }}
          >
            <Method />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
