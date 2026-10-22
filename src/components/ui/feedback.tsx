"use client";

import {
  useEffect,
  useId,
  useRef,
  type DialogHTMLAttributes,
  type ReactNode,
} from "react";
import { Button } from "./primitives";

type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

type SurfaceProps = OverlayProps & {
  className: string;
  closeLabel: string;
  role?: DialogHTMLAttributes<HTMLDialogElement>["role"];
};

function OverlaySurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  closeLabel,
  role = "dialog",
}: SurfaceProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={`ui-dialog ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
      role={role}
    >
      <div className="ui-dialog__surface">
        <header className="ui-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <Button
            aria-label={closeLabel}
            onClick={() => onOpenChange(false)}
            size="icon"
            variant="ghost"
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </Button>
        </header>
        <div className="ui-dialog__content">{children}</div>
      </div>
    </dialog>
  );
}

export function Dialog(props: OverlayProps) {
  return (
    <OverlaySurface
      {...props}
      className="ui-dialog--modal"
      closeLabel="Fermer la fenêtre"
    />
  );
}

export function Sheet(props: OverlayProps) {
  return (
    <OverlaySurface
      {...props}
      className="ui-dialog--sheet"
      closeLabel="Fermer le panneau"
    />
  );
}

type ToastProps = {
  title: string;
  description?: string;
  onDismiss?: () => void;
};

export function Toast({ title, description, onDismiss }: ToastProps) {
  return (
    <div className="ui-toast" role="status">
      <span aria-hidden="true" className="ui-toast__icon">
        ✓
      </span>
      <div>
        <p className="ui-toast__title">{title}</p>
        {description ? (
          <p className="ui-toast__description">{description}</p>
        ) : null}
      </div>
      {onDismiss ? (
        <Button
          aria-label="Fermer la notification"
          onClick={onDismiss}
          size="icon"
          variant="ghost"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </Button>
      ) : null}
    </div>
  );
}
