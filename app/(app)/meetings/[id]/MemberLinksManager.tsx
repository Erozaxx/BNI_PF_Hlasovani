"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

interface MemberLink {
  memberId: string;
  memberName: string;
  memberEmail: string;
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
 * spuštění/rozeslání dělá StartVotingPanel — tahle komponenta se stará jen
 * o kopírování, regeneraci, revokaci a poslání e-mailu jednomu členovi.
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
        setError(body.error ?? "Nepodarilo se nacist magic linky.");
        return;
      }
      const data = await res.json();
      setLinks(data.links ?? []);
    } catch {
      setError("Nepodarilo se nacist magic linky.");
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
        `Zkopirovanim se odkaz pregeneruje. Dosud rozeslany odkaz clena ${memberName} prestane platit. Pokracovat?`
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
        showToast("error", body.error ?? "Nepodarilo se regenerovat token.");
        return;
      }
      const url = body.magicUrl ?? `${window.location.origin}/m/${body.rawToken}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast("success", "Odkaz zkopirovan do schranky.");
      } catch {
        showToast("error", "Odkaz byl vygenerovan, ale nepodarilo se ho zkopirovat.");
      }
      await fetchLinks();
    } catch {
      showToast("error", "Nepodarilo se zkopirovat odkaz.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  async function handleRegenerate(memberId: string) {
    setMemberBusy(memberId, true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/member-links/${memberId}/regenerate`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Nepodarilo se regenerovat token.");
        return;
      }
      showToast("success", "Token byl regenerovan. Puvodni odkaz uz neplati.");
      await fetchLinks();
    } catch {
      showToast("error", "Nepodarilo se regenerovat token.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  async function handleRevoke(memberId: string, memberName: string) {
    if (
      !confirm(`Opravdu chcete revokovat magic link pro ${memberName}? Clen ztrati pristup.`)
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
        showToast("error", body.error ?? "Nepodarilo se revokovat token.");
        return;
      }
      showToast("success", "Magic link byl revokovan.");
      await fetchLinks();
    } catch {
      showToast("error", "Nepodarilo se revokovat token.");
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
        showToast("error", body.error ?? "Nepodarilo se odeslat email.");
        return;
      }
      showToast("success", `Email odeslan clenovi ${memberName}.`);
      await fetchLinks();
    } catch {
      showToast("error", "Nepodarilo se odeslat email.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  function getLinkStatusBadge(link: MemberLink) {
    if (!link.hasLink) {
      return <Badge variant="neutral">Bez linku</Badge>;
    }
    if (link.isRevoked) {
      return <Badge variant="danger">Revokovan</Badge>;
    }
    if (link.isExpired) {
      return <Badge variant="neutral">Expirovan</Badge>;
    }
    return <Badge variant="success">Aktivni</Badge>;
  }

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-text-muted">Nacitam magic linky...</p>
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
          className="mt-3"
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
          Magic linky clenu
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Schuzka: {meetingDate} &mdash; {links.length} clenu
        </p>
      </div>

      {links.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            Zadni clenove s emailem nebyli nalezeni.
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
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {link.memberEmail}
                    </p>
                    {link.morningEmailSentAt && (
                      <p className="text-xs text-text-muted mt-0.5">
                        Odkaz odeslan:{" "}
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
                        Expiruje:{" "}
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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(link.memberId, link.memberName)}
                      loading={busy}
                      title="Regenerovat token a zkopirovat magic link URL"
                    >
                      Kopirovat
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSendEmail(link.memberId, link.memberName)}
                      loading={busy}
                      disabled={!link.hasLink || link.isRevoked}
                      title={
                        !link.hasLink
                          ? "Clen nema link"
                          : link.isRevoked
                          ? "Link je revokovan"
                          : "Odeslat magic link email"
                      }
                    >
                      Poslat email
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRegenerate(link.memberId)}
                      loading={busy}
                    >
                      Regenerovat
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRevoke(link.memberId, link.memberName)}
                      loading={busy}
                      disabled={!link.hasLink || link.isRevoked}
                      title={
                        !link.hasLink
                          ? "Clen nema link"
                          : link.isRevoked
                          ? "Link jiz revokovan"
                          : "Revokovat magic link"
                      }
                    >
                      Revokovat
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
