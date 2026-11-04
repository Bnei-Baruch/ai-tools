import React from 'react';

// Small Tailwind building blocks for the forms of the older tools (Transcription, Speakers, Text diff).

export const cx = (...classes) => classes.filter(Boolean).join(' ');

const BUTTON_VARIANTS = {
    primary: 'border-transparent bg-blue-600 text-white hover:bg-blue-700',
    basic: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    gray: 'border-transparent bg-slate-200 text-slate-800 hover:bg-slate-300',
    teal: 'border-transparent bg-teal-600 text-white hover:bg-teal-700',
};

const BUTTON_SIZES = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
    xl: 'px-8 py-4 text-xl',
};

export const Spinner = ({ className }) => (
    <span aria-hidden className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
);

// as: another element or component to render (e.g. a router Link)
export const Button = ({ as: As = 'button', variant = 'basic', size = 'md', loading = false, className, children, ...props }) => (
    <As
        type={As === 'button' ? 'button' : undefined}
        {...props}
        disabled={As === 'button' ? props.disabled || loading : undefined}
        className={cx(
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border font-semibold no-underline transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
            BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
        )}
    >
        {loading && <Spinner />}
        {children}
    </As>
);

const MESSAGE_TONES = {
    plain: 'border-slate-200 bg-slate-50 text-slate-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-green-200 bg-green-50 text-green-900',
};

export const Message = ({ tone = 'plain', header, className, children }) => (
    <div className={cx('rounded-lg border p-4', MESSAGE_TONES[tone], className)}>
        {header && <div className="font-semibold">{header}</div>}
        {children}
    </div>
);

export const Page = ({ children }) => <div className="mx-auto max-w-5xl px-4 py-5">{children}</div>;

export const Card = ({ className, children }) => (
    <div className={cx('rounded-lg border border-slate-200 bg-white p-6 shadow-sm', className)}>{children}</div>
);

export const PageHeader = ({ title, subheader }) => (
    <div className="mb-5">
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
        {subheader && <p className="text-slate-500">{subheader}</p>}
    </div>
);

export const SectionHeader = ({ title, subheader }) => (
    <div className="mt-5 mb-2">
        <h4 className="font-semibold text-slate-900">{title}</h4>
        {subheader && <p className="text-sm text-slate-500">{subheader}</p>}
    </div>
);

// A label above its control(s); htmlFor ties it to a single input.
export const Field = ({ label, htmlFor, className, children }) => (
    <div className={cx('flex flex-col gap-1', className)}>
        {label && <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">{label}</label>}
        {children}
    </div>
);

const INPUT = cx(
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm',
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none',
    'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60',
);

export const Input = ({ className, ...props }) => <input {...props} className={cx(INPUT, className)} />;

export const TextArea = ({ className, ...props }) => <textarea {...props} className={cx(INPUT, className)} />;

export const Select = ({ className, children, ...props }) => (
    <select {...props} className={cx(INPUT, className)}>{children}</select>
);

export const Check = ({ type = 'checkbox', label, ...props }) => (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60">
        <input type={type} className="size-4 accent-blue-600" {...props} />
        {label}
    </label>
);
