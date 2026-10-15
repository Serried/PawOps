import { EmptyState } from '../components/AsyncState.jsx'

export function NotFoundPage() {
  return (
    <div className="pc-page">
      <EmptyState
        icon="alert"
        title="Page not found."
        message="This page may have moved or is no longer available."
        actionLabel="Back to dashboard"
        actionTo="/dashboard"
      />
    </div>
  )
}
