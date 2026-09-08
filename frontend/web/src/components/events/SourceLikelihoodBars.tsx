import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'

export function SourceLikelihoodBars({
  items,
  className,
}: {
  items: { source: string; probability: number }[]
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-xs text-text-muted">
        Source likelihood is probabilistic, not proof of causality.
      </p>
      {items.map((item, i) => (
        <motion.div
          key={item.source}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
        >
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-text-secondary">{item.source}</span>
            <span className="font-mono font-medium text-intel">{item.probability}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-intel-dim to-intel"
              initial={{ width: 0 }}
              animate={{ width: `${item.probability}%` }}
              transition={{ duration: 0.6, delay: i * 0.06 }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  )
}
