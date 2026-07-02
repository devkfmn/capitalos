import { useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { getTodayUTCDate, isDegradedSnapshot } from '../services/snapshotService'

export type SnapshotHealthSeverity = 'none' | 'warning' | 'error'

export interface SnapshotHealth {
  severity: SnapshotHealthSeverity
  messages: string[]
  showBanner: boolean
}

const CRON_HOUR_UTC = 22

function formatUtcDateLabel(dateYmd: string): string {
  const [year, month, day] = dateYmd.split('-')
  if (!year || !month || !day) return dateYmd
  return `${day}/${month}/${year}`
}

function isPastCronWindowUtc(now: Date): boolean {
  return now.getUTCHours() >= CRON_HOUR_UTC
}

export function useSnapshotHealth(): SnapshotHealth {
  const { data, snapshotMeta } = useData()

  return useMemo(() => {
    const today = getTodayUTCDate()
    const now = new Date()
    const pastCron = isPastCronWindowUtc(now)
    const messages: string[] = []
    let severity: SnapshotHealthSeverity = 'none'

    const bumpSeverity = (next: SnapshotHealthSeverity) => {
      if (next === 'error') severity = 'error'
      else if (next === 'warning' && severity === 'none') severity = 'warning'
    }

    const liveSnapshotToday = data.snapshots.find(
      (s) => s.date === today && s.priceQuality === 'live'
    )
    const degradedSnapshotToday = data.snapshots.find(
      (s) => s.date === today && isDegradedSnapshot(s)
    )

    if (
      snapshotMeta?.lastStatus === 'skipped_no_live_prices' &&
      snapshotMeta.lastDate === today
    ) {
      const detail = snapshotMeta.lastError || 'live market prices were unavailable'
      messages.push(
        `Daily snapshot for ${formatUtcDateLabel(today)} was not saved — ${detail}.`
      )
      bumpSeverity('error')
    }

    if (degradedSnapshotToday) {
      messages.push(
        `Snapshot for ${formatUtcDateLabel(today)} used fallback values and should be recreated with live prices.`
      )
      bumpSeverity('error')
    } else if (!liveSnapshotToday && pastCron) {
      messages.push(
        `No live snapshot for ${formatUtcDateLabel(today)}. PnL may be based on an older snapshot.`
      )
      bumpSeverity('warning')
    }

    if (
      snapshotMeta?.lastStatus === 'error' &&
      snapshotMeta.lastDate === today &&
      !messages.some((m) => m.includes('not saved'))
    ) {
      messages.push(
        `Daily snapshot for ${formatUtcDateLabel(today)} failed: ${snapshotMeta.lastError || 'unknown error'}.`
      )
      bumpSeverity('error')
    }

    const latestByTimestamp = data.snapshots.length > 0
      ? data.snapshots.reduce((latest, s) => (s.timestamp > latest.timestamp ? s : latest))
      : null

    if (
      latestByTimestamp &&
      isDegradedSnapshot(latestByTimestamp) &&
      latestByTimestamp.date !== today &&
      !degradedSnapshotToday
    ) {
      messages.push(
        `Latest snapshot (${formatUtcDateLabel(latestByTimestamp.date)}) may use fallback values — daily PnL can be inaccurate.`
      )
      bumpSeverity('warning')
    }

    return {
      severity,
      messages,
      showBanner: messages.length > 0,
    }
  }, [data.snapshots, snapshotMeta])
}
