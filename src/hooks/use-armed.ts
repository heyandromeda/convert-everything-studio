import { useEffect, useState } from 'react'

/**
 * False for `ms` after mount. Destructive buttons that appear where the user just tapped
 * (Stop replacing Convert) stay disabled briefly so a double-tap cannot cancel the work.
 */
export function useArmed(ms = 700) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return armed
}
