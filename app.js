(() => {
  const $ = (id) => document.getElementById(id);
  const setupPanel = $("setupPanel"), gamePanel = $("gamePanel");
  const setupMessage = $("setupMessage"), gameMessage = $("gameMessage");
  const SIZE = 15, TOTAL = SIZE * SIZE;
  let auth, db, uid = null, roomRef = null, roomCode = null, unsubscribe = null;
  let currentRoom = null, playerName = "Người chơi";

  function message(el, text, error = false) {
    el.textContent = text;
    el.style.color = error ? "#ff9b9b" : "";
  }
  function makeCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  function showGame() {
    setupPanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
  }
  function showSetup() {
    gamePanel.classList.add("hidden");
    setupPanel.classList.remove("hidden");
  }
  function getName() {
    return $("playerName").value.trim().slice(0, 18) || "Người chơi";
  }
  function getRole(room) {
    if (room.hostUid === uid) return "X";
    if (room.guestUid === uid) return "O";
    return null;
  }
  function winningMark(board) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let i = 0; i < TOTAL; i++) {
      const mark = board[i];
      if (!mark) continue;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      for (const [dr,dc] of dirs) {
        let count = 1;
        for (let k = 1; k < 5; k++) {
          const nr = r + dr*k, nc = c + dc*k;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr*SIZE+nc] !== mark) break;
          count++;
        }
        if (count >= 5) return mark;
      }
    }
    return null;
  }
  function render(room) {
    currentRoom = room;
    const role = getRole(room);
    $("roomCode").textContent = roomCode || "------";
    $("xName").textContent = room.hostName || "Chủ phòng";
    $("oName").textContent = room.guestName || "Đang chờ đối thủ";
    $("xCard").classList.toggle("active", room.turn === "X" && room.status === "playing");
    $("oCard").classList.toggle("active", room.turn === "O" && room.status === "playing");

    const boardEl = $("board");
    boardEl.innerHTML = "";
    const board = Array.isArray(room.board) ? room.board : Array(TOTAL).fill("");
    board.forEach((mark, index) => {
      const cell = document.createElement("button");
      cell.className = "cell" + (mark ? " " + mark.toLowerCase() : "");
      if (room.lastMove === index) cell.classList.add("last");
      cell.textContent = mark || "";
      cell.type = "button";
      cell.setAttribute("aria-label", `Ô ${index+1}: ${mark || "trống"}`);
      cell.disabled = !role || !!mark || room.status !== "playing" || room.turn !== role;
      cell.addEventListener("click", () => play(index));
      boardEl.appendChild(cell);
    });

    if (room.status === "waiting") {
      $("statusBar").textContent = "ĐANG CHỜ NGƯỜI CHƠI THỨ HAI";
      message(gameMessage, "Gửi mã phòng " + roomCode + " cho bạn bè để họ tham gia.");
    } else if (room.status === "finished") {
      $("statusBar").textContent = room.winner ? `QUÂN ${room.winner} CHIẾN THẮNG!` : "VÁN ĐẤU HÒA";
      message(gameMessage, "Nhấn Chơi ván mới để bắt đầu lại.");
    } else {
      $("statusBar").textContent = room.turn === role ? "ĐẾN LƯỢT CỦA ANH" : `ĐANG ĐỢI QUÂN ${room.turn} ĐÁNH`;
      message(gameMessage, role ? `Anh đang chơi quân ${role}.` : "Anh không thuộc phòng đấu này.", !role);
    }
  }
  async function connectRoom(code) {
    roomCode = code;
    roomRef = db.ref("games/" + code);
    if (unsubscribe) { roomRef.off("value", unsubscribe); unsubscribe = null; }
    unsubscribe = (snap) => {
      if (!snap.exists()) {
        message(gameMessage, "Phòng không còn tồn tại.", true);
        return;
      }
      const room = snap.val();
      if (room.hostUid !== uid && room.guestUid !== uid) {
        message(gameMessage, "Tài khoản này không thuộc phòng đấu.", true);
        return;
      }
      render(room);
    };
    roomRef.on("value", unsubscribe, (err) => message(gameMessage, err.message, true));
    showGame();
  }
  async function createRoom() {
    playerName = getName();
    message(setupMessage, "Đang tạo phòng...");
    try {
      let code, ref, exists = true;
      for (let tries = 0; tries < 8 && exists; tries++) {
        code = makeCode();
        ref = db.ref("games/" + code);
        const snap = await ref.once("value");
        exists = snap.exists();
      }
      if (exists) throw new Error("Không tạo được mã phòng. Thử lại.");
      const board = Array(TOTAL).fill("");
      await ref.set({
        hostUid: uid, hostName: playerName, guestUid: null, guestName: null,
        board, turn: "X", status: "waiting", winner: null, lastMove: null,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      await connectRoom(code);
    } catch (e) { message(setupMessage, e.message, true); }
  }
  async function joinRoom() {
    playerName = getName();
    const code = $("roomInput").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      message(setupMessage, "Mã phòng phải gồm đúng 6 ký tự.", true); return;
    }
    message(setupMessage, "Đang tham gia phòng...");
    const ref = db.ref("games/" + code);
    try {
      const result = await ref.transaction(room => {
        if (!room || room.status !== "waiting" || room.hostUid === uid || room.guestUid) return;
        room.guestUid = uid;
        room.guestName = playerName;
        room.status = "playing";
        return room;
      });
      if (!result.committed) throw new Error("Phòng không tồn tại, đã đủ người hoặc đã bắt đầu.");
      await connectRoom(code);
    } catch (e) { message(setupMessage, e.message, true); }
  }
  async function play(index) {
    if (!roomRef || !currentRoom) return;
    const role = getRole(currentRoom);
    try {
      await roomRef.transaction(room => {
        if (!room || room.status !== "playing" || room.turn !== role || room.board[index]) return;
        const board = Array.isArray(room.board) ? room.board.slice() : Array(TOTAL).fill("");
        board[index] = role;
        const winner = winningMark(board);
        room.board = board;
        room.lastMove = index;
        room.winner = winner || null;
        room.status = winner ? "finished" : (board.every(Boolean) ? "finished" : "playing");
        room.turn = role === "X" ? "O" : "X";
        return room;
      });
    } catch (e) { message(gameMessage, "Không thể đánh: " + e.message, true); }
  }
  async function restart() {
    if (!roomRef || !currentRoom || currentRoom.hostUid !== uid) {
      message(gameMessage, "Chỉ chủ phòng mới có thể bắt đầu ván mới.", true); return;
    }
    await roomRef.transaction(room => {
      if (!room || room.hostUid !== uid || !room.guestUid) return;
      room.board = Array(TOTAL).fill("");
      room.turn = "X"; room.status = "playing"; room.winner = null; room.lastMove = null;
      return room;
    });
  }
  function leaveRoom() {
    if (roomRef && unsubscribe) roomRef.off("value", unsubscribe);
    roomRef = null; unsubscribe = null; roomCode = null; currentRoom = null;
    showSetup();
    message(setupMessage, "Anh đã rời màn hình phòng. Dữ liệu phòng vẫn còn trên máy chủ.");
  }
  async function init() {
    try {
      if (!window.firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PASTE_")) {
        throw new Error("Chưa điền Firebase apiKey và appId trong firebase-config.js.");
      }
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth(); db = firebase.database();
      const credential = await auth.signInAnonymously();
      uid = credential.user.uid;
      $("createBtn").disabled = false;
      message(setupMessage, "Đã kết nối Firebase. Tạo phòng để bắt đầu.");
    } catch (e) {
      message(setupMessage, "Lỗi kết nối: " + e.message, true);
    }
  }
  $("createBtn").addEventListener("click", () => { if (uid) createRoom(); });
  $("joinBtn").addEventListener("click", () => { if (uid) joinRoom(); });
  $("copyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(roomCode); message(gameMessage, "Đã sao chép mã phòng " + roomCode); }
    catch { message(gameMessage, "Mã phòng của anh là " + roomCode); }
  });
  $("restartBtn").addEventListener("click", restart);
  $("backBtn").addEventListener("click", leaveRoom);
  $("roomInput").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));
  init();
})();