import { Alert, Button, Loader } from '@mantine/core'

export function ListLoadStatus({
  error,
  loading,
  onRetry,
  title,
}: Readonly<{
  error: boolean
  loading: boolean
  onRetry: () => Promise<void>
  title: string
}>) {
  if (loading) {
    return <Loader aria-label="Загрузка" />
  }

  if (!error) {
    return null
  }

  return (
    <Alert color="red" title={title}>
      <Button mt="sm" onClick={() => void onRetry()} variant="light">
        Повторить
      </Button>
    </Alert>
  )
}
