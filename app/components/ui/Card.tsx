"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type React from "react";

// Adapted from coss Card (MIT) for Vidu Studio's project-owned visual system.
function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Card({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: classes("ui-card", className),
        "data-slot": "card",
      },
      props,
    ),
    render,
  });
}

export function CardHeader({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: classes("ui-card-header", className),
        "data-slot": "card-header",
      },
      props,
    ),
    render,
  });
}

export function CardTitle({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: classes("ui-card-title", className),
        "data-slot": "card-title",
      },
      props,
    ),
    render,
  });
}

export function CardDescription({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: classes("ui-card-description", className),
        "data-slot": "card-description",
      },
      props,
    ),
    render,
  });
}

export function CardPanel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: classes("ui-card-panel", className),
        "data-slot": "card-panel",
      },
      props,
    ),
    render,
  });
}

export function CardFooter({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: classes("ui-card-footer", className),
        "data-slot": "card-footer",
      },
      props,
    ),
    render,
  });
}

export { CardPanel as CardContent };
