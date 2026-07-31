"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type React from "react";

// Adapted from coss Button (MIT) for Vidu Studio's project-owned visual system.
function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant =
  | "default"
  | "destructive"
  | "ghost"
  | "outline"
  | "secondary";

type ButtonSize = "xs" | "sm" | "default" | "lg" | "icon";

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled: disabledProp,
  render,
  children,
  ...props
}: ButtonProps): React.ReactElement {
  const disabled = Boolean(loading || disabledProp);

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        "aria-disabled": loading || undefined,
        className: classes(
          "ui-button",
          `ui-button-variant--${variant}`,
          `ui-button-size--${size}`,
          className,
        ),
        children: (
          <>
            {loading ? (
              <span
                className="ui-button-spinner"
                data-slot="button-loading-indicator"
                aria-hidden="true"
              />
            ) : null}
            {children}
          </>
        ),
        "data-loading": loading ? "" : undefined,
        "data-slot": "button",
        disabled,
        type: render ? undefined : "button",
      },
      props,
    ),
    render,
  });
}
