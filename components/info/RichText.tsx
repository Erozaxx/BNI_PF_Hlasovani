/**
 * Text s odkazy na role (iter-030, T-007a, arch_iter-030_T-001 sekce 7.3).
 * Úseky připraví `linkRoles()` / `createRoleLinker()` v komponentě kroku,
 * tady se jen vykreslí. Bez odkazu je výstup stejný jako holý řetězec.
 */
import { Fragment } from "react";
import type { Segment } from "@/lib/info-pages/glossary";

export function RichText({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.href !== undefined && !segment.role ? (
          <a
            key={i}
            href={segment.href}
            className="rounded text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
          >
            {segment.text}
          </a>
        ) : segment.role ? (
          <a
            key={i}
            href={segment.href}
            title={segment.title}
            data-role={segment.role}
            className="info-role-link rounded focus:outline-none focus-visible:shadow-focus"
          >
            {segment.text}
          </a>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        )
      )}
    </>
  );
}
