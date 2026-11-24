(() => {
"use strict";

/*
 CARO LIVE ARENA V2
 - Dùng namespace arenaV2 để không ghi đè dữ liệu games/liveHost/liveQueue cũ.
 - HOST UID được xác nhận: FhBvb1ZyyeYBraKPJChgcpdoNHX2
 - Firebase client config là public identifier; bảo mật phải nằm ở Firebase Rules.
*/

const firebaseConfig = {
  apiKey: "AIzaSyA80_Us6qBYmgCOCVmN2zP5EhWFiL8AqH4",
  authDomain: "caro-fight.firebaseapp.com",
  databaseURL: "https://caro-fight-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "caro-fight",
  storageBucket: "caro-fight.firebasestorage.app",
  messagingSenderId: "209006748943",
  appId: "1:209006748943:web:b1182aeaa8c4e4acd34a7a",
  measurementId: "G-QYZPFB1GTY"
};

const HOST_UID = "FhBvb1ZyyeYBraKPJChgcpdoNHX2";
const SIZE = 15;
const WIN_COUNT = 5;
const TURN_SECONDS = 30;
const ROOT = "arenaV2";
const $ = id => document.getElementById(id);

let auth, db, uid = null, playerName = "Người chơi";
let activeCode = null, roomListener = null, chatListener = null, queueListener = null;
let activeRoom = null, timerInterval = null, busy = false;

function say(id, message, isError=false) {
  const el = $(id); if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#b91c1c" : "";
}
function cleanName(s) { return String(s || "").trim().replace(/[<>]/g,"").slice(0,24); }
function makeCode() { return Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,"A"); }
function isHost() { return uid === HOST_UID; }
function now() { return firebase.database.ServerValue.TIMESTAMP; }
function boardEmpty() { return Array(SIZE*SIZE).fill(""); }
function idx(r,c) { return r*SIZE+c; }
function validBoard(b) { return Array.isArray(b) && b.length === SIZE*SIZE; }

function hasWon(board, pos, mark) {
  const r = Math.floor(pos/SIZE), c = pos%SIZE;
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dr,dc] of dirs) {
    let count = 1;
    for (const sign of [-1,1]) {
      let rr=r+dr*sign, cc=c+dc*sign;
      while (rr>=0 && rr<SIZE && cc>=0 && cc<SIZE && board[idx(rr,cc)]===mark) {
        count++; rr+=dr*sign; cc+=dc*sign;
      }
    }
    if (count >= WIN_COUNT) return true;
  }
  return false;
}

async function init() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth(); db = firebase.database();
    auth.onAuthStateChanged(async user => {
      if (!user) return;
      uid = user.uid;
      $("accountInfo").textContent = "UID: " + uid.slice(0,8) + "…";
      $("playerName").value = localStorage.getItem("caroV2Name") || "";
      playerName = cleanName($("playerName").value) || "Người chơi";
      if (isHost()) $("hostPanel").classList.remove("hidden");
      listenQueue();
      $("connection").textContent = "Đã kết nối Firebase";
      $("connection").style.background = "#dcfce7";
      $("connection").style.color = "#166534";
    });
    await auth.signInAnonymously();
  } catch (e) {
    $("connection").textContent = "Lỗi kết nối";
    say("roomMessage", "Không kết nối được Firebase: " + (e.message || e), true);
  }
}

$("saveName").addEventListener("click", () => {
  const name = cleanName($("playerName").value);
  if (!name) return say("roomMessage","Anh hãy nhập tên hiển thị.",true);
  playerName = name; localStorage.setItem("caroV2Name", name);
  say("roomMessage","Đã lưu tên: " + name);
});

async function createRoom() {
  if (!uid || busy) return;
  busy = true;
  try {
    let code, ref, snap, tries=0;
    do {
      code = makeCode(); ref = db.ref(`${ROOT}/rooms/${code}`);
      snap = await ref.once("value"); tries++;
    } while (snap.exists() && tries<8);
    if (snap.exists()) throw new Error("Không tạo được mã phòng mới. Anh thử lại.");
    const room = {
      code, status:"waiting", createdAt:now(), updatedAt:now(),
      xUid:uid, xName:playerName, oUid:"", oName:"",
      board:boardEmpty(), turn:"X", moves:0, winner:"",
      turnStartedAt:now(), rematchRequestedBy:""
    };
    await ref.set(room);
    $("roomCode").value = code;
    enterRoom(code);
    say("roomMessage","Đã tạo phòng " + code + ". Gửi mã này cho người chơi X.");
  } catch(e) { say("roomMessage","Tạo phòng thất bại: " + (e.message||e),true); }
  finally { busy=false; }
}

async function joinRoom() {
  const code = String($("roomCode").value||"").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return say("roomMessage","Mã phòng phải gồm 6 ký tự.",true);
  if (!uid || busy) return;
  busy=true;
  try {
    const ref = db.ref(`${ROOT}/rooms/${code}`);
    let result = await ref.transaction(room => {
      if (!room) return;
      if (room.xUid === uid || room.oUid === uid) return room;
      if (room.status !== "waiting" || room.oUid) return;
      room.oUid = uid; room.oName = playerName;
      room.status = "playing"; room.updatedAt = firebase.database.ServerValue.TIMESTAMP;
      room.turnStartedAt = firebase.database.ServerValue.TIMESTAMP;
      return room;
    }, undefined, false);
    if (!result.committed) throw new Error("Phòng không tồn tại hoặc đã đủ người.");
    enterRoom(code);
    say("roomMessage","Đã vào phòng " + code + ".");
  } catch(e) { say("roomMessage","Không tham gia được: " + (e.message||e),true); }
  finally { busy=false; }
}

function enterRoom(code) {
  leaveRoom(false);
  activeCode = code;
  $("gamePanel").classList.remove("hidden");
  $("copyInvite").disabled = false;
  $("roomCode").value = code;
  roomListener = db.ref(`${ROOT}/rooms/${code}`).on("value", snap => {
    activeRoom = snap.val();
    if (!activeRoom) { say("gameMessage","Phòng không còn tồn tại.",true); return; }
    renderRoom();
  }, err => say("gameMessage","Không đọc được phòng: "+err.message,true));
  listenChat(code);
}
function leaveRoom(clearMessage=true) {
  if (activeCode && roomListener) db.ref(`${ROOT}/rooms/${activeCode}`).off("value",roomListener);
  if (activeCode && chatListener) db.ref(`${ROOT}/rooms/${activeCode}/chat`).off("value",chatListener);
  activeCode=null; activeRoom=null; roomListener=null; chatListener=null;
  if (timerInterval) clearInterval(timerInterval);
  $("gamePanel").classList.add("hidden");
  $("copyInvite").disabled=true;
  $("chatInput").disabled=true; $("sendChat").disabled=true;
  $("chatList").innerHTML='<p class="muted">Vào phòng để chat.</p>';
  if (clearMessage) say("roomMessage","Đã rời phòng.");
}
function renderRoom() {
  const r=activeRoom;
  $("roomTitle").textContent="PHÒNG "+r.code;
  $("players").textContent=`X: ${r.xName || "Đang chờ"}  ·  O: ${r.oName || "Đang chờ"}`;
  $("turnBadge").textContent = r.winner ? "Kết thúc" : (r.status==="waiting" ? "Chờ người chơi" : "Lượt "+r.turn);
  if (r.winner) say("gameMessage",r.winner==="DRAW"?"Ván đấu hòa.":`Người chơi ${r.winner} thắng!`);
  else if (r.status==="waiting") say("gameMessage","Đang chờ người chơi thứ hai vào phòng.");
  else say("gameMessage",`Đến lượt ${r.turn} · ${r.turn==="X"?r.xName:r.oName}`);
  renderBoard();
  $("chatInput").disabled=false; $("sendChat").disabled=false;
}
function renderBoard() {
  const boardEl=$("board"); boardEl.innerHTML="";
  if (!activeRoom || !validBoard(activeRoom.board)) return;
  const mark = activeRoom.xUid===uid ? "X" : activeRoom.oUid===uid ? "O" : "";
  for (let i=0;i<SIZE*SIZE;i++) {
    const b=document.createElement("button");
    const v=activeRoom.board[i]||"";
    b.className="cell"+(v?" "+v.toLowerCase():"");
    b.textContent=v;
    b.setAttribute("aria-label",`Ô ${Math.floor(i/SIZE)+1}, ${i%SIZE+1} ${v}`);
    b.disabled=!!v || activeRoom.status!=="playing" || !!activeRoom.winner || !mark || activeRoom.turn!==mark;
    b.addEventListener("click",()=>playMove(i));
    boardEl.appendChild(b);
  }
}
async function playMove(pos) {
  if (!activeCode || !uid) return;
  const ref=db.ref(`${ROOT}/rooms/${activeCode}`);
  try {
    const result=await ref.transaction(room=>{
      if (!room || room.status!=="playing" || room.winner || !validBoard(room.board)) return;
      const mark=room.xUid===uid?"X":room.oUid===uid?"O":"";
      if (!mark || room.turn!==mark || room.board[pos]) return;
      room.board[pos]=mark;
      room.moves=(room.moves||0)+1;
      if (hasWon(room.board,pos,mark)) { room.winner=mark; room.status="finished"; }
      else if (room.moves>=SIZE*SIZE) { room.winner="DRAW"; room.status="finished"; }
      else room.turn=mark==="X"?"O":"X";
      room.turnStartedAt=firebase.database.ServerValue.TIMESTAMP;
      room.updatedAt=firebase.database.ServerValue.TIMESTAMP;
      return room;
    },undefined,false);
    if (!result.committed) say("gameMessage","Nước đi không hợp lệ hoặc không phải lượt của anh.",true);
  } catch(e) { say("gameMessage","Lỗi khi đánh: "+e.message,true); }
}
async function requestRematch() {
  if (!activeCode || !activeRoom || !uid) return;
  try {
    const ref=db.ref(`${ROOT}/rooms/${activeCode}`);
    const result=await ref.transaction(room=>{
      if (!room || (room.xUid!==uid && room.oUid!==uid)) return;
      if (room.status!=="finished") return;
      room.board=boardEmpty(); room.turn="X"; room.moves=0; room.winner="";
      room.status=room.oUid?"playing":"waiting";
      room.rematchRequestedBy=uid;
      room.turnStartedAt=firebase.database.ServerValue.TIMESTAMP;
      room.updatedAt=firebase.database.ServerValue.TIMESTAMP;
      return room;
    },undefined,false);
    if (!result.committed) say("gameMessage","Chỉ có thể chơi lại khi ván đã kết thúc.",true);
  } catch(e) { say("gameMessage","Không thể chơi lại: "+e.message,true); }
}

function listenChat(code) {
  const ref=db.ref(`${ROOT}/rooms/${code}/chat`).limitToLast(40);
  chatListener=ref.on("value",snap=>{
    const list=$("chatList"); list.innerHTML="";
    if (!snap.exists()) { list.innerHTML='<p class="muted">Chưa có tin nhắn.</p>'; return; }
    snap.forEach(child=>{
      const m=child.val()||{};
      const div=document.createElement("div"); div.className="chatItem";
      const strong=document.createElement("b"); strong.textContent=(m.name||"Người chơi")+": ";
      const span=document.createElement("span"); span.textContent=m.text||"";
      div.append(strong,span); list.appendChild(div);
    });
    list.scrollTop=list.scrollHeight;
  });
}
async function sendChat() {
  const text=String($("chatInput").value||"").trim().slice(0,240);
  if (!text || !activeCode || !activeRoom) return;
  try {
    await db.ref(`${ROOT}/rooms/${activeCode}/chat`).push({uid,name:playerName,text,createdAt:now()});
    $("chatInput").value="";
  } catch(e) { say("gameMessage","Không gửi được chat: "+e.message,true); }
}

async function addQueue() {
  if (!isHost()) return say("hostMessage","Tài khoản này không có quyền HOST.",true);
  const name=String($("queueName").value||"").trim().slice(0,40);
  const coins=Math.max(0,Math.min(1000000,Number($("queueCoins").value)||0));
  if (!name) return say("hostMessage","Nhập TikTok ID hoặc tên người chơi.",true);
  try {
    const ref=db.ref(`${ROOT}/queue`).push();
    await ref.set({name,coins,createdAt:now(),status:"waiting",addedBy:uid});
    $("queueName").value=""; $("queueCoins").value="0";
    say("hostMessage","Đã thêm "+name+" vào danh sách chờ.");
  } catch(e) { say("hostMessage","Không thêm được: "+e.message,true); }
}
function listenQueue() {
  if (!isHost()) return;
  const ref=db.ref(`${ROOT}/queue`).orderByChild("createdAt").limitToLast(100);
  queueListener=ref.on("value",snap=>{
    const items=[];
    snap.forEach(ch=>items.push({key:ch.key,...(ch.val()||{})}));
    items.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const list=$("queueList"); list.innerHTML="";
    const waiting=items.filter(x=>x.status==="waiting");
    if (!waiting.length) { list.innerHTML='<p class="muted">Chưa có người chờ.</p>'; return; }
    waiting.forEach((item,i)=>{
      const row=document.createElement("div"); row.className="queueItem";
      const left=document.createElement("span"); left.textContent=`${i+1}. ${item.name}`;
      const right=document.createElement("b"); right.textContent=`${item.coins||0} xu`;
      row.append(left,right); list.appendChild(row);
    });
  },err=>say("hostMessage","Không đọc được danh sách chờ: "+err.message,true));
}
async function callNext() {
  if (!isHost()) return say("hostMessage","Không có quyền HOST.",true);
  try {
    const snap=await db.ref(`${ROOT}/queue`).orderByChild("createdAt").once("value");
    let next=null;
    snap.forEach(ch=>{ const v=ch.val()||{}; if (!next && v.status==="waiting") next={key:ch.key,...v}; });
    if (!next) return say("hostMessage","Danh sách chờ đang trống.");
    await db.ref(`${ROOT}/queue/${next.key}`).update({status:"called",calledAt:now()});
    $("queueName").value=next.name;
    say("hostMessage",`Đã gọi ${next.name}. Anh bấm “Tạo phòng mới”, rồi gửi mã phòng cho người chơi.`);
  } catch(e) { say("hostMessage","Không gọi được: "+e.message,true); }
}

$("createRoom").addEventListener("click",createRoom);
$("joinRoom").addEventListener("click",joinRoom);
$("leaveRoom").addEventListener("click",()=>leaveRoom());
$("rematch").addEventListener("click",requestRematch);
$("sendChat").addEventListener("click",sendChat);
$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendChat();});
$("addQueue").addEventListener("click",addQueue);
$("callNext").addEventListener("click",callNext);
$("copyInvite").addEventListener("click",async()=>{
  if(!activeCode)return;
  const link=location.origin+location.pathname+"?room="+activeCode;
  try{await navigator.clipboard.writeText(link);say("roomMessage","Đã chép link phòng: "+link);}
  catch(_){say("roomMessage","Link phòng: "+link);}
});
const roomFromUrl=new URLSearchParams(location.search).get("room");
if(roomFromUrl){$("roomCode").value=roomFromUrl.toUpperCase();}
init();
})();