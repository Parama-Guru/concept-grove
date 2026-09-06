import { useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { AmbientSceneHandle } from '../lib/ambientScene'
import './AmbientArtwork.css'

export default function AmbientArtwork({ enabled, children }: PropsWithChildren<{ enabled: boolean }>) {
  const root = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = root.current
    const target = host.current
    if (!container || !target) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    let disposed = false
    let visible = false
    let loading = false
    let failed = false
    let scene: AmbientSceneHandle | null = null
    let idleHandle: number | undefined
    let fallbackTimer: number | undefined

    function allowed() {
      return enabled && !motion.matches && !connection?.saveData
    }

    function cancelPending() {
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle)
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
      idleHandle = undefined
      fallbackTimer = undefined
    }

    function syncVisibility() {
      const active = !disposed && visible && !document.hidden && allowed()
      if (scene) {
        scene.setRunning(active)
        if (!allowed()) {
          scene.dispose()
          scene = null
          setReady(false)
        }
      }
      if (!active) { cancelPending(); return }
      if (scene || loading || failed || idleHandle !== undefined || fallbackTimer !== undefined) return
      const initialize = () => {
        idleHandle = undefined
        fallbackTimer = undefined
        if (disposed || !visible || document.hidden || !allowed()) return
        loading = true
        void import('../lib/ambientScene').then(({ createAmbientScene }) => {
          loading = false
          if (disposed || !visible || document.hidden || !allowed()) return
          scene = createAmbientScene(target!, () => {
            if (disposed) return
            failed = true
            scene = null
            setReady(false)
          })
          if (scene) {
            setReady(true)
            scene.setRunning(true)
          }
        }).catch(() => {
          loading = false
          failed = true
          if (!disposed) setReady(false)
        })
      }
      if (typeof window.requestIdleCallback === 'function') idleHandle = window.requestIdleCallback(initialize, { timeout: 1200 })
      else fallbackTimer = window.setTimeout(initialize, 250)
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      syncVisibility()
    }, { threshold: 0.05 })
    observer.observe(container)
    motion.addEventListener('change', syncVisibility)
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      disposed = true
      cancelPending()
      observer.disconnect()
      motion.removeEventListener('change', syncVisibility)
      document.removeEventListener('visibilitychange', syncVisibility)
      scene?.dispose()
    }
  }, [enabled])

  return <div ref={root} className={`ambient-artwork ${ready && enabled ? 'is-ready' : ''}`} aria-hidden="true">
    <div className="artwork-fallback">{children}</div>
    <div ref={host} className="ambient-canvas" />
  </div>
}