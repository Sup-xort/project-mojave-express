// 오너 앱에 실시간 알림을 보내기 위한 SSE(Server-Sent Events) 브로드캐스터.
// 매장 태블릿 한두 대 규모라 별도 메시지 브로커 없이 인메모리로 충분하다.
const clients = new Set(); // Set<express.Response>

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

module.exports = { addClient, removeClient, broadcast };
