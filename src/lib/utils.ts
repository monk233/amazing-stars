import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names and resolve Tailwind conflicts (Rare UI's helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a count for the Chinese UI; the counter components keep their own digit logic. */
export function formatNumber(value: number) {
  return value.toLocaleString('zh-CN');
}
