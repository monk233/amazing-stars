import { useEffect, useRef } from 'react';

/** 依赖变化后延迟执行；期间再次变化就重新计时，卸载时取消。用于自动保存。 */
export function useDebouncedEffect(effect: () => void, delay: number, deps: unknown[]): void {
  const latest = useRef(effect);
  latest.current = effect;
  useEffect(() => {
    const timer = window.setTimeout(() => latest.current(), delay);
    return () => window.clearTimeout(timer);
  }, deps);
}
