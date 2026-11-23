"use client";

import { useRouter } from "next/navigation";
import { UI_TEXTS } from "@/lib/situations/rules";

/** Výběr člena pro vedení („Vyplnit za člena“): po výběru přejde na jeho situace. */
export function MemberPicker({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <div>
      <label htmlFor="situation-member-picker" className="mb-1 block text-sm font-medium text-text-main">
        {UI_TEXTS.fillForMember}
      </label>
      <select
        id="situation-member-picker"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) router.push(`/situace/${e.target.value}`);
        }}
        className="min-h-[44px] w-full max-w-sm rounded border border-border bg-white px-2 text-sm focus:outline-none focus:shadow-focus"
      >
        <option value="">{UI_TEXTS.fillForMemberPlaceholder}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
