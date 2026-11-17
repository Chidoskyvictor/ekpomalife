const STEPS = ['Look', 'Personality', 'Dream', 'Home'] as const

/** Shared "Step N of 4" progress used by every setup step (look → traits → dream → live). */
export function StepDots({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div
      className="flex flex-col items-center gap-1"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={current}
      aria-valuetext={`Step ${current} of 4: ${STEPS[current - 1]}`}
    >
      <div className="flex gap-1.5">
        {([1, 2, 3, 4] as const).map((step) => (
          <span
            key={step}
            className={`h-1.5 w-6 rounded-full ${step <= current ? 'bg-primary' : 'bg-neutral-200'}`}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-neutral-500">Step {current} of 4</span>
    </div>
  )
}
