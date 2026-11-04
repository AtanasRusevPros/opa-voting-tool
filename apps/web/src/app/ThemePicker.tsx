// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, type CSSProperties } from "react";
import { DEFAULT_THEME_ID, THEMES, isThemeId, resolveTheme, type BrandingManifest, type ThemeId } from "@planning-poker/shared";

export function ThemePicker(props: {
  label: string;
  value: ThemeId | null;
  defaultThemeId?: ThemeId;
  allowInheritance?: boolean;
  palette?: BrandingManifest["palette"];
  disabled?: boolean;
  onChange: (id: ThemeId | null) => void;
}) {
  const defaultId = props.defaultThemeId ?? DEFAULT_THEME_ID;
  const preview = useMemo(() => resolveTheme(props.value ?? defaultId, props.palette), [props.value, defaultId, props.palette]);
  const groups = [...new Set(THEMES.map(theme => theme.group))];
  return (
    <div className="appearance-settings">
      <label>
        {props.label}
        <select aria-label={props.label} value={props.value ?? ""} disabled={props.disabled} onChange={event => props.onChange(isThemeId(event.target.value) ? event.target.value : null)}>
          {props.allowInheritance ? <option value="">Use platform default — {resolveTheme(defaultId).name}</option> : null}
          {groups.map(group => (
            <optgroup key={group} label={group === "light" ? "Light" : group === "dark" ? "Dark" : "Moderate / dim"}>
              {THEMES.filter(theme => theme.group === group).map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="theme-preview" role="group" aria-label={`${props.label} preview`} style={{ ...preview.tokens, colorScheme: preview.colorScheme } as CSSProperties}>
        <strong>Preview: {preview.name}</strong>
        <p>Readable text and coordinated controls.</p>
        <input aria-label={`${props.label} preview input`} value="Example input" readOnly tabIndex={-1} />
        <div className="theme-preview-controls" aria-hidden="true">
          <span className="secondary-button">Ordinary</span>
          <span className="primary-button">Primary</span>
          <span className="danger-button">Danger</span>
        </div>
        <div className="theme-preview-statuses" aria-hidden="true">
          <span className="success-banner">Success</span>
          <span className="warning-banner">Warning</span>
          <span className="error-banner">Error</span>
        </div>
      </div>
    </div>
  );
}
