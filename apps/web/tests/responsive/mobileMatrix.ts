// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
export const phonePortraits = [[320,568],[360,800],[375,667],[375,812],[384,832],[390,844],[393,852],[412,915],[414,896],[430,932]];
export const phoneViewports = phonePortraits.flatMap(([width,height])=>[[width,height],[height,width]]);
