export function nCk(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0) return 1;
  let r = 1;
  for (let d = 1; d <= k; d++) r = (r * (n - k + d)) / d;
  return r;
}

const FACT = [1];
export function factorial(n) {
  for (let i = FACT.length; i <= n; i++) FACT[i] = FACT[i - 1] * i;
  return FACT[n];
}

export const log2 = Math.log2;

/** Size of the character pool a string draws from: 26 + 26 + 10 + 33 at most. */
export function poolSize(str) {
  let pool = 0;
  if (/[a-z]/.test(str)) pool += 26;
  if (/[A-Z]/.test(str)) pool += 26;
  if (/[0-9]/.test(str)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(str)) pool += 33;
  return pool;
}
