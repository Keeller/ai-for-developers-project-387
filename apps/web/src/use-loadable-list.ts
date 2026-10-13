import { useCallback, useEffect, useState } from 'react'

type ListRequestResult<Item> = {
  data?: { items: Item[] }
}

export function useLoadableList<Item>(
  request: () => Promise<ListRequestResult<Item>>,
) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(
    async (isActive: () => boolean = () => true) => {
      setItems(null)
      setError(false)
      const result = await request()

      if (!isActive()) return

      if (result.data === undefined) {
        setError(true)
        return
      }

      setItems(result.data.items)
    },
    [request],
  )

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => load(() => active))

    return () => {
      active = false
    }
  }, [load])

  return { error, items, reload: load }
}
