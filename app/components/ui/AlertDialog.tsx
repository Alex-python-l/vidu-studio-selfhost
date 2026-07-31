"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type React from "react";

// Adapted from coss Alert Dialog (MIT) for Vidu Studio's confirmation flows.
function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const AlertDialog: typeof AlertDialogPrimitive.Root =
  AlertDialogPrimitive.Root;

export function AlertDialogTrigger(
  props: AlertDialogPrimitive.Trigger.Props,
): React.ReactElement {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

export function AlertDialogPopup({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        className="ui-alert-dialog-backdrop"
        data-slot="alert-dialog-backdrop"
      />
      <AlertDialogPrimitive.Viewport
        className="ui-alert-dialog-viewport"
        data-slot="alert-dialog-viewport"
      >
        <AlertDialogPrimitive.Popup
          className={classes("ui-alert-dialog-popup", className)}
          data-slot="alert-dialog-popup"
          {...props}
        />
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={classes("ui-alert-dialog-header", className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={classes("ui-alert-dialog-footer", className)}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Title
      className={classes("ui-alert-dialog-title", className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Description
      className={classes("ui-alert-dialog-description", className)}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

export function AlertDialogClose(
  props: AlertDialogPrimitive.Close.Props,
): React.ReactElement {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
  );
}
