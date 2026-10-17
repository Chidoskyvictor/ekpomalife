import { z } from 'zod'

export const CHARACTER_TYPE_IDS = ['student', 'lecturer', 'indigene', 'casual'] as const
export const LODGING_IDS = ['hostel-poultry', 'selfcon-oxford', 'selfcon-g2', 'onebed-ojo'] as const
export const COURSE_IDS = [
  'computer-science',
  'engineering',
  'mass-comm',
  'law',
  'accounting',
  'theatre-arts',
  'nursing',
  'education',
] as const

export const setupBodySchema = z
  .object({
    characterType: z.enum(CHARACTER_TYPE_IDS),
    lodgingId: z.enum(LODGING_IDS),
    courseId: z.enum(COURSE_IDS).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.lodgingId === 'hostel-poultry' && !value.courseId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pick a course for AAU student lodging.',
        path: ['courseId'],
      })
    }
  })

export type SetupBody = z.infer<typeof setupBodySchema>
