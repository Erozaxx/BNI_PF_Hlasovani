"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { formatWeekdayFull } from "@/lib/attendance/rules";

interface MemberLink {
  memberId: string;
  memberName: string;
  memberEmail: string;
  /** iter-037: deaktivovaný člen, bez akcí Zkopírovat odkaz, Poslat e-mailem a Nový odkaz. */
  isInactive: boolean;
  hasLink: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  morningEmailSentAt: string | null;
}

interface MemberLinksManagerProps {
  meetingId: string;
  meetingDate: string;
}

/**
 * Výpis odkazů + operace po jednotlivcích (iter-026, arch 4.4). Hromadné
 * spuštění/rozeslání dělá StartVotingPanel, tahle komponenta se stará jen
 * o kopírování, nový odkaz, zneplatnění a poslání e-mailu jednomu členovi.
 *
 * Klient nikdy nedrží syrový token (arch 1, bod 3): "Kopírovat" i "Poslat
 * email" volají server, který si token vždy sám regeneruje.
 */
export function MemberLinksManager({
  meetingId,
  meetingDate,
}: MemberLinksManagerProps) {
  const { showToast } = useToast();
  const [links, setLinks] = useState<MemberLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-member loading states
  const [memberLoading, setMemberLoading] = useState<Record<string, boolean>>({});

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/member-links`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Odkazy se nepodařilo načíst.");
        return;
      }
      const data = await res.json();
      setLinks(data.links ?? []);
    } catch {
      setError("Odkazy se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  function setMemberBusy(memberId: string, busy: boolean) {
    setMemberLoading((prev) => ({ ...prev, [memberId]: busy }));
  }

  async function handleCopy(memberId: string, memberName: string) {
    if (
      !confirm(
        `Zkopírováním vznikne nový odkaz. Dosavadní odkaz člena ${memberName} přestane platit. Pokračovat?`
      )
    ) {
      return;
    }
    setMemberBusy(memberId, true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/member-links/${memberId}/regenerate`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Odkaz se nepodařilo vytvořit.");
        return;
      }
      const url = body.magicUrl ?? `${window.location.origin}/m/${body.rawToken}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast("success", "Odkaz je zkopírovaný do schránky.");
      } catch {
        showToast("error", "Odkaz je hotový, ale nepodařilo se ho zkopírovat.");
      }
      await fetchLinks();
    } catch {
      showToast("error", "Odkaz se nepodařilo zkopírovat.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  async function handleRegenerate(memberId: string, memberName: string) {
    if (
      !confirm(
        `Vytvořit nový odkaz pro ${memberName}? Dosavadní odkaz přestane platit.`
      )
    ) {
      return;
    }
    setMemberBusy(memberId, true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/member-links/${memberId}/regenerate`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Odkaz se nepodařilo vytvořit.");
        return;
      }
      showToast("success", "Nový odkaz je hotový, původní už neplatí.");
      await fetchLinks();
    } catch {
      showToast("error", "Odkaz se nepodařilo vytvořit.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  async function handleRevoke(memberId: string, memberName: string) {
    if (
      !confirm(`Zneplatnit odkaz člena ${memberName}? Hlasovat s ním už nepůjde.`)
    ) {
      return;
    }
    setMemberBusy(memberId, true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/member-links/${memberId}/revoke`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Odkaz se nepodařilo zneplatnit.");
        return;
      }
      showToast("success", "Odkaz je zneplatněný.");
      await fetchLinks();
    } catch {
      showToast("error", "Odkaz se nepodařilo zneplatnit.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  async function handleSendEmail(memberId: string, memberName: string) {
    setMemberBusy(memberId, true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/member-links/${memberId}/send-email`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "E-mail se nepodařilo odeslat.");
        return;
      }
      showToast("success", `E-mail odešel členovi ${memberName}.`);
      await fetchLinks();
    } catch {
      showToast("error", "E-mail se nepodařilo odeslat.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  function getLinkStatusBadge(link: MemberLink) {
    if (!link.hasLink) {
      return <Badge variant="neutral">Bez odkazu</Badge>;
    }
    if (link.isRevoked) {
      return <Badge variant="danger">Zneplatněný</Badge>;
    }
    if (link.isExpired) {
      return <Badge variant="neutral">Vypršel</Badge>;
    }
    return <Badge variant="success">Platí</Badge>;
  }

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-text-muted">Načítám odkazy...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm text-danger">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchLinks}
          className="mt-3 min-h-[44px]"
        >
          Zkusit znovu
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-main">
          Osobní odkazy členů
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Schůzka: {formatWeekdayFull(meetingDate)}, {links.length} členů
        </p>
        <p className="text-sm text-text-muted mt-1">
          Nový odkaz i zkopírování vytvoří nový odkaz, ten z mailu přestane platit.
        </p>
      </div>

      {links.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            Žádní členové s e-mailem.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {links.map((link) => {
            const busy = memberLoading[link.memberId] ?? false;

            return (
              <Card key={link.memberId}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  {/* Member info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-text-main text-sm">
                        {link.memberName}
                      </p>
                      {getLinkStatusBadge(link)}
                      {link.isInactive && <Badge variant="neutral">Neaktivní</Badge>}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {link.memberEmail}
                    </p>
                    {link.morningEmailSentAt && (
                      <p className="text-xs text-text-muted mt-0.5">
                        Odkaz odeslán:{" "}
                        {new Date(link.morningEmailSentAt).toLocaleDateString(
                          "cs-CZ",
                          {
                            day: "numeric",
                            month: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </p>
                    )}
                    {link.expiresAt && (
                      <p className="text-xs text-text-muted mt-0.5">
                        Platí do:{" "}
                        {new Date(link.expiresAt).toLocaleDateString("cs-CZ", {
                          day: "numeric",
                          month: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {!link.isInactive && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopy(link.memberId, link.memberName)}
                          loading={busy}
                          className="min-h-[44px]"
                        >
                          Zkopírovat odkaz
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSendEmail(link.memberId, link.memberName)}
                          loading={busy}
                          disabled={!link.hasLink || link.isRevoked}
                          className="min-h-[44px]"
                        >
                          Poslat e-mailem
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRegenerate(link.memberId, link.memberName)}
                          loading={busy}
                          className="min-h-[44px]"
                        >
                          Nový odkaz
                        </Button>
                      </>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRevoke(link.memberId, link.memberName)}
                      loading={busy}
                      disabled={!link.hasLink || link.isRevoked}
                      className="min-h-[44px]"
                    >
                      Zneplatnit
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
