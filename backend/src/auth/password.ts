import argon2 from 'argon2'

export const MIN_PASSWORD_LENGTH = 8

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password)
}
