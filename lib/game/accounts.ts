import { apiUrl } from './api'

const ACCOUNTS_KEY = 'ekpoma-life-accounts-v1'
const SESSION_KEY = 'ekpoma-life-session-v1'

export const MIN_AGE = 18
export const MIN_PASSWORD_LENGTH = 8
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export type Account = {
  name: string
  username: string
  email?: string
  dateOfBirth: string
  passwordHash: string
  createdAt: string
}

export type SignupInput = {
  name: string
  username: string
  password: string
  email: string
  dateOfBirth: string
  isAdult: boolean
}

export type PublicAccount = { name: string; username: string }

type Result = { ok: true; account: PublicAccount } | { ok: false; error: string }

export const saveKey = (username: string) => `ekpoma-life-save-v3:${username}`

export const normalizeUsername = (username: string) => username.trim().toLowerCase()

export function ageOn(dateOfBirth: string, today = new Date()) {
  const birth = new Date(`${dateOfBirth}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return -1
  let age = today.getFullYear() - birth.getFullYear()
  const beforeBirthday =
    today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age
}

function readAccounts(): Record<string, Account> {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Account>) : {}
  } catch {
    return {}
  }
}

export function getAccount(username: string): Account | null {
  return readAccounts()[normalizeUsername(username)] ?? null
}

export async function createAccount(input: SignupInput): Promise<Result> {
  const name = input.name.trim()
  const username = normalizeUsername(input.username)
  const email = input.email.trim()

  if (name.length < 2) return { ok: false, error: 'Enter your name.' }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: 'Username must be 3–20 letters, numbers or underscores.' }
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email or leave it empty.' }
  if (input.dateOfBirth) {
    const age = ageOn(input.dateOfBirth)
    if (age < MIN_AGE) return { ok: false, error: `You must be ${MIN_AGE} or older to play.` }
  }
  if (!input.isAdult) return { ok: false, error: 'Confirm you are 18 or older and accept the Terms and Conditions.' }

  try {
    const response = await fetch(`${apiUrl()}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, username, password: input.password, isAdult: input.isAdult }),
    })
    const data = (await response.json()) as Result
    if (!data.ok) return { ok: false, error: data.error || 'Could not create the account.' }
    return data
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function verifyLogin(usernameInput: string, password: string): Promise<Result> {
  const username = normalizeUsername(usernameInput)
  if (!username || !password) return { ok: false, error: 'Wrong username or password.' }

  try {
    const response = await fetch(`${apiUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    const data = (await response.json()) as Result
    if (!data.ok) return { ok: false, error: data.error || 'Wrong username or password.' }
    return data
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export function getSession() {
  return window.localStorage.getItem(SESSION_KEY)
}

export function setSession(username: string) {
  window.localStorage.setItem(SESSION_KEY, username)
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY)
}
