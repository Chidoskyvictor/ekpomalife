import { DREAMS } from '@/lib/game/dreams'
import styles from './dream-options.module.css'

export function dreamRadioOptions() {
  return DREAMS.map((dream) => ({
    value: dream.id,
    label: dream.title,
    description: dream.subtitle,
    icon: (
      <span className={styles.icon} aria-hidden="true">
        {dream.emoji}
      </span>
    ),
  }))
}
