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
  /** rawTokens from the activate endpoint (memberId -> rawToken), passed in when available */
  initialRawTokens?: Record<string, string>;
}

export function MemberLinksManager({
  meetingId,
  meetingDate,
  initialRawTokens = {},
}: MemberLinksManagerProps) {
  const { showToast } = useToast();
  const [links, setLinks] = useState<MemberLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map of memberId -> rawToken (only available after activate or regenerate in this session)
  const [rawTokens, setRawTokens] = useState<Record<string, string>>(initialRawTokens);

  // Per-member loading states
  const [memberLoading, setMemberLoading] = useState<Record<string, boolean>>({});

  // Bulk send loading
  const [sendAllLoading, setSendAllLoading] = useState(false);

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

  async function handleCopy(memberId: string) {
    const rawToken = rawTokens[memberId];
    if (!rawToken) {
      showToast(
        "error",
        "Odkaz neni k dispozici. Nejdrive regenerujte token pro tohoto clena."
      );
      return;
    }
    const url = `${window.location.origin}/m/${rawToken}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("success", "Odkaz zkopirovan do schranky.");
    } catch {
      showToast("error", "Nepodarilo se zkopirovat odkaz.");
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
      // Store raw token for this session
      if (body.rawToken) {
        setRawTokens((prev) => ({ ...prev, [memberId]: body.rawToken }));
        showToast(
          "success",
          "Token byl regenerovan. Pouzijte 'Kopirovat odkaz' pro ziskani URL."
        );
      }
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
      // Remove rawToken since it's now revoked
      setRawTokens((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      await fetchLinks();
    } catch {
      showToast("error", "Nepodarilo se revokovat token.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  async function handleSendEmail(memberId: string, memberName: string) {
    const rawToken = rawTokens[memberId];
    if (!rawToken) {
      showToast(
        "error",
        `Pro odeslani emailu clenovi ${memberName} nejdrive regenerujte token.`
      );
      return;
    }
    setMemberBusy(memberId, true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/member-links/${memberId}/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawToken }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Nepodarilo se odeslat email.");
        return;
      }
      showToast("success", `Email odesian clenovi ${memberName}.`);
      await fetchLinks();
    } catch {
      showToast("error", "Nepodarilo se odeslat email.");
    } finally {
      setMemberBusy(memberId, false);
    }
  }

  async function handleSendAll() {
    const tokenCount = Object.keys(rawTokens).length;
    if (tokenCount === 0) {
      showToast(
        "error",
        "Zadne tokeny neni k dispozici. Nejdrive aktivujte schuzku nebo regenerujte tokeny."
      );
      return;
    }
    if (
      !confirm(
        `Odeslat magic link emaily vsem clenum (${tokenCount} tokenu k dispozici)? Clenove bez tokenu budou preskoceni.`
      )
    ) {
      return;
    }
    setSendAllLoading(true);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/member-links/send-all`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawTokens }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Nepodarilo se odeslat emaily.");
        return;
      }
      showToast(
        "success",
        `Emaily odeslany: ${body.sent} odeslano, ${body.skipped} preskoceno, ${body.errors} chyb.`
      );
      await fetchLinks();
    } catch {
      showToast("error", "Nepodarilo se odeslat emaily.");
    } finally {
      setSendAllLoading(false);
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

  const availableTokenCount = Object.keys(rawTokens).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-main">
            Magic linky clenu
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Schuzka: {meetingDate} &mdash; {links.length} clenu
            {availableTokenCount > 0 && (
              <span className="ml-2 text-primary">
                ({availableTokenCount} tokenu v session)
              </span>
            )}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSendAll}
          loading={sendAllLoading}
          disabled={availableTokenCount === 0}
        >
          Hromadne poslat vsem
        </Button>
      </div>

      {availableTokenCount === 0 && (
        <Card>
          <p className="text-sm text-text-muted">
            Tokeny nejsou k dispozici v teto session. Pro odeslani emailu nebo
            kopirovani odkazu nejdrive regenerujte token jednotlivym clenum.
          </p>
        </Card>
      )}

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
            const hasToken = !!rawTokens[link.memberId];

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
                      {hasToken && (
                        <Badge variant="category">Token v session</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {link.memberEmail}
                    </p>
                    {link.morningEmailSentAt && (
                      <p className="text-xs text-text-muted mt-0.5">
                        Ranní email odesian:{" "}
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
                      onClick={() => handleCopy(link.memberId)}
                      disabled={busy || !hasToken}
                      title={
                        hasToken
                          ? "Kopirovat magic link URL"
                          : "Regenerujte token pro kopirovani"
                      }
                    >
                      Kopirovat
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSendEmail(link.memberId, link.memberName)}
                      loading={busy}
                      disabled={!link.hasLink || link.isRevoked || !hasToken}
                      title={
                        !link.hasLink
                          ? "Clen nema link"
                          : link.isRevoked
                          ? "Link je revokovan"
                          : !hasToken
                          ? "Regenerujte token pro odeslani emailu"
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
