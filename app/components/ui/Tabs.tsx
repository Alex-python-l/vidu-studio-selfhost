"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type React from "react";

// Adapted from coss Tabs (MIT) for Vidu Studio's project-owned visual system.
function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={classes("ui-tabs", className)}
      data-slot="tabs"
      {...props}
    />
  );
}

export function TabsList({
  className,
  children,
  ...props
}: TabsPrimitive.List.Props): React.ReactElement {
  return (
    <TabsPrimitive.List
      className={classes("ui-tabs-list", className)}
      data-slot="tabs-list"
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        className="ui-tabs-indicator"
        data-slot="tabs-indicator"
      />
    </TabsPrimitive.List>
  );
}

export function TabsTab({
  className,
  ...props
}: TabsPrimitive.Tab.Props): React.ReactElement {
  return (
    <TabsPrimitive.Tab
      className={classes("ui-tabs-tab", className)}
      data-slot="tabs-tab"
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={classes("ui-tabs-panel", className)}
      data-slot="tabs-panel"
      {...props}
    />
  );
}
