"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type React from "react";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

type SwitchProps = Omit<SwitchPrimitive.Root.Props, "className"> & {
  className?: string;
};

export function Switch({
  className,
  ...props
}: SwitchProps): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      className={classes("ui-switch", className)}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="ui-switch-thumb"
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}
