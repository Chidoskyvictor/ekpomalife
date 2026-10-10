const ACCOUNTS_KEY = 'ekpoma-life-accounts-v1'
const SESSION_KEY = 'ekpoma-life-session-v1'

export const MIN_AGE = 18
export const MIN_PASSWORD_LENGTH = 6
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

type Result = { ok: true; account: Account } | { ok: false; error: string }

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

async function hashPassword(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
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

  const accounts = readAccounts()
  if (accounts[username]) return { ok: false, error: 'That username is taken.' }

  const account: Account = {
    name,
    username,
    ...(email ? { email } : {}),
    dateOfBirth: input.dateOfBirth,
    passwordHash: await hashPassword(username, input.password),
    createdAt: new Date().toISOString(),
  }
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({ ...accounts, [username]: account }))
  return { ok: true, account }
}

export async function verifyLogin(usernameInput: string, password: string): Promise<Result> {
  const username = normalizeUsername(usernameInput)
  const account = readAccounts()[username]
  if (!account || account.passwordHash !== (await hashPassword(username, password))) {
    return { ok: false, error: 'Wrong username or password.' }
  }
  return { ok: true, account }
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
