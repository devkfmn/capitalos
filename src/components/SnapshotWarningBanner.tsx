import { useState } from 'react'
import { useSnapshotHealth } from '../hooks/useSnapshotHealth'

function SnapshotWarningBanner() {
  const { showBanner, severity, messages } = useSnapshotHealth()
  const [expanded, setExpanded] = useState(false)

  if (!showBanner || messages.length === 0) {
    return null
  }

  const primaryMessage = messages[0]
  const detailMessages = messages.slice(1)
  const hasDetails = detailMessages.length > 0

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 rounded-input border px-3 py-2.5 md:px-4 md:py-3 ${
        severity === 'error'
          ? 'bg-danger/10 border-danger/30'
          : 'bg-warning/10 border-warning/30'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <svg
          className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
            severity === 'error' ? 'text-danger' : 'text-warning'
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[0.63rem] md:text-[0.79rem] ${
              severity === 'error' ? 'text-danger' : 'text-warning'
            }`}
          >
            {primaryMessage}
          </p>

          {hasDetails && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="text-[0.55rem] md:text-[0.63rem] text-text-muted hover:text-text-secondary underline"
              >
                {expanded ? 'Hide details' : 'Show details'}
              </button>
              {expanded && (
                <ul className="mt-1.5 space-y-0.5 text-[0.55rem] md:text-[0.63rem] text-text-muted list-disc pl-4">
                  {detailMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SnapshotWarningBanner
