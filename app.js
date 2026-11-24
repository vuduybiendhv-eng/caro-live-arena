(() => {
  "use strict";

  // CARO LIVE ARENA - VERSION 15
  // CARO GAME + LIVE HOST + PRIORITY QUEUE + AUTO ROOM

  const $ = id => document.getElementById(id);

  const SIZE = 15;
  const TOTAL = SIZE * SIZE;

  // UID DUY NHẤT ĐƯỢC QUẢN LÝ LIVE HOST
  const HOST_UID = "F8pIRePt0cYnHSHWD4C4ZUzYgHe2";

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

  // =================================
  // ROOM LISTENER
  // =================================

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
      cell.className =
        "cell" + (mark ? " " + mark.toLowerCase() : "");

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
      $("statusBar").textContent =
        "ĐANG CHỜ NGƯỜI CHƠI THỨ HAI";

      message(
        gameMessage,
        "Gửi mã phòng " + roomCode + " cho đối thủ."
      );

      return;
    }

    if (room.status === "finished") {
      $("statusBar").textContent = room.winner
        ? "QUÂN " + room.winner + " CHIẾN THẮNG!"
        : "VÁN ĐẤU HÒA";

      message(
        gameMessage,
        "Nhấn Chơi ván mới để tiếp tục."
      );

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
        message(
          gameMessage,
          "Phòng không còn tồn tại.",
          true
        );
        return;
      }

      const room = snapshot.val();

      if (
        room.hostUid !== uid &&
        room.guestUid !== uid
      ) {
        message(
          gameMessage,
          "Tài khoản không thuộc phòng này.",
          true
        );
        return;
      }

      render(room);
    };

    roomRef.on("value", roomListener, error => {
      message(
        gameMessage,
        "Lỗi đọc phòng: " + error.message,
        true
      );
    });

    showGame();
  }

  // =================================
  // CREATE ROOM
  // =================================

  async function createRoom() {
    if (busy) return;

    if (!uid || !db) {
      message(
        setupMessage,
        "Firebase chưa kết nối.",
        true
      );
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
        throw new Error(
          "Không tạo được mã phòng. Hãy thử lại."
        );
      }

      await ref.set({
        hostUid: uid,
        hostName: playerName,
        board: emptyBoard(),
        turn: "X",
        status: "waiting",
        winner: null,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });

      await connectRoom(code);

      message(
        gameMessage,
        "Đã tạo phòng " + code + ". Gửi mã cho đối thủ."
      );

    } catch (error) {
      message(
        setupMessage,
        "Lỗi tạo phòng: " + error.message,
        true
      );
    } finally {
      busy = false;
    }
  }

  // =================================
  // JOIN ROOM
  // =================================

  async function joinRoom() {
    if (busy) return;

    if (!uid || !db) {
      message(
        setupMessage,
        "Firebase chưa kết nối.",
        true
      );
      return;
    }

    playerName = getName();

    const input = $("roomInput");
    const code = input.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      message(
        setupMessage,
        "Mã phòng phải gồm đúng 6 ký tự.",
        true
      );
      return;
    }

    busy = true;

    message(
      setupMessage,
      "Đang tìm phòng " + code + "..."
    );

    try {
      const ref = db.ref("games/" + code);
      const snapshot = await ref.once("value");

      if (!snapshot.exists()) {
        throw new Error(
          "Không tìm thấy phòng " + code + "."
        );
      }

      const room = snapshot.val();

      if (room.hostUid === uid) {
        throw new Error(
          "Máy này đang dùng cùng tài khoản với chủ phòng."
        );
      }

      if (room.status !== "waiting") {
        throw new Error(
          "Phòng không còn ở trạng thái chờ."
        );
      }

      if (room.guestUid) {
        throw new Error(
          "Phòng đã có người chơi thứ hai."
        );
      }

      await ref.update({
        guestUid: uid,
        guestName: playerName,
        status: "playing"
      });

      const verifySnapshot = await ref.once("value");

      if (
        !verifySnapshot.exists() ||
        verifySnapshot.val().guestUid !== uid
      ) {
        throw new Error(
          "Máy chủ chưa xác nhận tham gia."
        );
      }

      await connectRoom(code);

      message(
        gameMessage,
        "Tham gia phòng thành công. Anh chơi quân O."
      );

    } catch (error) {
      message(
        setupMessage,
        "Lỗi tham gia: " + error.message,
        true
      );
    } finally {
      busy = false;
    }
  }

  // =================================
  // PLAY
  // =================================

  async function play(index) {
    if (!roomRef || !currentRoom) return;

    const role = getRole(currentRoom);

    if (
      !role ||
      currentRoom.status !== "playing"
    ) return;

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
          winner || board.every(Boolean)
            ? "finished"
            : "playing";

        room.turn = role === "X" ? "O" : "X";

        return room;
      });

      if (!result.committed) {
        message(
          gameMessage,
          "Nước đi không được chấp nhận.",
          true
        );
      }

    } catch (error) {
      message(
        gameMessage,
        "Lỗi đánh: " + error.message,
        true
      );
    }
  }

  // =================================
  // RESTART
  // =================================

  async function restart() {
    if (!roomRef || !currentRoom) return;

    if (currentRoom.hostUid !== uid) {
      message(
        gameMessage,
        "Chỉ chủ phòng mới được bắt đầu ván mới.",
        true
      );
      return;
    }

    if (!currentRoom.guestUid) {
      message(
        gameMessage,
        "Đang chờ người chơi thứ hai.",
        true
      );
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

      message(
        gameMessage,
        "Đã bắt đầu ván mới."
      );

    } catch (error) {
      message(
        gameMessage,
        "Lỗi bắt đầu ván: " + error.message,
        true
      );
    }
  }

  // =================================
  // LEAVE ROOM
  // =================================

  function leaveRoom() {
    stopListening();

    roomCode = null;
    currentRoom = null;

    showSetup();

    message(
      setupMessage,
      "Đã rời khỏi phòng."
    );
  }

  // =================================
  // LIVE HOST CENTER
  // =================================

  function isHost() {
    return uid === HOST_UID;
  }

  function showHostPanel() {
    if (!liveHostPanel) {
      console.error(
        "Không tìm thấy liveHostPanel trong HTML."
      );
      return;
    }

    if (!isHost()) {
      liveHostPanel.classList.add("hidden");
      return;
    }

    liveHostPanel.classList.remove("hidden");

    // Đảm bảo bảng hiển thị nếu HTML có class ẩn
    liveHostPanel.style.display = "block";

    startQueueListening();
  }

  function startQueueListening() {
    if (!isHost() || !db || queueListener) return;

    queueRef = db.ref("liveQueue");

    queueListener = snapshot => {
      const data = snapshot.val() || {};
      renderQueue(data);
    };

    queueRef.on(
      "value",
      queueListener,
      error => {
        message(
          $("liveHostMessage"),
          "Lỗi hàng chờ: " + error.message,
          true
        );
      }
    );
  }

  function getSortedQueue(data) {
    return Object.entries(data || {})
      .map(([key, value]) => ({
        key,
        ...(value || {})
      }))
      .filter(item =>
        item.name &&
        Number(item.giftValue) > 0
      )
      .sort((a, b) =>
        Number(b.giftValue) - Number(a.giftValue) ||
        Number(a.receivedAt || 0) -
        Number(b.receivedAt || 0)
      );
  }

  function renderQueue(data) {
    const list = $("liveQueueList");
    const count = $("queueCount");

    if (!list || !count) return;

    const entries = getSortedQueue(data);

    count.textContent = entries.length + " người";
    list.innerHTML = "";

    if (!entries.length) {
      list.innerHTML =
        '<p class="hint">Chưa có người đăng ký.</p>';
      return;
    }

    entries.forEach((item, index) => {
      const row = document.createElement("div");

      row.style.cssText =
        "display:flex;align-items:center;gap:9px;" +
        "padding:11px;margin-bottom:8px;" +
        "border:1px solid #30425a;border-radius:12px;" +
        "background:#0c1625";

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
      detail.textContent =
        "Quà " + item.giftValue + " xu";

      info.append(name, detail);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.className = "secondary";
      remove.style.padding = "7px 11px";

      remove.addEventListener("click", () => {
        removeQueueItem(item.key);
      });

      row.append(rank, info, remove);
      list.appendChild(row);
    });
  }

  // =================================
  // ADD QUEUE
  // =================================

  async function addQueueItem() {
    if (!isHost() || !db) return;

    const nameInput = $("queuePlayerName");
    const valueInput = $("queueGiftValue");

    if (!nameInput || !valueInput) {
      message(
        $("liveHostMessage"),
        "Thiếu ô nhập hàng chờ trong HTML.",
        true
      );
      return;
    }

    const name = nameInput.value.trim().slice(0, 30);
    const giftValue = Number(valueInput.value);

    if (!name) {
      message(
        $("liveHostMessage"),
        "Hãy nhập tên TikTok.",
        true
      );
      return;
    }

    if (
      !Number.isSafeInteger(giftValue) ||
      giftValue < 1 ||
      giftValue > 1000000
    ) {
      message(
        $("liveHostMessage"),
        "Giá trị quà không hợp lệ.",
        true
      );
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

      message(
        $("liveHostMessage"),
        "Đã thêm " + name + " vào hàng chờ."
      );

    } catch (error) {
      message(
        $("liveHostMessage"),
        "Không thể thêm: " + error.message,
        true
      );
    }
  }

  // =================================
  // REMOVE QUEUE ITEM
  // =================================

  async function removeQueueItem(key) {
    if (!isHost() || !db) return;

    try {
      await db.ref("liveQueue/" + key).remove();

      message(
        $("liveHostMessage"),
        "Đã xóa người chơi khỏi hàng chờ."
      );

    } catch (error) {
      message(
        $("liveHostMessage"),
        "Lỗi xóa: " + error.message,
        true
      );
    }
  }

  // =================================
  // SKIP QUEUE
  // =================================

  async function queueSkip() {
    if (!isHost() || !db) return;

    try {
      const snapshot = await db.ref("liveQueue").once("value");
      const entries = getSortedQueue(snapshot.val());

      if (!entries.length) {
        message(
          $("liveHostMessage"),
          "Hàng chờ đang trống."
        );
        return;
      }

      await removeQueueItem(entries[0].key);

    } catch (error) {
      message(
        $("liveHostMessage"),
        "Lỗi bỏ qua: " + error.message,
        true
      );
    }
  }

  // =================================
  // CREATE ROOM FOR QUEUE PLAYER
  // =================================

  async function createRoomForQueue(selectedName) {
    playerName = getName();

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
      throw new Error(
        "Không tạo được mã phòng. Hãy thử lại."
      );
    }

    await ref.set({
      hostUid: uid,
      hostName: playerName,
      guestName: "Đang chờ " + selectedName,
      invitedName: selectedName,
      board: emptyBoard(),
      turn: "X",
      status: "waiting",
      winner: null,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    await connectRoom(code);

    return code;
  }

  // =================================
  // SELECT NEXT PLAYER
  // =================================

  async function queueNext() {
    if (!isHost() || !db) return;

    if (busy) {
      message(
        $("liveHostMessage"),
        "Đang xử lý thao tác khác. Vui lòng đợi."
      );
      return;
    }

    busy = true;

    try {
      const snapshot = await db.ref("liveQueue").once("value");
      const entries = getSortedQueue(snapshot.val());

      if (!entries.length) {
        message(
          $("liveHostMessage"),
          "Chưa có người chơi trong hàng chờ."
        );
        return;
      }

      const selected = entries[0];

      message(
        $("liveHostMessage"),
        "Đang tạo phòng cho " + selected.name + "..."
      );

      const code = await createRoomForQueue(selected.name);

      // Chỉ xóa sau khi tạo phòng thành công
      await db.ref("liveQueue/" + selected.key).remove();

      message(
        gameMessage,
        "Đã tạo phòng " + code +
        " cho " + selected.name +
        ". Gửi mã phòng để người chơi tham gia."
      );

      message(
        $("liveHostMessage"),
        "Đã chọn " + selected.name +
        ". Phòng " + code + " đã sẵn sàng."
      );

    } catch (error) {
      message(
        $("liveHostMessage"),
        "Lỗi chọn người chơi: " + error.message,
        true
      );
    } finally {
      busy = false;
    }
  }

  // =================================
  // BIND HOST BUTTONS
  // =================================

  function bindHostControls() {
    if (!isHost()) return;

    $("queueAddBtn")?.addEventListener(
      "click",
      addQueueItem
    );

    $("queueSkipBtn")?.addEventListener(
      "click",
      queueSkip
    );

    $("queueNextBtn")?.addEventListener(
      "click",
      queueNext
    );
  }

  // =================================
  // BIND GAME BUTTONS
  // =================================

  function bindGameControls() {
    $("createBtn")?.addEventListener(
      "click",
      createRoom
    );

    $("joinBtn")?.addEventListener(
      "click",
      joinRoom
    );

    $("restartBtn")?.addEventListener(
      "click",
      restart
    );


    $("backBtn")?.addEventListener(
      "click",
      leaveRoom
    );
  }

  // =================================
  // FIREBASE INITIALIZATION
  // =================================

  async function init() {
    try {
      message(
        setupMessage,
        "Đang kết nối Firebase..."
      );

      if (typeof firebase === "undefined") {
        throw new Error(
          "Chưa tải được Firebase SDK."
        );
      }

      if (!window.firebaseConfig) {
        throw new Error(
          "Chưa có Firebase config."
        );
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(
          window.firebaseConfig
        );
      }

      auth = firebase.auth();
      db = firebase.database();

      await auth.signInAnonymously();

      uid = auth.currentUser.uid;

      console.log("CARO LIVE ARENA VERSION 15");
      console.log("CURRENT UID:", uid);
      console.log("HOST UID:", HOST_UID);
      console.log("IS HOST:", isHost());

      // Hiển thị thông tin kiểm tra UID
      message(
        setupMessage,
        "UID: " + uid +
        " | Quyền HOST: " +
        (isHost() ? "ĐÚNG" : "SAI")
      );

      // Liên kết các nút game
      bindGameControls();

      // Chỉ tài khoản HOST mới được quản lý LIVE
      if (isHost()) {
        showHostPanel();
        bindHostControls();

        message(
          $("liveHostMessage"),
          "Đã xác thực HOST. Bảng quản lý đã sẵn sàng."
        );
      } else {
        if (liveHostPanel) {
          liveHostPanel.classList.add("hidden");
          liveHostPanel.style.display = "none";
        }
      }

    } catch (error) {
      console.error("CARO INIT ERROR:", error);

      message(
        setupMessage,
        "Lỗi kết nối: " + error.message,
        true
      );
    }
  }

  // =================================
  // START APPLICATION
  // =================================

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

})();

