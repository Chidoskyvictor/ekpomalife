import { describe, expect, it } from 'vitest'

/** Ledger balance must always equal cash after every change. */
function applyLedger(
  cash: number,
  ledger: { amount: number; reason: string }[],
  amount: number,
  reason: string,
) {
  const nextCash = cash + amount
  const nextLedger = [...ledger, { amount, reason }]
  const sum = nextLedger.reduce((total, row) => total + row.amount, 0)
  return { cash: nextCash, ledger: nextLedger, sum, balanced: sum === nextCash }
}

describe('ledger balance', () => {
  it('matches cash after starting money and spends', () => {
    let cash = 0
    let ledger: { amount: number; reason: string }[] = []

    ;({ cash, ledger } = applyLedger(cash, ledger, 450_000, 'starting-money'))
    expect(applyLedger(cash, ledger, 450_000, 'starting-money').balanced).toBe(true)

    const afterStart = applyLedger(0, [], 450_000, 'starting-money')
    expect(afterStart.balanced).toBe(true)
    expect(afterStart.sum).toBe(450_000)

    const afterEat = applyLedger(afterStart.cash, afterStart.ledger, -800, 'eat')
    expect(afterEat.balanced).toBe(true)
    expect(afterEat.cash).toBe(449_200)

    const afterWork = applyLedger(afterEat.cash, afterEat.ledger, 600, 'work-placeholder')
    expect(afterWork.balanced).toBe(true)
    expect(afterWork.sum).toBe(afterWork.cash)
  })
})
