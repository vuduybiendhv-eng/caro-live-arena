
(() => {
  "use strict";

  // CARO LIVE ARENA - VERSION 13
  // LIVE HOST CENTER + PRIORITY QUEUE

  const $ = id => document.getElementById(id);

  const SIZE = 15;
  const TOTAL = SIZE * SIZE;

  const HOST_UID = "NFiHocrXdxV19KJdEg8mf1kUFl42";

  let db = null;
  let auth = null;
  let uid = null;

  let roomRef = null;
  let roomCode = null;
  let roomListener = null;
  let currentRoom = null;
  let playerName = "Người chơi";
  let busy = false;
  let queueRef = null;
  let queueListener = null;

  const setupPanel = $("setupPanel");
  const gamePanel = $("gamePanel");
  const setupMessage = $("setupMessage");
  const gameMessage = $("gameMessage");
  const liveHostPanel = $("liveHostPanel");

  function message(el, text, error = false) {
    if (!el) return;
    el.textContent = text;
    el.style.color = error ? "#ff7777" : "";
  }

  function showSetup() {
    if (gamePanel) gamePanel.classList.add("hidden");
    if (setupPanel) setupPanel.classList.remove("hidden");
  }

  function showGame() {
    if (setupPanel) setupPanel.classList.add("hidden");
    if (gamePanel) gamePanel.classList.remove("hidden");
  }

  function getName() {
    const input = $("playerName");
    return input && input.value.trim()
      ? input.value.trim().slice(0, 18)
      : "Người chơi";
  }

  function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
  }

  function getRole(room) {
    if (!room || !uid) return null;
    if (room.hostUid === uid) return "X";
    if (room.guestUid === uid) return "O";
    return null;
  }

  function emptyBoard() {
    return Array(TOTAL).fill("");
  }

  function winningMark(board) {
    const directions = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1]
    ];

    for (let i = 0; i < TOTAL; i++) {
      const mark = board[i];
      if (!mark) continue;

      const row = Math.floor(i / SIZE);
      const col = i % SIZE;

      for (const [dr, dc] of directions) {
        let count = 1;

        for (let k = 1; k < 5; k++) {
          const r = row + dr * k;
          const c = col + dc * k;

          if (
            r < 0 || r >= SIZE ||
            c < 0 || c >= SIZE ||
            board[r * SIZE + c] !== mark
          ) break;

          count++;
        }

        if (count >= 5) return mark;
      }
    }

    return null;
  }

  function stopListening() {
    if (roomRef && roomListener) {
      roomRef.off("value", roomListener);
    }

    roomListener = null;
    roomRef = null;
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
      : emptyBoard();

    board.forEach((mark, index) => {
      const cell = document.createElement("button");

      cell.type = "button";
      cell.className = "cell" + (mark ? " " + mark.toLowerCase() : "");
      cell.textContent = mark || "";

      if (room.lastMove === index) {
        cell.classList.add("last");
      }

      cell.disabled =
        !role ||
        !!mark ||
        room.status !== "playing" ||
        room.turn !== role;

      cell.addEventListener("click", () => play(index));
      boardEl.appendChild(cell);
    });

    if (room.status === "waiting") {
      $("statusBar").textContent = "ĐANG CHỜ NGƯỜI CHƠI THỨ HAI";
      message(gameMessage, "Gửi mã phòng " + roomCode + " cho đối thủ.");
      return;
    }

    if (room.status === "finished") {
      $("statusBar").textContent = room.winner
        ? "QUÂN " + room.winner + " CHIẾN THẮNG!"
        : "VÁN ĐẤU HÒA";

      message(gameMessage, "Nhấn Chơi ván mới để tiếp tục.");
      return;
    }

    $("statusBar").textContent =
      room.turn === role
        ? "ĐẾN LƯỢT CỦA ANH"
        : "ĐANG ĐỢI QUÂN " + room.turn + " ĐÁNH";

    message(
      gameMessage,
      role
        ? "Anh đang chơi quân " + role + "."
        : "Tài khoản này không thuộc phòng đấu.",
      !role
    );
  }

  async function connectRoom(code) {
    stopListening();

    roomCode = code;
    roomRef = db.ref("games/" + code);

    roomListener = snapshot => {
      if (!snapshot.exists()) {
        message(gameMessage, "Phòng không còn tồn tại.", true);
        return;
      }

      const room = snapshot.val();

      if (room.hostUid !== uid && room.guestUid !== uid) {
        message(gameMessage, "Tài khoản không thuộc phòng này.", true);
        return;
      }

      render(room);
    };

    roomRef.on("value", roomListener, error => {
      message(gameMessage, "Lỗi đọc phòng: " + error.message, true);
    });

    showGame();
  }

  async function createRoom() {
    if (busy) return;

    if (!uid || !db) {
      message(setupMessage, "Firebase chưa kết nối.", true);
      return;
    }

    busy = true;
    playerName = getName();
    message(setupMessage, "Đang tạo phòng...");

    try {
      let code = null;
      let ref = null;

      for (let i = 0; i < 10; i++) {
        const candidate = makeCode();
        const candidateRef = db.ref("games/" + candidate);
        const snapshot = await candidateRef.once("value");

        if (!snapshot.exists()) {
          code = candidate;
          ref = candidateRef;
          break;
        }
      }

      if (!ref) {
        throw new Error("Không tạo được mã phòng. Hãy thử lại.");
      }

      await ref.set({
        hostUid: uid,
        hostName: playerName,
        board: emptyBoard(),
        turn: "X",
        status: "waiting",
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });

      await connectRoom(code);
      message(gameMessage, "Đã tạo phòng " + code + ". Gửi mã cho đối thủ.");

    } catch (error) {
      message(setupMessage, "Lỗi tạo phòng: " + error.message, true);
    } finally {
      busy = false;
    }
  }

  async function joinRoom() {
    if (busy) return;

    if (!uid || !db) {
      message(setupMessage, "Firebase chưa kết nối.", true);
      return;
    }

    playerName = getName();

    const input = $("roomInput");
    const code = input.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      message(setupMessage, "Mã phòng phải gồm đúng 6 ký tự.", true);
      return;
    }

    busy = true;
    message(setupMessage, "Đang tìm phòng " + code + "...");

    try {
      const ref = db.ref("games/" + code);
      const snapshot = await ref.once("value");

      if (!snapshot.exists()) {
        throw new Error("Không tìm thấy phòng " + code + ".");
      }

      const room = snapshot.val();

      if (room.hostUid === uid) {
        throw new Error("Máy này đang dùng cùng tài khoản với chủ phòng.");
      }

      if (room.status !== "waiting") {
        throw new Error("Phòng không còn ở trạng thái chờ.");
      }

      if (room.guestUid) {
        throw new Error("Phòng đã có người chơi thứ hai.");
      }

      await ref.update({
        guestUid: uid,
        guestName: playerName,
        status: "playing"
      });

      const verifySnapshot = await ref.once("value");

      if (!verifySnapshot.exists() || verifySnapshot.val().guestUid !== uid) {
        throw new Error("Máy chủ chưa xác nhận tham gia.");
      }

      await connectRoom(code);
      message(gameMessage, "Tham gia phòng thành công. Anh chơi quân O.");

    } catch (error) {
      message(setupMessage, "Lỗi tham gia: " + error.message, true);
    } finally {
      busy = false;
    }
  }

  async function play(index) {
    if (!roomRef || !currentRoom) return;

    const role = getRole(currentRoom);
    if (!role || currentRoom.status !== "playing") return;

    try {
      const result = await roomRef.transaction(room => {
        if (!room || room.status !== "playing") return;
        if (room.turn !== role) return;

        const board = Array.isArray(room.board)
          ? room.board.slice()
          : emptyBoard();

        if (board[index]) return;

        board[index] = role;
        const winner = winningMark(board);

        room.board = board;
        room.lastMove = index;
        room.winner = winner || null;
        room.status =
          winner || board.every(Boolean) ? "finished" : "playing";
        room.turn = role === "X" ? "O" : "X";

        return room;
      });

      if (!result.committed) {
        message(gameMessage, "Nước đi không được chấp nhận.", true);
      }

    } catch (error) {
      message(gameMessage, "Lỗi đánh: " + error.message, true);
    }
  }

  async function restart() {
    if (!roomRef || !currentRoom) return;

    if (currentRoom.hostUid !== uid) {
      message(gameMessage, "Chỉ chủ phòng mới được bắt đầu ván mới.", true);
      return;
    }

    if (!currentRoom.guestUid) {
      message(gameMessage, "Đang chờ người chơi thứ hai.", true);
      return;
    }

    try {
      await roomRef.update({
        board: emptyBoard(),
        turn: "X",
        status: "playing",
        winner: null,
        lastMove: null
      });

      message(gameMessage, "Đã bắt đầu ván mới.");

    } catch (error) {
      message(gameMessage, "Lỗi bắt đầu ván: " + error.message, true);
    }
  }

  function leaveRoom() {
    stopListening();
    roomCode = null;
    currentRoom = null;
    showSetup();
    message(setupMessage, "Đã rời khỏi phòng.");
  }

  // -------------------------------
  // LIVE HOST CENTER
  // -------------------------------

  function isHost() {
    return uid === HOST_UID;
  }

  function stopQueueListening() {
    if (queueRef && queueListener) {
      queueRef.off("value", queueListener);
    }

    queueListener = null;
    queueRef = null;
  }

  function showHostPanel() {
    if (!liveHostPanel) return;

    if (!isHost()) {
      liveHostPanel.classList.add("hidden");
      return;
    }

    liveHostPanel.classList.remove("hidden");
    startQueueListening();
  }

  function startQueueListening() {
    if (!isHost() || !db || queueListener) return;

    queueRef = db.ref("liveQueue");

    queueListener = snapshot => {
      const data = snapshot.val() || {};
      renderQueue(data);
    };

    queueRef.on("value", queueListener, error => {
      message($("liveHostMessage"), "Lỗi hàng chờ: " + error.message, true);
    });
  }

  function renderQueue(data) {
    const list = $("liveQueueList");
    const count = $("queueCount");

    if (!list || !count) return;

    const entries = Object.entries(data)
      .map(([key, value]) => ({ key, ...value }))
      .filter(item => item && item.name && Number(item.giftValue) > 0)
      .sort((a, b) =>
        Number(b.giftValue) - Number(a.giftValue) ||
        Number(a.receivedAt) - Number(b.receivedAt)
      );

    count.textContent = entries.length + " người";
    list.innerHTML = "";

    if (!entries.length) {
      list.innerHTML = '<p class="hint">Chưa có người đăng ký.</p>';
      return;
    }

    entries.forEach((item, index) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:9px;padding:11px;margin-bottom:8px;border:1px solid #30425a;border-radius:12px;background:#0c1625";

      const rank = document.createElement("strong");
      rank.textContent = "#" + (index + 1);
      rank.style.color = "#45d6d0";

      const info = document.createElement("div");
      info.style.flex = "1";
      info.style.minWidth = "0";

      const name = document.createElement("strong");
      name.textContent = item.name;
      name.style.display = "block";

      const detail = document.createElement("small");
      detail.textContent = "Quà " + item.giftValue + " xu";
      info.append(name, detail);

      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.className = "secondary";
      remove.style.padding = "7px 11px";
      remove.addEventListener("click", () => removeQueueItem(item.key));

      row.append(rank, info, remove);
      list.appendChild(row);
    });
  }

  async function addQueueItem() {
    if (!isHost()) return;

    const nameInput = $("queuePlayerName");
    const valueInput = $("queueGiftValue");

    const name = nameInput.value.trim().slice(0, 30);
    const giftValue = Number(valueInput.value);

    if (!name) {
      message($("liveHostMessage"), "Hãy nhập tên TikTok.", true);
      return;
    }

    if (!Number.isSafeInteger(giftValue) || giftValue < 1 || giftValue > 1000000) {
      message($("liveHostMessage"), "Giá trị quà không hợp lệ.", true);
      return;
    }

    try {
      const ref = db.ref("liveQueue").push();

      await ref.set({
        name,
        giftValue,
        receivedAt: firebase.database.ServerValue.TIMESTAMP,
        status: "waiting"
      });

      nameInput.value = "";
      valueInput.value = "";

      message($("liveHostMessage"), "Đã thêm " + name + " vào hàng chờ.");

    } catch (error) {
      message($("liveHostMessage"), "Không thể thêm: " + error.message, true);
    }
  }

  async function removeQueueItem(key) {
    if (!isHost()) return;

    try {
      await db.ref("liveQueue/" + key).remove();
      message($("liveHostMessage"), "Đã xóa người chơi khỏi hàng chờ.");
    } catch (error) {
      message($("liveHostMessage"), "Lỗi xóa: " + error.message, true);
    }
  }

  async function queueSkip() {
    if (!isHost()) return;

    const snapshot = await db.ref("liveQueue").once("value");
    const data = snapshot.val() || {};

    const entries = Object.entries(data)
      .map(([key, value]) => ({ key, ...value }))
      .filter(item => item && item.name && Number(item.giftValue) > 0)
      .sort((a, b) =>
        Number(b.giftValue) - Number(a.giftValue) ||
        Number(a.receivedAt) - Number(b.receivedAt)
      );

    if (!entries.length) {
      message($("liveHostMessage"), "Hàng chờ đang trống.");
      return;
    }

    await removeQueueItem(entries[0].key);
  }

  async function queueNext() {
    if (!isHost()) return;

    const snapshot = await db.ref("liveQueue").once("value");
    const data = snapshot.val() || {};

    const entries = Object.entries(data)
      .map(([key, value]) => ({ key, ...value }))
      .filter(item => item && item.name && Number(item.giftValue) > 0)
      .sort((a, b) =>
        Number(b.giftValue) - Number(a.giftValue) ||
        Number(a.receivedAt) - Number(b.receivedAt)
      );

    if (!entries.length) {
      message($("liveHostMessage"), "Chưa có người chơi trong hàng chờ.");
      return;
    }

    const selected = entries[0];

    message(
      $("liveHostMessage"),
      "Đã chọn " + selected.name + " · Quà " +
      selected.giftValue + " xu. Hãy tạo phòng và gửi mã cho người chơi."
    );

    await removeQueueItem(selected.key);
  }

  function bindHostControls() {
    if (!isHost()) return;

    $("queueAddBtn")?.addEventListener("click", addQueueItem);
    $("queueSkipBtn")?.addEventListener("click", queueSkip);
    $("queueNextBtn")?.addEventListener("click", queueNext);
  }

  // -------------------------------
  // FIREBASE INITIALIZATION
  // -------------------------------

  async function init() {
    try {
      const config = window.firebaseConfig;

      if (!config || !config.apiKey || !config.appId) {
        throw new Error("Thiếu Firebase apiKey hoặc appId.");
      }

      if (typeof firebase === "undefined") {
        throw new Error("Chưa tải Firebase SDK.");
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      auth = firebase.auth();
      db = firebase.database();

      await auth.signInAnonymously();

      const user = auth.currentUser;

      if (!user) {
        throw new Error("Không lấy được tài khoản Firebase.");
      }

      uid = user.uid;

      $("createBtn").disabled = false;
      $("joinBtn").disabled = false;

      message(setupMessage, "Đã kết nối Firebase. Tạo phòng để bắt đầu.");

      if (isHost()) {
        showHostPanel();
        bindHostControls();
        message($("liveHostMessage"), "Đã xác thực HOST.");
      } else if (liveHostPanel) {
        liveHostPanel.classList.add("hidden");
      }

    } catch (error) {
      message(setupMessage, "Lỗi kết nối Firebase: " + error.message, true);
    }
  }

  const requiredIds = [
    "setupPanel",
    "gamePanel",
    "setupMessage",
    "gameMessage",
    "playerName",
    "roomInput",
    "createBtn",
    "joinBtn",
    "copyBtn",
    "restartBtn",
    "backBtn",
    "roomCode",
    "xName",
    "oName",
    "xCard",
    "oCard",
    "board",
    "statusBar"
  ];

  const missing = requiredIds.filter(id => !$(id));

  if (missing.length) {
    console.error("CARO: Thiếu thành phần HTML:", missing);
    message(setupMessage, "Lỗi giao diện: thiếu ID " + missing.join(", "), true);
    return;
  }

  $("createBtn").addEventListener("click", createRoom);
  $("joinBtn").addEventListener("click", joinRoom);
  $("restartBtn").addEventListener("click", restart);
  $("backBtn").addEventListener("click", leaveRoom);

  $("copyBtn").addEventListener("click", async () => {
    if (!roomCode) return;

    try {
      await navigator.clipboard.writeText(roomCode);
      message(gameMessage, "Đã sao chép mã phòng " + roomCode);
    } catch {
      message(gameMessage, "Mã phòng: " + roomCode);
    }
  });

  $("roomInput").addEventListener("input", event => {
    event.target.value = event.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  });

  init();

})();
      
