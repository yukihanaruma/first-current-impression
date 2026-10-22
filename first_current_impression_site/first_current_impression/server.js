import express from "express";
import http from "http";
import { Server } from "socket.io";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const sessions = new Map();
let state = {
  roomCode: makeCode(),
  title: "첫인상 · 현인상",
  participants: [],
  targetId: null,
  phase: "setup", // setup | writing | reveal | closed
  entries: [],
  revealedIds: [],
  createdAt: Date.now()
};

function makeCode() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function cleanText(s, max=600) { return String(s ?? "").trim().slice(0, max); }
function publicState() {
  const target = state.participants.find(p => p.id === state.targetId);
  return {
    roomCode: state.roomCode, title: state.title, phase: state.phase,
    target: target ? { id: target.id, name: target.name } : null,
    participants: state.participants.map(p => ({ id:p.id, name:p.name })),
    submittedCount: state.entries.length,
    revealedCount: state.revealedIds.length
  };
}
function requireAdmin(req,res,next) {
  const token = req.headers["x-admin-token"];
  if (!token || !sessions.has(token)) return res.status(401).json({ error:"관리자 인증이 필요합니다." });
  next();
}
function adminLogin(req,res) {
  const password = cleanText(req.body.password, 200);
  if (password !== ADMIN_PASSWORD) return res.status(403).json({error:"비밀번호가 올바르지 않습니다."});
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, true);
  res.json({token});
}
app.post("/api/admin/login", adminLogin);
app.get("/api/state", (req,res) => res.json(publicState()));
app.get("/api/public-results", (req,res) => {
  const target = state.participants.find(p=>p.id===state.targetId);
  const results = state.entries
    .filter(e => state.revealedIds.includes(e.id))
    .map(e => ({ id:e.id, first:e.first, current:e.current, createdAt:e.createdAt }));
  res.json({ ...publicState(), target: target ? { id:target.id, name:target.name } : null, results });
});
app.get("/api/results", requireAdmin, (req,res) => {
  const target = state.participants.find(p=>p.id===state.targetId);
  const results = state.entries.map(e => ({
    id:e.id, first:e.first, current:e.current, createdAt:e.createdAt,
    revealed:state.revealedIds.includes(e.id)
  }));
  res.json({ ...publicState(), target: target ? {id:target.id,name:target.name}:null, results });
});
app.post("/api/admin/participants", requireAdmin, (req,res) => {
  const names = Array.isArray(req.body.names) ? req.body.names : [];
  const parsed = [...new Set(names.map(n=>cleanText(n,50)).filter(Boolean))].slice(0,100);
  state.participants = parsed.map(name=>({id:crypto.randomUUID(), name}));
  state.targetId = null; state.entries=[]; state.revealedIds=[]; state.phase="setup";
  state.roomCode=makeCode();
  io.emit("state", publicState());
  res.json(publicState());
});
app.post("/api/admin/target", requireAdmin, (req,res) => {
  const id = cleanText(req.body.targetId,100);
  if (!state.participants.some(p=>p.id===id)) return res.status(400).json({error:"참가자를 선택해 주세요."});
  state.targetId=id; state.entries=[]; state.revealedIds=[]; state.phase="writing";
  io.emit("state", publicState());
  res.json(publicState());
});
app.post("/api/admin/phase", requireAdmin, (req,res) => {
  const phase = cleanText(req.body.phase,20);
  if (!["writing","reveal","closed","setup"].includes(phase)) return res.status(400).json({error:"잘못된 단계입니다."});
  if (phase==="reveal" && !state.targetId) return res.status(400).json({error:"먼저 주인공을 선택하세요."});
  state.phase=phase;
  io.emit("state", publicState());
  res.json(publicState());
});
app.post("/api/admin/reveal", requireAdmin, (req,res) => {
  const id=cleanText(req.body.id,100);
  if (!state.entries.some(e=>e.id===id)) return res.status(404).json({error:"글을 찾을 수 없습니다."});
  if (!state.revealedIds.includes(id)) state.revealedIds.push(id);
  io.emit("state", publicState());
  res.json({ok:true});
});
app.post("/api/admin/reset", requireAdmin, (req,res) => {
  state.entries=[]; state.revealedIds=[]; state.targetId=null; state.phase="setup";
  io.emit("state", publicState());
  res.json(publicState());
});
app.post("/api/submit", (req,res) => {
  if (state.phase!=="writing") return res.status(403).json({error:"현재는 글을 제출할 수 없습니다."});
  const participantName=cleanText(req.body.participantName,50);
  const first=cleanText(req.body.first,1000);
  const current=cleanText(req.body.current,1000);
  const targetId=cleanText(req.body.targetId,100);
  if (!participantName || !first || !current) return res.status(400).json({error:"이름과 두 항목을 모두 작성해 주세요."});
  if (targetId!==state.targetId) return res.status(409).json({error:"주인공이 변경되었습니다. 페이지를 새로고침해 주세요."});
  if (state.participants.some(p=>p.id===targetId && p.name===participantName)) return res.status(400).json({error:"주인공은 자신의 평가를 제출할 수 없습니다."});
  // Participant identity is deliberately not stored with the entry.
  state.entries.push({id:crypto.randomUUID(), first, current, createdAt:Date.now()});
  io.emit("state", publicState());
  res.json({ok:true});
});
io.on("connection", socket => socket.emit("state", publicState()));
server.listen(PORT, "0.0.0.0", () => {
  console.log(`첫인상·현인상 사이트: http://localhost:${PORT}`);
  console.log(`관리자 비밀번호 환경변수 ADMIN_PASSWORD를 설정하세요. 기본값은 change-this-password 입니다.`);
});