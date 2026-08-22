import { Dialog } from './Dialog.tsx';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({ title, body, confirmLabel, danger, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onCancel}>Abbrechen</button>
          <button
            type="button"
            className={danger ? 'btn btn--danger-solid' : 'btn btn--primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.55 }}>{body}</p>
    </Dialog>
  );
}
