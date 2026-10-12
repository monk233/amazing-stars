import { useCallback, useEffect, useRef, useState } from 'react';

export interface Toast { id: string; kind: 'success' | 'error'; message: string }

/** 右下角提示队列：最多同时三条，成功 4 秒、失败 6 秒后自动消失，也可以手动关闭。 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { for (const timer of timers.current) window.clearTimeout(timer); }, []);
  const dismiss = useCallback((id: string) => setToasts(current => current.filter(item => item.id !== id)), []);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = crypto.randomUUID();
    setToasts(current => [...current.slice(-2), { id, kind, message }]);
    timers.current.push(window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000));
  }, [dismiss]);
  return { toasts, push, dismiss };
}
