import { describe, expect, it } from 'vitest'
import { levelForXp, skillForAction, skillForJob, viewSkills, xpForLevel } from './skills.js'

describe('skills', () => {
  it('levels 0-10 from XP', () => {
    expect(levelForXp(0)).toBe(0)
    expect(levelForXp(9)).toBe(0)
    expect(levelForXp(10)).toBe(1)
    expect(levelForXp(60)).toBe(3)
    expect(levelForXp(xpForLevel(10) + 999)).toBe(10)
  })
  it('everyone starts at 0', () => {
    expect(viewSkills([]).every((s) => s.level === 0 && s.xp === 0)).toBe(true)
  })
  it('hangouts train by place', () => {
    expect(skillForAction('hangout', 'sports-complex')?.skill).toBe('fitness')
    expect(skillForAction('hangout', 'sazza')?.skill).toBe('dance')
    expect(skillForAction('hangout', 'students-centre')?.skill).toBe('charisma')
    expect(skillForAction('study', null)?.skill).toBe('academics')
    expect(skillForAction('sleep', null)).toBeNull()
    expect(skillForJob('cyber-cafe')).toBe('tech')
  })
})
