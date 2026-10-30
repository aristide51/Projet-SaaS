import {
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
      type={type}
      {...props}
    />
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export function Input({ className = "", hasError, ...props }: InputProps) {
  return (
    <input
      className={`ui-input ${hasError ? "ui-input--error" : ""} ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={`ui-input ui-textarea ${className}`} {...props} />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="ui-select-wrap">
      <select className={`ui-input ui-select ${className}`} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="ui-select__icon"
        fill="none"
        viewBox="0 0 20 20"
      >
        <path d="m5 7.5 5 5 5-5" />
      </svg>
    </span>
  );
}

export function Checkbox({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={`ui-checkbox ${className}`} type="checkbox" {...props} />
  );
}

type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "type"
> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({
  checked,
  onCheckedChange,
  className = "",
  ...props
}: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={`ui-switch ${checked ? "ui-switch--checked" : ""} ${className}`}
      onClick={() => onCheckedChange?.(!checked)}
      role="switch"
      type="button"
      {...props}
    >
      <span className="ui-switch__thumb" />
    </button>
  );
}

export function Card({
  className = "",
  ...props
}: React.ComponentProps<"div">) {
  return <div className={`ui-card ${className}`} {...props} />;
}

type BadgeProps = React.ComponentProps<"span"> & {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`} {...props} />
  );
}

export function Skeleton({
  className = "",
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div aria-hidden="true" className={`ui-skeleton ${className}`} {...props} />
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="ui-empty-state">
      <span aria-hidden="true" className="ui-empty-state__icon">
        ✳
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </section>
  );
}

type FormFieldProps = {
  label: string;
  labelAction?: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactElement<{
    id?: string;
    required?: boolean;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
};

export function FormField({
  label,
  labelAction,
  hint,
  error,
  required,
  children,
}: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true } : {}),
        ...(required ? { required: true } : {}),
      })
    : children;

  const fieldLabel = (
    <label className="ui-label" htmlFor={id}>
      {label}
      {required ? (
        <span aria-hidden="true" className="ui-form-field__required">
          {" "}
          *
        </span>
      ) : null}
    </label>
  );

  return (
    <div className="ui-form-field">
      {labelAction ? (
        <div className="ui-form-field__heading">
          {fieldLabel}
          {labelAction}
        </div>
      ) : (
        fieldLabel
      )}
      {control}
      {hint ? (
        <p className="ui-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
