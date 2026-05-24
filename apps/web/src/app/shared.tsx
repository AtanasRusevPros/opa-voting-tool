// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BrandingManifest } from "@planning-poker/shared";
import type { PopupPosition } from "./types";
import { getHistoryTooltipRows } from "./utils";

export function BrandFooter(props: {
  branding: BrandingManifest;
}) {
  const creator = props.branding.footerCreatorText.trim();
  const company = props.branding.footerCompanyText.trim();
  if (!creator && !company) {
    return null;
  }

  return (
    <div className="brand-footer">
      {creator ? <span>{creator}</span> : null}
      {creator && company ? <span className="brand-footer-separator">•</span> : null}
      {company ? <span>{company}</span> : null}
    </div>
  );
}

export function HistoryTimestamp(props: { heading: string; tooltipRows: Array<{ label: string; value: string }>; enabled?: boolean }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({ top: 0, left: 0, align: "left" });
  const canShowTooltip = props.enabled !== false && props.tooltipRows.length > 0;

  function updatePopupPosition() {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const popupWidth = 360;
    const gap = 10;
    const wouldOverflowRight = rect.left + popupWidth > window.innerWidth - 16;
    const align = wouldOverflowRight ? "right" : "left";
    const left = align === "right" ? Math.max(16, rect.right - popupWidth) : Math.max(16, rect.left);

    setPopupPosition({
      top: rect.bottom + gap,
      left,
      align
    });
  }

  useEffect(() => {
    if (!canShowTooltip) {
      setIsOpen(false);
    }
  }, [canShowTooltip]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePopupPosition();
    const handleViewportChange = () => updatePopupPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen]);

  const showTooltip = () => {
    if (!canShowTooltip) {
      return;
    }
    updatePopupPosition();
    setIsOpen(true);
  };

  if (!canShowTooltip) {
    return (
      <div className="history-timestamp">
        <div className="history-group-heading history-group-heading-static">
          <span>{props.heading}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="history-timestamp">
      <button
        ref={triggerRef}
        className="history-group-heading"
        type="button"
        onMouseEnter={showTooltip}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={showTooltip}
        onBlur={() => setIsOpen(false)}
      >
        <span>{props.heading}</span>
      </button>
      {isOpen && canShowTooltip && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`history-tooltip is-open align-${popupPosition.align}`}
              role="tooltip"
              style={{ top: `${popupPosition.top}px`, left: `${popupPosition.left}px` }}
            >
              {props.tooltipRows.map((row) => (
                <div key={`${props.heading}-${row.label}`} className="history-tooltip-row">
                  <span className="history-tooltip-label">{row.label}</span>
                  <span className="history-tooltip-value">{row.value}</span>
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export { getHistoryTooltipRows };
