// Tiny console helpers. Kept in one place so output style is consistent and easy
// to silence/redirect later.
/* eslint-disable no-console */
export function log(msg: string): void {
  console.log(msg);
}
export function warn(msg: string): void {
  console.warn(`! ${msg}`);
}
export function ok(msg: string): void {
  console.log(`✓ ${msg}`);
}
