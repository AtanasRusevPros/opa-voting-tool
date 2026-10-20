// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
export const MOBILE_HISTORY_GRIP = 44;
/** One board layout decision, exposed to CSS as classes, independent of device brand/DPR. */
export function boardViewport(width: number, height: number) {
  const mobile = width <= 640 || (width <= 959 && height <= 640);
  const landscape = mobile && width > height;
  return {mobile, landscape, stacked: width <= 959 && !landscape};
}
export function mobileHistorySize(size: number, extent: number) {
  return Math.max(MOBILE_HISTORY_GRIP, Math.min(Math.round(size), Math.floor(extent / 2)));
}
