"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/actions/auth";

interface MobileNavProps {
  isAdmin: boolean;
  isManagement: boolean;
  name: string;
}

export function MobileNav({ isAdmin, isManagement, name }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  return (
    <details ref={ref} open={open} className="relative">
      <summary
        className="cursor-pointer p-2 rounded-lg hover:bg-background list-none"
        onClick={(e) => {
          e.preventDefault();
          setOpen((prev) => !prev);
        }}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </summary>
      <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-card shadow-lg z-50 p-2">
        <Link
          href="/dashboard"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
          onClick={() => setOpen(false)}
        >
          Dashboard
        </Link>
        <Link
          href="/guests"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
          onClick={() => setOpen(false)}
        >
          Hoste
        </Link>
        <Link
          href="/meetings"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
          onClick={() => setOpen(false)}
        >
          Schuzky
        </Link>
        {isManagement && (
          <Link
            href="/events"
            className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
            onClick={() => setOpen(false)}
          >
            Akce
          </Link>
        )}
        <Link
          href="/archive"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
          onClick={() => setOpen(false)}
        >
          Archiv
        </Link>
        <Link
          href="/help"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
          onClick={() => setOpen(false)}
        >
          Nápověda
        </Link>
        {isAdmin && (
          <>
            <hr className="my-2 border-border" />
            <Link
              href="/admin/members"
              className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
              onClick={() => setOpen(false)}
            >
              Clenove
            </Link>
            <Link
              href="/admin/categories"
              className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
              onClick={() => setOpen(false)}
            >
              Kategorie
            </Link>
          </>
        )}
        {isManagement && (
          <>
            <hr className="my-2 border-border" />
            <Link
              href="/settings"
              className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
              onClick={() => setOpen(false)}
            >
              Nastaveni
            </Link>
          </>
        )}
        <hr className="my-2 border-border" />
        <div className="px-3 py-1 text-xs text-text-muted">{name}</div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger-light"
          >
            Odhlasit se
          </button>
        </form>
      </div>
    </details>
  );
}
