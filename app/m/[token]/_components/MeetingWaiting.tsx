/**
 * Shown when the magic link token is valid but voting has not started yet
 * (meeting is in draft or active state). Instructs the member to use the
 * link again once the facilitator opens voting.
 */
interface MeetingWaitingProps {
  meetingDate: string;
  location: string | null;
  memberName: string | null;
}

export function MeetingWaiting({
  meetingDate,
  location,
  memberName,
}: MeetingWaitingProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">&#x23F3;</div>
        <h1 className="text-2xl font-bold text-text-main">
          Hlasování zatím nebylo spuštěno
        </h1>
        {memberName && (
          <p className="text-text-muted text-sm">
            Přihlášený člen: {memberName}
          </p>
        )}
        <div className="bg-info-light border border-info rounded-lg px-4 py-3 text-left space-y-1">
          <p className="text-sm font-medium text-info-dark">
            Schůzka: {meetingDate}
          </p>
          {location && (
            <p className="text-sm text-info-dark">Místo: {location}</p>
          )}
        </div>
        <p className="text-text-muted text-sm">
          Hlasování ještě nebylo spuštěno. Jakmile organizátor schůzky zahájí
          hlasování, použijte tento odkaz znovu.
        </p>
      </div>
    </div>
  );
}
