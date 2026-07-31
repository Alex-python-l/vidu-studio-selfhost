"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type React from "react";

// Adapted from coss Progress (MIT) for Vidu Studio's task-state styling.
function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Progress({
  className,
  children,
  ...props
}: ProgressPrimitive.Root.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Root
      className={classes("ui-progress", className)}
      data-slot="progress"
      {...props}
    >
      {children ?? (
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      )}
    </ProgressPrimitive.Root>
  );
}

export function ProgressLabel({
  className,
  ...props
}: ProgressPrimitive.Label.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Label
      className={classes("ui-progress-label", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

export function ProgressTrack({
  className,
  ...props
}: ProgressPrimitive.Track.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Track
      className={classes("ui-progress-track", className)}
      data-slot="progress-track"
      {...props}
    />
  );
}

export function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Indicator
      className={classes("ui-progress-indicator", className)}
      data-slot="progress-indicator"
      {...props}
    />
  );
}

export function ProgressValue({
  className,
  ...props
}: ProgressPrimitive.Value.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Value
      className={classes("ui-progress-value", className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export { ProgressPrimitive };
