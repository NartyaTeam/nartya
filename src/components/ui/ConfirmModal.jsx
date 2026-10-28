import { useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/** Confirmation simple avant une action destructive. Échap ou clic à côté = Annuler. */
export default function ConfirmModal({
  eyebrow,
  title,
  children,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === "Enter" && onConfirm();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onConfirm]);

  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
