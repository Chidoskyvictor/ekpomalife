import { z } from 'zod'
import { MIN_PASSWORD_LENGTH } from './password.js'

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(40, 'Name is too long.'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_PATTERN, 'Username must be 3–20 letters, numbers or underscores.'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`).max(72, 'Password is too long.'),
  email: z.string().trim().email('Enter a valid email.').max(120),
  dateOfBirth: z
    .union([
      z.literal(''),
      z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth.'),
    ])
    .optional(),
  isAdult: z.boolean().refine((value) => value === true, {
    message: 'Confirm you are 18 or older and accept the Terms and Conditions.',
  }),
})

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(20),
  password: z.string().min(1).max(72),
})
