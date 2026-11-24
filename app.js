
(() => {
  "use strict";

  // CARO LIVE ARENA - VERSION 18
  // CARO + LIVE HOST + PRIORITY QUEUE + TIMER + ELO + LEADERBOARD
  // EXPERIMENTAL CLIENT-SIDE VERSION

  const $ = id => document.getElementById(id);
  const SIZE = 15;
  const TOTAL = SIZE * SIZE;
  const TURN_SECONDS = 30;
  const HOST_UID = "NFiHocrXdxV19KJdEg8mf1kUFl42";
  const LEADERBOARD_PATH = "games/_leaderboard";

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
  let timerInterval = null;
  let timeoutBusy = false;
  let eloBusy = false;

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
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

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
  // V18 UI
  // =================================

  function createV18UI() {
    if (!gamePanel) return;

    if (!$("v18Timer")) {
      const timer = document.createElement("div");
      timer.id = "v18Timer";
      timer.style.cssText =
        "padding:12px;margin:10px 0;border-radius:12px;" +
        "background:#14243a;color:#fff;text-align:center;" +
        "font-size:20px;font-weight:bold;";
      timer.textContent = "⏱ 30 giây";
      gamePanel.insertBefore(timer, gamePanel.firstChild);
    }

    if (!$("v18Leaderboard")) {
      const panel = document.createElement("div");
      panel.id = "v18Leaderboard";
      panel.style.cssText =
        "padding:12px;margin:14px 0;border-radius:12px;" +
        "background:#14243a;color:#fff;";

      const title = document.createElement("h3");
      title.textContent = "🏆 BẢNG XẾP HẠNG ELO";
      title.style.margin = "0 0 10px";

      const list = document.createElement("div");
      list.id = "v18LeaderboardList";
      list.textContent = "Đang tải bảng xếp hạng...";

      panel.append(title, list);
      gamePanel.appendChild(panel);
    }
  }

  function updateTimerDisplay(seconds, status) {
    const el = $("v18Timer");
    if (!el) return;

    if (status !== "playing") {
      el.textContent = status === "finished"
        ? "⏱ Ván đấu đã kết thúc"
        : "⏱ Đang chờ đối thủ";
      el.style.color = "#fff";
      return;
    }

    el.textContent = "⏱ CÒN " + seconds + " GIÂY";
    el.style.color = seconds <= 10 ? "#ff7777" : "#fff";
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

    if ($("roomCode")) $("roomCode").textContent = roomCode || "------";
    if ($("xName")) $("xName").textContent = room.hostName || "Chủ phòng";
    if ($("oName")) $("oName").textContent = room.guestName || "Đang chờ đối thủ";

    if ($("xCard")) {
      $("xCard").classList.toggle(
        "active",
        room.turn === "X" && room.status === "playing"
      );
    }

    if ($("oCard")) {
      $("oCard").classList.toggle(
        "active",
        room.turn === "O" && room.status === "playing"
      );
    }

    const boardEl = $("board");

    if (boardEl) {
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
    }

    if (room.status === "waiting") {
      if ($("statusBar")) {
        $("statusBar").textContent = "ĐANG CHỜ NGƯỜI CHƠI THỨ HAI";
      }

      updateTimerDisplay(30, "waiting");
      message(gameMessage, "Gửi mã phòng " + roomCode + " cho đối thủ.");
      return;
    }

    if (room.status === "finished") {
      if ($("statusBar")) {
        $("statusBar").textContent = room.winner
          ? "QUÂN " + room.winner + " CHIẾN THẮNG!"
          : "VÁN ĐẤU HÒA";
      }

      updateTimerDisplay(0, "finished");

      if (room.finishReason === "timeout") {
        message(
          gameMessage,
          "Hết giờ! Quân " + room.winner + " chiến thắng."
        );
      } else {
        message(gameMessage, "Ván đấu kết thúc. Nhấn Chơi ván mới để tiếp tục.");
      }

      applyEloOnce(room);
      return;
    }

    if ($("statusBar")) {
      $("statusBar").textContent =
        room.turn === role
          ? "ĐẾN LƯỢT CỦA ANH"
          : "ĐANG ĐỢI QUÂN " + room.turn + " ĐÁNH";
    }

    message(
      gameMessage,
      role
        ? "Anh đang chơi quân " + role + "."
        : "Tài khoản này không thuộc phòng đấu.",
      !role
    );

    refreshTimer();
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
    createV18UI();
  }

  // =================================
  // CREATE ROOM
  // =================================

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

      if (!ref) throw new Error("Không tạo được mã phòng. Hãy thử lại.");

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
      message(gameMessage, "Đã tạo phòng " + code + ". Gửi mã cho đối thủ.");

    } catch (error) {
      message(setupMessage, "Lỗi tạo phòng: " + error.message, true);
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
      message(setupMessage, "Firebase chưa kết nối.", true);
      return;
    }

    playerName = getName();

    const input = $("roomInput");
    const code = input ? input.value.trim().toUpperCase() : "";

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      message(setupMessage, "Mã phòng phải gồm đúng 6 ký tự.", true);
      return;
    }

    busy = true;
    message(setupMessage, "Đang tìm phòng " + code + "...");

    try {
      const ref = db.ref("games/" + code);
      const snapshot = await ref.once("value");

      if (!snapshot.exists()) throw new Error("Không tìm thấy phòng " + code + ".");

      const room = snapshot.val();

      if (room.hostUid === uid) {
        throw new Error("Máy này đang dùng cùng tài khoản với chủ phòng.");
      }

      if (room.status !== "waiting") {
        throw new Error("Phòng không còn ở trạng thái chờ.");
      }

      if (room.guestUid) throw new Error("Phòng đã có người chơi thứ hai.");

      const now = Date.now();

      await ref.update({
        guestUid: uid,
        guestName: playerName,
        status: "playing",
        turnStartedAt: now,
        turnDeadline: now + TURN_SECONDS * 1000
      });

      const verifySnapshot = await ref.once("value");

      if (
        !verifySnapshot.exists() ||
        verifySnapshot.val().guestUid !== uid
      ) {
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

  // =================================
  // PLAY
  // =================================

  async function play(index) {
    if (!roomRef || !currentRoom) return;

    const role = getRole(currentRoom);

    if (!role || currentRoom.status !== "playing") return;

    try {
      const result = await roomRef.transaction(room => {
        if (!room || room.status !== "playing") return;
        if (room.turn !== role) return;

        const deadline = Number(room.turnDeadline || 0);
        if (deadline && Date.now() >= deadline) return;

        const board = Array.isArray(room.board)
          ? room.board.slice()
          : emptyBoard();

        if (board[index]) return;

        board[index] = role;

        const winner = winningMark(board);
        const isDraw = !winner && board.every(Boolean);
        const now = Date.now();

        room.board = board;
        room.lastMove = index;
        room.winner = winner || null;

        room.status = winner || isDraw ? "finished" : "playing";
        room.turn = role === "X" ? "O" : "X";

        room.turnStartedAt = now;
        room.turnDeadline = now + TURN_SECONDS * 1000;

        if (isDraw) room.finishReason = "draw";
        if (winner) room.finishReason = "normal";

        return room;
      });

      if (!result.committed) {
        message(gameMessage, "Nước đi không được chấp nhận hoặc đã hết giờ.", true);
      }

    } catch (error) {
      message(gameMessage, "Lỗi đánh: " + error.message, true);
    }
  }

  // =================================
  // TIMER + TIMEOUT
  // =================================

  function refreshTimer() {
    if (!currentRoom || currentRoom.status !== "playing") return;

    const deadline = Number(currentRoom.turnDeadline || 0);

    if (!deadline) {
      updateTimerDisplay(TURN_SECONDS, "playing");
      return;
    }

    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

    updateTimerDisplay(remaining, "playing");

    if (remaining <= 0) {
      expireTurn();
    }
  }

  async function expireTurn() {
    if (!roomRef || timeoutBusy) return;
    timeoutBusy = true;

    try {
      await roomRef.transaction(room => {
        if (!room || room.status !== "playing") return;

        const deadline = Number(room.turnDeadline || 0);

        if (!deadline || Date.now() < deadline) return;

        room.status = "finished";
        room.winner = room.turn === "X" ? "O" : "X";
        room.finishReason = "timeout";
        room.finishedAt = Date.now();

        return room;
      });
    } catch (error) {
      console.error("TIMEOUT ERROR:", error);
    } finally {
      timeoutBusy = false;
    }
  }

  function startTimerLoop() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      refreshTimer();
    }, 250);
  }

  // =================================
  // ELO SYSTEM
  // =================================

  function getEloChange(myRating, opponentRating, score) {
    const expected =
      1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));

    return Math.round(32 * (score - expected));
  }

  async function updatePlayerElo(playerUid, name, delta, resultType) {
    if (!playerUid) return;

    const ref = db.ref(LEADERBOARD_PATH + "/" + playerUid);

    await ref.transaction(old => {
      const data = old || {
        uid: playerUid,
        name: name || "Người chơi",
        rating: 1000,
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0
      };

      data.name = name || data.name || "Người chơi";
      data.rating = Math.max(100, Number(data.rating || 1000) + delta);
      data.games = Number(data.games || 0) + 1;

      if (resultType === "win") data.wins = Number(data.wins || 0) + 1;
      if (resultType === "loss") data.losses = Number(data.losses || 0) + 1;
      if (resultType === "draw") data.draws = Number(data.draws || 0) + 1;

      data.updatedAt = Date.now();

      return data;
    });
  }

  async function applyEloOnce(room) {
    if (!room || !roomRef || eloBusy) return;
    if (room.eloApplied) return;
    if (!room.hostUid || !room.guestUid) return;

    eloBusy = true;

    try {
      // Claim kết quả để tránh hai máy cùng cộng ELO
      const claim = await roomRef.transaction(data => {
        if (!data || data.status !== "finished") return;
        if (data.eloApplied) return;

        data.eloApplied = true;
        return data;
      });

      if (!claim.committed) return;

      const finalRoom = claim.snapshot.val();
      const hostUid = finalRoom.hostUid;
      const guestUid = finalRoom.guestUid;

      const boardRef = db.ref(LEADERBOARD_PATH);

      const [hostSnap, guestSnap] = await Promise.all([
        boardRef.child(hostUid).once("value"),
        boardRef.child(guestUid).once("value")
      ]);

      const hostRating = Number(hostSnap.val()?.rating || 1000);
      const guestRating = Number(guestSnap.val()?.rating || 1000);

      if (!finalRoom.winner) {
        const hostDelta = getEloChange(hostRating, guestRating, 0.5);
        const guestDelta = getEloChange(guestRating, hostRating, 0.5);

        await Promise.all([
          updatePlayerElo(hostUid, finalRoom.hostName, hostDelta, "draw"),
          updatePlayerElo(guestUid, finalRoom.guestName, guestDelta, "draw")
        ]);
      } else {
        const hostWon = finalRoom.winner === "X";

        const hostDelta = getEloChange(
          hostRating,
          guestRating,
          hostWon ? 1 : 0
        );

        const guestDelta = getEloChange(
          guestRating,
          hostRating,
          hostWon ? 0 : 1
        );

        await Promise.all([
          updatePlayerElo(
            hostUid,
            finalRoom.hostName,
            hostDelta,
            hostWon ? "win" : "loss"
          ),
          updatePlayerElo(
            guestUid,
            finalRoom.guestName,
            guestDelta,
            hostWon ? "loss" : "win"
          )
        ]);
      }

      loadLeaderboard();

    } catch (error) {
      console.error("ELO ERROR:", error);
      message(gameMessage, "Lỗi cập nhật ELO: " + error.message, true);
    } finally {
      eloBusy = false;
    }
  }

  async function loadLeaderboard() {
    if (!db) return;

    const list = $("v18LeaderboardList");
    if (!list) return;

    try {
      const snapshot = await db.ref(LEADERBOARD_PATH).once("value");
      const data = snapshot.val() || {};

      const players = Object.values(data)
        .filter(item => item && item.uid)
        .sort((a, b) => Number(b.rating || 1000) - Number(a.rating || 1000))
        .slice(0, 10);

      list.innerHTML = "";

      if (!players.length) {
        list.textContent = "Chưa có dữ liệu xếp hạng.";
        return;
      }

      players.forEach((player, index) => {
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex;justify-content:space-between;" +
          "padding:8px 4px;border-bottom:1px solid #30425a;";

        const name = document.createElement("span");
        name.textContent =
          (index + 1) + ". " + (player.name || "Người chơi");

        const score = document.createElement("strong");
        score.textContent = Number(player.rating || 1000) + " ELO";

        row.append(name, score);
        list.appendChild(row);
      });

    } catch (error) {
      list.textContent = "Không tải được bảng xếp hạng.";
      console.error("LEADERBOARD ERROR:", error);
    }
  }

  // =================================
  // RESTART
  // =================================

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
      const now = Date.now();

      await roomRef.update({
        board: emptyBoard(),
        turn: "X",
        status: "playing",
        winner: null,
        lastMove: null,
        finishReason: null,
        eloApplied: null,
        turnStartedAt: now,
        turnDeadline: now + TURN_SECONDS * 1000
      });

      message(gameMessage, "Đã bắt đầu ván mới.");

    } catch (error) {
      message(gameMessage, "Lỗi bắt đầu ván: " + error.message, true);
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
    message(setupMessage, "Đã rời khỏi phòng.");
  }

  // =================================
  // LIVE HOST CENTER
  // =================================

  function isHost() {
    return uid === HOST_UID;
  }

  function showHostPanel() {
    if (!liveHostPanel) {
      console.error("Không tìm thấy liveHostPanel trong HTML.");
      return;
    }

    if (!isHost()) {
      liveHostPanel.classList.add("hidden");
      return;
    }

    liveHostPanel.classList.remove("hidden");
    liveHostPanel.style.display = "block";
    startQueueListening();
  }

  function startQueueLis
