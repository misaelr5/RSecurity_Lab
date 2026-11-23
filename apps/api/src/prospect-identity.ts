import { normalize } from '@reac/core'
import type { Prospect } from '@reac/core'

export type IdentityRecord = Pick<Prospect, 'name' | 'city' | 'website' | 'email' | 'phone' | 'registrationId'>
export type IdentityHistory = { knownIdentities?: string[] }

export function hostname(value: string) {
  try { return new URL(value).hostname.replace(/^www\./i, '').replace(/\.$/, '').toLowerCase() }
  catch { return '' }
}

export function identityKeys(value: IdentityRecord) {
  const phone = value.phone.replace(/\D/g, '')
  const name = normalize(value.name)
  const city = normalize(value.city)
  return [
    ['location', name && city && JSON.stringify([name, city])], ['domain', hostname(value.website)],
    ['email', value.email.toLowerCase()], ['phone', phone.length >= 8 ? phone.slice(-10) : ''],
    ['registry', normalize(value.registrationId ?? '').replace(/[^\p{L}\p{N}]/gu, '')],
  ].filter(([, key]) => key).map(([kind, key]) => kind + ':' + key)
}

export function rememberIdentity(before: IdentityRecord & IdentityHistory, after: IdentityRecord) {
  const current = new Set(identityKeys(after))
  return [...new Set([...(before.knownIdentities ?? []), ...identityKeys(before)])].filter((key) => !current.has(key))
}
