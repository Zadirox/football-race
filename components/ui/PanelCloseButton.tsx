'use client';

type PanelCloseButtonProps = {
  onClose: () => void;
};

export function PanelCloseButton({ onClose }: PanelCloseButtonProps) {
  return (
    <button
      type="button"
      className="icon-btn panel__close"
      aria-label="Закрыть"
      title="Закрыть"
      onClick={onClose}
    >
      ✕
    </button>
  );
}