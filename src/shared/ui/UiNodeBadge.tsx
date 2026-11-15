import { useEffect, useState } from 'react'
import { Server } from 'lucide-react'

/** Respuesta de /ui-node.jsp, que solo existe cuando la UI corre en el cluster de Tomcat. */
interface UiNodeInfo {
  node: string
  sessionId: string
  hits: number
}

const POLL_MS = 5000

/**
 * Muestra qué Tomcat de UI atendió el último pedido y el contador de la sesión HTTP.
 * Sirve para demostrar las sticky sessions y la replicación: si se cae un nodo, el badge cambia
 * al otro y el contador sigue (la sesión se replicó). En `npm run dev` no se muestra.
 */
export function UiNodeBadge() {
  const [info, setInfo] = useState<UiNodeInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/ui-node.jsp', { credentials: 'same-origin', cache: 'no-store' })
        const type = res.headers.get('content-type') ?? ''
        if (!res.ok || !type.includes('application/json')) throw new Error(String(res.status))
        const data = (await res.json()) as UiNodeInfo
        if (!cancelled) {
          setInfo(data)
          setFailed(false)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    const id = window.setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (!info) return null

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[0.7rem] leading-tight ${
        failed ? 'border-danger/40 text-danger' : 'border-line text-muted'
      }`}
      title="Tomcat de UI que atiende tu sesión (sticky session) y pedidos contados en la sesión replicada"
    >
      <Server size={14} aria-hidden className="shrink-0" />
      <span>
        Nodo UI <strong className="font-semibold text-ink">{info.node}</strong>
        <br />
        Sesión {info.sessionId.slice(0, 8)}… · {info.hits} pedidos
      </span>
    </div>
  )
}
