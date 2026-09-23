"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Presentational only — the queue, timers and stacking live in
 * `@/lib/toast`, so a toast can be raised from anywhere without a provider.
 */
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-3 rounded-xl border border-border border-l-4 bg-popover p-4 pr-9 text-popover-foreground shadow-lg",
  {
    variants: {
      tone: {
        success: "border-l-emerald-500",
        error: "border-l-destructive",
        warning: "border-l-amber-500",
        info: "border-l-primary",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  }
)

function Toast({
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof toastVariants>) {
  return (
    <div
      data-slot="toast"
      role="status"
      className={cn(toastVariants({ tone }), className)}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="toast-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  )
}

function ToastDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="toast-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function ToastClose({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="toast-close"
      aria-label="Dismiss notification"
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-2 right-2 cursor-pointer rounded-sm p-1 transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
        className
      )}
      {...props}
    >
      <XIcon className="size-3.5" />
    </button>
  )
}

export { Toast, ToastClose, ToastDescription, ToastTitle, toastVariants }
