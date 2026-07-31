"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type React from "react";
import { X } from "reicon-react";
import { Button } from "@/app/components/ui/Button";

// Adapted from coss Dialog (MIT) for Vidu Studio's tutorial flows.
function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;

export function DialogTrigger(
  props: DialogPrimitive.Trigger.Props,
): React.ReactElement {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogClose(
  props: DialogPrimitive.Close.Props,
): React.ReactElement {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogPopup({
  className,
  children,
  showCloseButton = true,
  closeLabel = "Close",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  closeLabel?: string;
}): React.ReactElement {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className="ui-dialog-backdrop"
        data-slot="dialog-backdrop"
      />
      <DialogPrimitive.Viewport
        className="ui-dialog-viewport"
        data-slot="dialog-viewport"
      >
        <DialogPrimitive.Popup
          className={classes("ui-dialog-popup", className)}
          data-slot="dialog-popup"
          {...props}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="ui-dialog-close"
              data-slot="dialog-close"
              render={<Button size="icon" variant="ghost" />}
            >
              <X size={18} color="currentColor" />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={classes("ui-dialog-header", className)}
      data-slot="dialog-header"
      {...props}
    />
  );
}

export function DialogPanel({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={classes("ui-dialog-panel", className)}
      data-slot="dialog-panel"
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={classes("ui-dialog-footer", className)}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props): React.ReactElement {
  return (
    <DialogPrimitive.Title
      className={classes("ui-dialog-title", className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props): React.ReactElement {
  return (
    <DialogPrimitive.Description
      className={classes("ui-dialog-description", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}
