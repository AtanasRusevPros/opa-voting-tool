// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Retire a socket without aborting an in-flight browser handshake. */
export function closeSocket(socket: WebSocket): void {
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.onopen = () => {
      socket.onopen = null;
      socket.close();
    };
  } else {
    socket.onopen = null;
    if (socket.readyState === WebSocket.OPEN) socket.close();
  }
}
