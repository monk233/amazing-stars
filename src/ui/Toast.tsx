import { WorkspaceIcon } from './WorkspaceIcon';
import type { Toast } from './use-toasts';

/** 右下角提示条：成功与失败都能手动关闭，失败使用 alert 语义。 */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null;
  return <div className="toast-stack" aria-live="polite">
    {toasts.map(item => <div key={item.id} className={'toast ' + item.kind} role={item.kind === 'error' ? 'alert' : 'status'}>
      <span className="toast-message">{item.message}</span>
      <button type="button" className="icon-button toast-close" aria-label="关闭提示" onClick={() => onDismiss(item.id)}>
        <WorkspaceIcon name="close" />
      </button>
    </div>)}
  </div>;
}
