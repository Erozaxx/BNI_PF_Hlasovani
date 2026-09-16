import {
  MEETING_TOKEN_PAGE_TEXT,
  type MeetingTokenErrorReason,
} from "@/lib/meetings/token-error-text";

interface MeetingExpiredProps {
  /**
   * iter-028 (T-006, arch 4.7): důvod odvozený z `tokenErrorText` na
   * volajícím (page.tsx). `undefined`/`null` (síťová chyba, neočekávaný
   * status) zachová dnešní obecný text.
   */
  reason?: MeetingTokenErrorReason | null;
}

/**
 * Shown when the magic link token is invalid, revoked, or expired.
 * Static view — no interactivity needed.
 */
export function MeetingExpired({ reason }: MeetingExpiredProps) {
  const content = reason
    ? MEETING_TOKEN_PAGE_TEXT[reason]
    : {
        title: "Link vypršel",
        body: "Tento odkaz pro hlasovani uz neni platny. Kontaktujte organizatora schuzky pro zaslani noveho odkazu.",
      };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">&#x231B;</div>
        <h1 className="text-2xl font-bold text-text-main">{content.title}</h1>
        <p className="text-text-muted text-sm">{content.body}</p>
      </div>
    </div>
  );
}
