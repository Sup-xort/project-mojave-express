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

// 종료할 때 쓴다. SSE는 사장님 앱이 계속 붙들고 있는 연결이라 서버가 먼저 끊어주지 않으면
// 영원히 열려 있다. 사장님 앱의 EventSource는 연결이 끊기면 알아서 재연결한다.
function closeAll() {
  for (const res of clients) {
    res.end();
  }
  clients.clear();
}

module.exports = { addClient, removeClient, broadcast, closeAll };
