import { z } from 'zod'
import { isCourseId } from './aau-courses.js'

export const CHARACTER_TYPE_IDS = ['student', 'graduate', 'lecturer', 'indigene', 'casual'] as const
export const LODGING_IDS = ['hostel-poultry', 'single-poultry', 'selfcon-g2', 'onebed-ojo'] as const
export const setupBodySchema = z
  .object({
    characterType: z.enum(CHARACTER_TYPE_IDS),
    lodgingId: z.enum(LODGING_IDS),
    courseId: z
      .string()
      .refine((id) => isCourseId(id), 'Pick a course from the list.')
      .nullable()
      .optional(),
    /** Pay the move-in fee and start the game (first time only). Plain picks just remember the choice. */
    moveIn: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    // Students pick their course, wherever they live
    if (value.characterType === 'student' && !value.courseId) {
      ctx.addIssue({ code: 'custom', message: 'Pick your course.', path: ['courseId'] })
    }
    // The Igbinedion hostel is for students only
    if (value.lodgingId === 'hostel-poultry' && value.characterType !== 'student') {
      ctx.addIssue({ code: 'custom', message: 'The AAU hostel is for students.', path: ['lodgingId'] })
    }
  })

export type SetupBody = z.infer<typeof setupBodySchema>
