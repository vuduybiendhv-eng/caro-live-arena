
(() => {
  const $ = (id) => document.getElementById(id);
  const SIZE = 15;
  const TOTAL = SIZE * SIZE;

  let db, uid = null;
  let roomRef = null;
  let roomCode = null;
  let unsubscribe = null;
  let currentRoom = null;
  let playerName = "Người chơi";

  const setupPanel = $("setupPanel");
  const gamePanel = $("gamePanel");
  const setupMessage = $("setupMessage");
  const gameMessage = $("gameMessage");

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
    const dirs = [[1,0], [0,1], [1,1], [1,-1]];

    for (let i = 0; i < TOTAL; i++) {
      const mark = board[i];
      if (!mark) continue;

      const r = Math.floor(i / SIZE);
      const c = i % SIZE;

      for (const [dr, dc] of dirs) {
        let count = 1;

        for (let k = 1; k < 5; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;

          if (
            nr < 0 || nr >= SIZE ||
            nc < 0 || nc >= SIZE ||
            board[nr * SIZE + nc] !== mark
          ) break;

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

    $("xCard").classList.toggle(
      "active",
      room.turn === "X" && room.status === "playing"
    );

    $("oCard").classList.toggle(
      "active",
      room.turn === "O" && room.status === "playing"
    );

    const boardEl = $("board");
    boardEl.innerHTML = "";

    const board = Array.isArray(room.board)
      ? room.board
      : Array(TOTAL).fill("");

    board.forEach((mark, index) => {
      const cell = document.createElement("button");
      cell.className = "cell" + (mark ? " " + mark.toLowerCase() : "");
      cell.textContent = mark || "";
      cell.type = "button";

      if (room.lastMove === index) cell.classList.add("last");

      cell.disabled =
        !role || !!mark ||
        room.status !== "playing" ||
        room.turn !== role;

      cell.addEventListener("click", () => play(index));
      boardEl.appendChild(cell);
    });

    if (room.status === "waiting") {
      $("statusBar").textContent = "ĐANG CHỜ NGƯỜI CHƠI THỨ HAI";
      message(gameMessage, "Gửi mã phòng " + roomCode + " cho bạn bè.");
    } else if (room.status === "finished") {
      $("statusBar").textContent = room.winner
        ? `QUÂN ${room.winner} CHIẾN THẮNG!`
        : "VÁN ĐẤU HÒA";
      message(gameMessage, "Nhấn Chơi ván mới để bắt đầu lại.");
    } else {
      $("statusBar").textContent = room.turn === role
        ? "ĐẾN LƯỢT CỦA ANH"
        : `ĐANG ĐỢI QUÂN ${room.turn} ĐÁNH`;

      message(
        gameMessage,
        role ? `Anh đang chơi quân ${role}.` : "Anh không thuộc phòng đấu này.",
        !role
      );
    }
  }

  async function connectRoom(code) {
    if (roomRef && unsubscribe) {
      roomRef.off("value", unsubscribe);
    }

    roomCode = code;
    roomRef = db.ref("games/" + code);

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

    roomRef.on("value", unsubscribe, (err) => {
      message(gameMessage, err.message, true);
    });

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

      await ref.set({
        hostUid: uid,
        hostName: playerName,
        guestUid: null,
        guestName: null,
        board: Array(TOTAL).fill(""),
        turn: "X",
        status: "waiting",
        winner: null,
        lastMove: null,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });

      await connectRoom(code);
    } catch (e) {
      message(setupMessage, "Lỗi tạo phòng: " + e.message, true);
    }
  }

  async function joinRoom() {
    playerName = getName();
    const code = $("roomInput").value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      message(setupMessage, "Mã phòng phải gồm đúng 6 ký tự.", true);
      return;
    }

    message(setupMessage, "Đang kiểm tra phòng...");
    const ref = db.ref("games/" + code);

    try {
      const snap = await ref.once("value");

      if (!snap.exists()) throw new Error("Không tìm thấy phòng " + code);

      const room = snap.val();

      if (room.hostUid === uid) {
        throw new Error("Hai máy đang dùng cùng tài khoản Firebase.");
      }

      if (room.status !== "waiting") {
        throw new Error("Trạng thái phòng: " + room.status);
      }

      if (room.guestUid) throw new Error("Phòng đã có người chơi thứ hai.");

      message(setupMessage, "Đang tham gia phòng...");

      let reason = "Phòng đã thay đổi hoặc có người tham gia trước.";

      const result = await ref.transaction(current => {
        if (!current) {
          reason = "Dữ liệu phòng không tồn tại.";
          return;
        }

        if (current.status !== "waiting") {
          reason = "Trạng thái phòng: " + current.status;
          return;
        }

        if (current.guestUid) {
          reason = "Phòng đã có người chơi thứ hai.";
          return;
        }

        if (current.hostUid === uid) {
          reason = "Hai máy đang dùng cùng UID.";
          return;
        }

        current.guestUid = uid;
        current.guestName = playerName;
        current.status = "playing";
        return current;
      });

      if (!result.committed) throw new Error(reason);

      await connectRoom(code);
    } catch (e) {
      message(setupMessage, "Lỗi tham gia: " + e.message, true);
    }
  }

  async function play(index) {
    if (!roomRef || !currentRoom) return;

    const role = getRole(currentRoom);

    try {
      await roomRef.transaction(room => {
        if (
          !room ||
          room.status !== "playing" ||
          room.turn !== role ||
          room.board[index]
        ) return;

        const board = Array.isArray(room.board)
          ? room.board.slice()
          : Array(TOTAL).fill("");

        board[index] = role;
        const winner = winningMark(board);

        room.board = board;
        room.lastMove = index;
        room.winner = winner || null;
        room.status = winner || board.every(Boolean) ? "finished" : "playing";
        room.turn = role === "X" ? "O" : "X";

        return room;
      });
    } catch (e) {
      message(gameMessage, "Không thể đánh: " + e.message, true);
    }
  }

  async function restart() {
    if (!roomRef || !currentRoom || currentRoom.hostUid !== uid) {
      message(gameMessage, "Chỉ chủ phòng mới có thể bắt đầu ván mới.", true);
      return;
    }

    try {
      await roomRef.transaction(room => {
        if (!room || room.hostUid !== uid || !room.guestUid) return;

        room.board = Array(TOTAL).fill("");
        room.turn = "X";
        room.status = "playing";
        room.winner = null;
        room.lastMove = null;
        return room;
      });
    } catch (e) {
      message(gameMessage, "Không thể bắt đầu ván mới: " + e.message, true);
    }
  }

  function leaveRoom() {
    if (roomRef && unsubscribe) roomRef.off("value", unsubscribe);

    roomRef = null;
    unsubscribe = null;
    roomCode = null;
    currentRoom = null;

    showSetup();
    message(setupMessage, "Anh đã rời màn hình phòng. Dữ liệu phòng vẫn còn trên máy chủ.");
  }

  async function init() {
    try {
      const config = window.firebaseConfig;

      if (!config || !config.apiKey || !config.appId) {
        throw new Error("Thiếu Firebase apiKey hoặc appId.");
      }

      firebase.initializeApp(config);
      const auth = firebase.auth();
      db = firebase.database();

      const credential = await auth.signInAnonymously();
      uid = credential.user.uid;

      $("createBtn").disabled = false;
      message(setupMessage, "Đã kết nối Firebase. Tạo phòng để bắt đầu.");
    } catch (e) {
      message(setupMessage, "Lỗi kết nối: " + e.message, true);
    }
  }

  $("createBtn").addEventListener("click", () => {
    if (uid) createRoom();
    else message(setupMessage, "Đang kết nối Firebase, vui lòng chờ.", true);
  });

  $("joinBtn").addEventListener("click", () => {
    if (uid) joinRoom();
    else message(setupMessage, "Đang kết nối Firebase, vui lòng chờ.", true);
  });

  $("copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      message(gameMessage, "Đã sao chép mã phòng " + roomCode);
    } catch {
      message(gameMessage, "Mã phòng của anh là " + roomCode);
    }
  });

  $("restartBtn").addEventListener("click", restart);
  $("backBtn").addEventListener("click", leaveRoom);

  $("roomInput").addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  });

  init();
})();
