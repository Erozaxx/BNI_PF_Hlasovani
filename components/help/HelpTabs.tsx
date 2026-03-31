"use client";

import { useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface HelpTabsProps {
  tabs: Tab[];
}

export function HelpTabs({ tabs }: HelpTabsProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div>
      {tabs.length > 1 && (
        <div className="flex space-x-1 border-b border-border mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors focus:outline-none focus:shadow-focus ${
                activeId === tab.id
                  ? "bg-surface border border-b-0 border-border text-primary"
                  : "text-text-muted hover:text-text-main hover:bg-background"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div>{activeTab?.content}</div>
    </div>
  );
}
