import { useEffect, useRef, useState } from 'react'

export function useTypewriter(text: string, speed = 22) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const indexRef = useRef(0)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    indexRef.current = 0

    if (!text) return

    timerRef.current = setInterval(() => {
      indexRef.current += 1
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) {
        clearInterval(timerRef.current!)
        setDone(true)
      }
    }, speed)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [text, speed])

  return { displayed, done }
}
