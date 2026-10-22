"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
};

type TabsProps = {
  label: string;
  items: TabItem[];
  defaultValue?: string;
};

export function Tabs({ label, items, defaultValue }: TabsProps) {
  const baseId = useId();
  const initialTab = items.some((item) => item.id === defaultValue)
    ? defaultValue
    : items[0]?.id;
  const [activeTab, setActiveTab] = useState(initialTab ?? "");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = items.findIndex((item) => item.id === activeTab);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = items[nextIndex];
    if (!nextTab) return;

    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="ui-tabs">
      <div
        aria-label={label}
        className="ui-tabs__list"
        onKeyDown={moveFocus}
        role="tablist"
      >
        {items.map((item, index) => (
          <button
            aria-controls={`${baseId}-panel-${item.id}`}
            aria-selected={activeTab === item.id}
            className="ui-tabs__tab"
            id={`${baseId}-tab-${item.id}`}
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            tabIndex={activeTab === item.id ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          aria-labelledby={`${baseId}-tab-${item.id}`}
          className="ui-tabs__panel"
          hidden={activeTab !== item.id}
          id={`${baseId}-panel-${item.id}`}
          key={item.id}
          role="tabpanel"
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
