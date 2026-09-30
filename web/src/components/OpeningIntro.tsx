import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { BrandMark } from './BrandMark'

const SESSION_KEY = 'gt-intro-seen'

type Props = { onDone: () => void }

/** One-shot opening: claim vs pin mismatch, the problem GroundTruth solves. */
export function OpeningIntro({ onDone }: Props) {
  const doneRef = useRef(false)
  const [show, setShow] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) !== '1'
    } catch {
      return true
    }
  })

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    setShow(false)
    onDone()
  }

  useEffect(() => {
    if (!show) {
      if (!doneRef.current) {
        doneRef.current = true
        onDone()
      }
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(finish, reduce ? 350 : 4200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="intro"
          role="dialog"
          aria-label="GroundTruth introduction"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <button type="button" className="intro-skip" onClick={finish}>
            Skip
          </button>

          <div className="intro-stage">
            <motion.div
              className="intro-mark"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <BrandMark size={28} />
              <span>GroundTruth</span>
            </motion.div>

            <svg className="intro-diagram" viewBox="0 0 480 220" aria-hidden="true">
              <motion.path
                d="M72 118c0-34 28-62 62-62s62 28 62 62-28 62-62 62-62-28-62-62z"
                fill="none"
                stroke="#0a0a0a"
                strokeWidth="1.5"
                strokeDasharray="5 4"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              />
              <motion.text
                x="134"
                y="48"
                textAnchor="middle"
                className="intro-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
              >
                Claimed town
              </motion.text>

              <motion.path
                d="M196 118 H360"
                fill="none"
                stroke="#0a0a0a"
                strokeWidth="1.25"
                strokeDasharray="3 3"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.7, delay: 1.05, ease: [0.22, 1, 0.36, 1] }}
              />
              <motion.text
                x="278"
                y="104"
                textAnchor="middle"
                className="intro-dist"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                207 km apart
              </motion.text>

              <motion.circle
                cx="378"
                cy="118"
                r="18"
                fill="none"
                stroke="#0a0a0a"
                strokeWidth="1.5"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1.15, type: 'spring', stiffness: 260, damping: 22 }}
              />
              <motion.circle
                cx="378"
                cy="118"
                r="5"
                fill="#0a0a0a"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.3, type: 'spring', stiffness: 300, damping: 18 }}
              />
              <motion.text
                x="378"
                y="158"
                textAnchor="middle"
                className="intro-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.45 }}
              >
                Recorded pin
              </motion.text>
            </svg>

            <motion.p
              className="intro-line"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.75, duration: 0.5 }}
            >
              The contract names one town.
              <br />
              The coordinates land in another.
            </motion.p>

            <motion.p
              className="intro-sub"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.35, duration: 0.45 }}
            >
              GroundTruth checks every public flood-control pin against the claim,
              <br />
              then ranks what to verify first.
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
