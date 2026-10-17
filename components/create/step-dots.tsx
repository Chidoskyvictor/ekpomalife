export function StepDots({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex gap-1.5">
      {([1, 2, 3, 4] as const).map((step) => (
        <span
          key={step}
          className={`h-1.5 w-6 rounded-full ${step <= current ? 'bg-primary' : 'bg-neutral-200'}`}
        />
      ))}
    </div>
  )
}
