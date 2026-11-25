/**
 * Id local para filas de formularios (keys de React).
 *
 * `crypto.randomUUID()` solo existe en contextos seguros (HTTPS o localhost). Cuando la UI se
 * sirve por HTTP desde otra IP (por ejemplo, el balanceador del despliegue distribuido) no está
 * disponible, así que se usa un id alternativo. No se usa para nada de seguridad.
 */
let counter = 0

export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  counter += 1
  return `id-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 10)}`
}
