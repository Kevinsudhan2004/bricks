"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Link that keeps the shared App Shell prefetched (`auto`) and, as soon as the user
 * shows intent (hover, touch, keyboard focus), prefetches this row's full page data
 * so opening it feels instant — without one server request per visible row.
 */
export function IntentLink({
  href,
  className,
  children,
  ...rest
}: React.ComponentProps<typeof Link> & { href: string }) {
  const [active, setActive] = useState(false);
  const arm = () => setActive(true);
  return (
    <Link
      href={href}
      prefetch={active ? true : "auto"}
      onMouseEnter={arm}
      onTouchStart={arm}
      onFocus={arm}
      className={className}
      {...rest}
    >
      {children}
    </Link>
  );
}
