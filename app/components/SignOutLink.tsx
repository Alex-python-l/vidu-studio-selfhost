"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

export function SignOutLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  async function signOut(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <Link
      className={className}
      href="/"
      onClick={signOut}
    >
      {children}
    </Link>
  );
}
