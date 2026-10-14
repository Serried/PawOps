// Same rule as Member 1's UI: display_name, else the email name
export function userNameSql(alias) {
  return `COALESCE(NULLIF(btrim(${alias}.display_name), ''), split_part(${alias}.email, '@', 1))`
}

export function userName(user) {
  const displayName = typeof user?.display_name === 'string' ? user.display_name.trim() : ''
  return displayName || String(user?.email ?? '').split('@')[0]
}
