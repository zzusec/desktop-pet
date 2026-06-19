// 桌面小狮子 —— 渲染层(全部逻辑都在这里)
//
// 用 Canvas 程序化绘制一只「瑞星小狮子」风格的卡通小狮子:
// 圆脑袋 + 一圈蓬松鬃毛 + 大眼睛 + 腮红。会呼吸、眨眼、朝鼠标看、挥手打招呼、
// 被点开心跳、拖着走、饿了/无聊了冒气泡、没人理就睡觉;
// 还会跳舞、打滚、追鼠标、比心、生气、跺脚、歪头思考、打哈欠,并能戴上节日帽子。
//
// 不依赖任何外部素材,在 Electron 里跑就是桌面宠物;
// 直接用浏览器打开 index.html 也能预览(只是少了「鼠标穿透」那层)。

'use strict'

/* =========================================================
 * 0. 画布与基础工具
 * =======================================================*/
const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')

let W = 0
let H = 0
let DPR = 1
let groundY = 0

function resize() {
  DPR = window.devicePixelRatio || 1
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * DPR)
  canvas.height = Math.floor(H * DPR)
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  groundY = H - 12
  if (lion) {
    lion.x = clamp(lion.x, 80, W - 80)
    if (lion.state !== 'drag') lion.y = Math.min(lion.y, groundY)
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
// 弹性缓动,用于落地 / 出现时的「Q弹」回弹
const easeOutBack = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
// 打哈欠张嘴包络:吸气渐张(0→1)→最大保持→缓缓闭合→结尾恢复
function yawnOpen(t) {
  if (t < 0.4) return t / 0.4
  if (t < 1.2) return 1
  if (t < 2.0) return 1 - (t - 1.2) / 0.8
  return 0
}

/* =========================================================
 * 1. 调色板与尺寸
 * =======================================================*/
const COLOR = {
  maneOuter: '#E8801F',
  maneInner: '#FBB04B',
  face1: '#FFE596',
  face2: '#FFC53D',
  body1: '#FFD972',
  body2: '#F4AE33',
  limb: '#F6B73C',
  ear: '#F0913B',
  earInner: '#C9621E',
  line: 'rgba(120, 66, 16, 0.55)',
  eye: '#3A2A1B',
  nose: '#6B3A1E',
  mouth: '#6B3A1E',
  blush: 'rgba(255, 122, 110, 0.45)',
  tongue: '#F36D7A',
  shadow: 'rgba(40, 20, 0, 0.16)',
  hatRed: '#E23B30',
  anger: '#E5392F',
  think: '#6B8CFF',
}

// 各物种的配色覆盖:狮/猫/狗沿用 COLOR 暖色;兔=白绒,熊猫=黑白
const SPECIES_SKIN = {
  rabbit: {
    body1: '#FFFFFF', body2: '#ECECF2',
    face1: '#FFFFFF', face2: '#E7E7EF',
    limb: '#F1F1F7', ear: '#F4F4F9', earInner: '#F7A9C0',
    maneOuter: '#FFFFFF',
  },
  panda: {
    body1: '#FFFFFF', body2: '#E9E9E9',
    face1: '#FFFFFF', face2: '#E6E6E6',
    limb: '#2B2B2B', ear: '#2B2B2B', earInner: '#1A1A1A',
    maneOuter: '#FFFFFF',
  },
}
// 取当前宠物的配色(无覆盖则用默认 COLOR)
function skin() {
  return SPECIES_SKIN[lion.species] || COLOR
}

// 小狮子的「标准尺寸」(逻辑像素),整体随 lion.size 缩放
const S = {
  faceR: 40,
  maneR: 56,
  bodyW: 62,
  bodyH: 50,
  legH: 13,
  eyeGap: 27,
  eyeR: 9.5,
  pupilR: 5.4,
}

/* =========================================================
 * 2. 小狮子状态
 * =======================================================*/
let lion = {
  x: 0,
  y: 0, // 脚底所在的 y
  size: 1,

  vy: 0, // 垂直速度(下落 / 跳跃)
  onGround: true,

  facing: 1, // 朝向:1 右,-1 左
  targetX: null, // 走动目标
  species: 'lion', // 种类:lion / cat / dog

  // idle walk greet happy drag eat sleep dance roll chase loveyou angry stomp think yawn
  // stretch shake groom scratch tailchase zoomies pant sniff stalk pounce playball
  state: 'idle',
  stateTime: 0,
  idleTimer: rand(2.5, 5),

  // 形变(squash & stretch)
  sx: 1,
  sy: 1,

  // 动画相位
  breathe: 0,
  walkPhase: 0,
  manePhase: 0,
  tailPhase: 0,
  armWave: 0,
  hopCount: 0,
  rollAngle: 0, // 打滚旋转角(0 → 2π)

  // 自己玩(拟真自主行为)
  nextAuto: '', // 动作链:当前动作结束后接着做的事(如 伸懒腰→抖毛)
  batCount: 0, // 玩毛线球:已拍打次数
  dashLeft: 0, // 疯跑:剩余冲刺趟数

  // 装饰
  hat: false, // (兼容旧存档字段,逻辑已改用 accessory)
  accessory: 'none', // 配饰:none / santa / glasses / scarf / bow / crown

  // 音效
  sound: false, // 音效开关(默认关,菜单开启)
  _stompTick: -1,

  // 眨眼
  eyeOpen: 1,
  blinkTimer: rand(2, 5),
  blinking: false,
  blinkT: 0,

  // 视线(瞳孔偏移,-1..1)
  gazeX: 0,
  gazeY: 0,

  // 表情(平滑过渡的当前值)
  mouthCurve: 0.5, // -1 撇嘴 .. 1 大笑
  eyeHappy: 0, // 0 圆眼 .. 1 弯眼笑
  armRaise: 0, // 0 垂手 .. 1 举手

  // 姿态(平滑过渡,消除状态切换时的生硬跳变)
  bodyTilt: 0, // 身体整体倾斜基底(静态前倾 / 侧倾)
  headTilt: 0, // 头部额外倾斜(歪头 / 仰头 / 低头)

  // 状态值
  hunger: 80, // 0 饿 .. 100 饱
  mood: 80, // 0 难过 .. 100 开心
  bond: 0, // 0 陌生 .. 100 形影不离(亲密度,靠互动与陪伴积累)
  bondLevel: 0, // 已达成的亲密度等级(里程碑只庆祝一次)

  // 和同伴一起玩
  mate: null, // 当前玩伴(另一只 pet 的引用)
  playRole: '', // 'chase' 追 / 'run' 逃 / 'nuzzle' 蹭

  // 对话气泡
  bubbleText: '',
  bubbleUntil: 0,

  // 吃东西的小道具
  foodT: 0,

  // 爱心粒子
  hearts: [],
}

/* =========================================================
 * 2.1 多宠物:lion 是「当前正在处理的那只」指针,pets 是全部
 * =======================================================*/
const PET_TEMPLATE = JSON.stringify(lion) // 干净初始快照,用于克隆新宠物
const pets = [lion]
let activePet = lion // 最近交互(点击/右键)的那只,菜单动作作用于它

function makePet(species, x) {
  const p = JSON.parse(PET_TEMPLATE)
  p.species = species || 'lion'
  p.x = x != null ? x : rand(120, (W || 800) - 120)
  p.y = groundY || (typeof H === 'number' ? H - 12 : 600)
  p.size = lion.size || 1
  p.sound = pets[0] ? pets[0].sound : false
  p.accessory = 'none'
  p.breathe = rand(0, 6)
  p.manePhase = rand(0, 6)
  p.tailPhase = rand(0, 6)
  p.idleTimer = rand(1, 3)
  return p
}

function addPet() {
  if (pets.length >= 4) {
    lion = activePet = pets[0]
    say('养太多啦~ 再养不下咯', 2)
    return
  }
  const sp = pick(['lion', 'cat', 'dog', 'rabbit', 'panda'])
  const startX = clamp(mouseX > 0 ? mouseX : rand(120, W - 120), 120, W - 120)
  const p = makePet(sp, startX)
  pets.push(p)
  activePet = lion = p
  say({ lion: '又来一只小狮子!🦁', cat: '喵~新伙伴来啦 🐱', dog: '汪!我也来玩 🐶', rabbit: '蹦~我也来啦 🐰', panda: '滚滚~我来咯 🐼' }[sp], 2.4)
  spawnHearts(3)
  saveState()
}

function removePet() {
  if (pets.length <= 1) {
    lion = activePet = pets[0]
    say('就剩我一个啦~', 1.8)
    return
  }
  const gone = pets.pop()
  if (activePet === gone) activePet = pets[pets.length - 1]
  lion = activePet
  say('拜拜~ 👋', 1.6)
  saveState()
}

let now = 0 // 当前时间(秒),来自 performance.now()

function say(text, dur = 2.6) {
  lion.bubbleText = text
  lion.bubbleUntil = now + dur
}

/* =========================================================
 * 2.5 音效(Web Audio 程序化合成,零音频素材)
 * =======================================================*/
let audioCtx = null
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      audioCtx = null
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// 播放一个单音(可滑音)
function beep(freq, dur, opts) {
  if (!lion.sound) return
  const ac = ensureAudio()
  if (!ac) return
  opts = opts || {}
  const t0 = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = opts.type || 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur)
  const vol = opts.vol != null ? opts.vol : 0.16
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

// 播放一串音符(简单旋律)
function chime(notes) {
  if (!lion.sound) return
  let t = 0
  for (const n of notes) {
    setTimeout(() => beep(n.f, n.d || 0.12, { type: n.type, vol: n.vol, to: n.to }), t * 1000)
    t += n.d || 0.12
  }
}

const SFX = {
  pet: () => chime([{ f: 660, d: 0.1 }, { f: 880, d: 0.14 }]),
  feed: () => { beep(300, 0.08, { type: 'square', vol: 0.12 }); setTimeout(() => beep(250, 0.08, { type: 'square', vol: 0.12 }), 95) },
  greet: () => beep(720, 0.13, { to: 920 }),
  dance: () => chime([{ f: 523, d: 0.12 }, { f: 659, d: 0.12 }, { f: 784, d: 0.12 }, { f: 1047, d: 0.16 }]),
  roll: () => beep(500, 0.4, { to: 920, vol: 0.16 }),
  love: () => chime([{ f: 784, d: 0.12 }, { f: 988, d: 0.14 }, { f: 1319, d: 0.2 }]),
  angry: () => beep(230, 0.26, { to: 110, type: 'sawtooth', vol: 0.16 }),
  stomp: () => beep(110, 0.12, { type: 'square', vol: 0.22 }),
  think: () => beep(660, 0.1, { type: 'triangle', vol: 0.12 }),
  yawn: () => beep(420, 0.5, { to: 250, vol: 0.14 }),
  sleep: () => beep(320, 0.3, { to: 200, vol: 0.1 }),
  chase: () => beep(620, 0.1, { to: 760 }),
  hat: () => chime([{ f: 880, d: 0.1 }, { f: 1175, d: 0.14 }]),
  shake: () => beep(170, 0.32, { to: 85, type: 'triangle', vol: 0.14 }),
  stretch: () => beep(320, 0.55, { to: 560, vol: 0.1 }),
  pounce: () => beep(360, 0.22, { to: 780, type: 'triangle', vol: 0.16 }),
  bat: () => beep(540, 0.07, { type: 'square', vol: 0.14 }),
  spin: () => chime([{ f: 520, d: 0.1 }, { f: 660, d: 0.1 }, { f: 520, d: 0.1 }]),
  sneeze: () => { beep(1150, 0.18, { to: 520, type: 'triangle', vol: 0.18 }); setTimeout(() => beep(700, 0.1, { to: 400, vol: 0.1 }), 150) },
  peek: () => beep(880, 0.1, { to: 1120, vol: 0.1 }),
  shy: () => chime([{ f: 740, d: 0.12 }, { f: 620, d: 0.16 }]),
}

// 进入某状态时播放对应入场音效(跺脚的连续「咚」在 update 里处理)
function playStateSfx(s) {
  switch (s) {
    case 'happy': SFX.pet(); break
    case 'eat': SFX.feed(); break
    case 'greet': SFX.greet(); break
    case 'dance': SFX.dance(); break
    case 'roll': SFX.roll(); break
    case 'loveyou': SFX.love(); break
    case 'angry': SFX.angry(); break
    case 'think': SFX.think(); break
    case 'yawn': SFX.yawn(); break
    case 'sleep': SFX.sleep(); break
    case 'chase': SFX.chase(); break
    case 'shake': SFX.shake(); break
    case 'stretch': SFX.stretch(); break
    case 'tailchase': SFX.spin(); break
    case 'zoomies': SFX.chase(); break
    case 'peek': SFX.peek(); break
    case 'shy': SFX.shy(); break
  }
}

/* =========================================================
 * 2.6 氛围特效(雪 / 落叶 / 星空 / 花瓣,零素材)
 * =======================================================*/
let fxType = 'none' // none | snow | rain | leaf | petal | star | firefly
let particles = []
const FX_ORDER = ['none', 'snow', 'rain', 'leaf', 'petal', 'star', 'firefly']
const FX_NAME = { none: '关闭特效', snow: '下雪 ❄️', rain: '下雨 🌧️', leaf: '落叶 🍂', petal: '花瓣 🌸', star: '星空 ✨', firefly: '萤火虫 ✨' }
// 每种特效的生成速率与上限
const FX_SPAWN = {
  snow: { rate: 28, max: 75 },
  rain: { rate: 60, max: 130 },
  leaf: { rate: 28, max: 75 },
  petal: { rate: 28, max: 75 },
  star: { rate: 6, max: 42 },
  firefly: { rate: 4, max: 26 },
}

// 按季节 / 时间自动选默认特效
function autoFx() {
  const d = new Date()
  const m = d.getMonth()
  const h = d.getHours()
  // 冬季原本自动下雪,已按要求关闭「自动下雪」(仍可右键「✨ 氛围特效 → 下雪」手动开启)
  if (m >= 8 && m <= 10) return 'leaf' // 秋(9-11 月)
  if (m >= 5 && m <= 7 && (h >= 21 || h < 5)) return 'firefly' // 夏夜萤火虫
  if (h >= 22 || h < 6) return 'star' // 夜晚
  if (m >= 2 && m <= 4) return 'petal' // 春(3-5 月)
  return 'none'
}

// 直接设定氛围特效(含「关闭」),并把当前值回传主进程用于菜单勾选
function setFxType(type) {
  if (FX_ORDER.indexOf(type) < 0) type = 'none'
  fxType = type
  particles = []
  say(FX_NAME[fxType], 1.8)
  saveState()
  if (hasNative && window.petAPI.setFx) window.petAPI.setFx(fxType)
}

function cycleFx() {
  setFxType(FX_ORDER[(FX_ORDER.indexOf(fxType) + 1) % FX_ORDER.length])
}

function spawnParticle() {
  if (fxType === 'star') {
    return { kind: 'star', x: rand(0, W), y: rand(0, H * 0.7), size: rand(1.5, 3.5), life: 0, sway: rand(2.5, 5) }
  }
  if (fxType === 'firefly') {
    return { kind: 'firefly', x: rand(20, W - 20), y: rand(H * 0.2, H * 0.85), vx: rand(-10, 10), vy: rand(-8, 8), size: rand(1.8, 3), life: 0, ttl: rand(5, 9), pulse: rand(2, 3.5), wanderT: rand(0, 6) }
  }
  if (fxType === 'rain') {
    return { kind: 'rain', x: rand(-20, W), y: -12, vx: rand(8, 22), vy: rand(430, 560), len: rand(9, 16), life: 0 }
  }
  const big = fxType === 'leaf' || fxType === 'petal'
  return {
    kind: fxType,
    x: rand(0, W),
    y: -12,
    vx: rand(-18, 18),
    vy: fxType === 'leaf' ? rand(28, 55) : fxType === 'petal' ? rand(35, 65) : rand(45, 95),
    rot: rand(0, 6.28),
    vr: rand(-2.2, 2.2),
    size: fxType === 'snow' ? rand(2, 5) : big ? rand(6, 11) : rand(2, 5),
    sway: rand(1, 3),
    life: 0,
  }
}

function updateFx(dt) {
  const cfg = FX_SPAWN[fxType]
  if (cfg) {
    let spawn = cfg.rate * dt
    while (spawn > 0 && particles.length < cfg.max) {
      if (Math.random() < spawn) particles.push(spawnParticle())
      spawn -= 1
    }
  }
  const wind = Math.sin(now * 0.25) * 16 + Math.sin(now * 0.07) * 10 // 缓慢起伏的风
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life += dt
    if (p.kind === 'star') {
      if (p.life > 6) particles.splice(i, 1)
      continue
    }
    if (p.kind === 'firefly') {
      // 萤火虫:缓慢游荡 + 到寿命淡出
      p.x = clamp(p.x + p.vx * dt + Math.sin((p.life + p.wanderT) * 0.9) * 8 * dt, 10, W - 10)
      p.y = clamp(p.y + p.vy * dt + Math.cos((p.life + p.wanderT) * 0.7) * 6 * dt, H * 0.15, H - 14)
      if (p.life > p.ttl) particles.splice(i, 1)
      continue
    }
    // 飘落类(snow / rain / leaf / petal):受风影响,雨受风较小
    const gust = p.kind === 'rain' ? wind * 0.4 : wind
    const swayTerm = p.sway ? Math.sin(p.life * p.sway) * 12 : 0
    p.x += (p.vx + gust + swayTerm) * dt
    p.y += p.vy * dt
    if (p.vr) p.rot += p.vr * dt
    if (p.y > H + 16) particles.splice(i, 1)
  }
}

// 稳定地给粒子选个颜色(按 x 定,避免每帧闪烁)
function fxColor(arr, p) {
  return arr[Math.abs(p.x | 0) % arr.length]
}

function drawSparkle(r) {
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    ctx.lineTo(Math.cos(a + 0.5) * r * 0.4, Math.sin(a + 0.5) * r * 0.4)
  }
  ctx.fill()
}

function drawFx() {
  for (const p of particles) {
    if (p.kind === 'star') {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(p.life * p.sway))
      ctx.save()
      ctx.globalAlpha = tw * clamp(p.life, 0, 1) * clamp(6 - p.life, 0, 1)
      ctx.fillStyle = '#FFF3B0'
      ctx.translate(p.x, p.y)
      drawSparkle(p.size)
      ctx.restore()
      continue
    }
    if (p.kind === 'firefly') {
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(p.life * p.pulse))
      const fade = clamp(p.life, 0, 1) * clamp(p.ttl - p.life, 0, 1)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.globalAlpha = tw * fade
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 4)
      g.addColorStop(0, 'rgba(214,255,140,0.9)')
      g.addColorStop(1, 'rgba(180,230,90,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, p.size * 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = fade
      ctx.fillStyle = '#FBFFC0'
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      continue
    }
    if (p.kind === 'rain') {
      const n = Math.hypot(p.vx, p.vy) || 1
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = 'rgba(170,200,235,0.8)'
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - (p.vx / n) * p.len, p.y - (p.vy / n) * p.len)
      ctx.stroke()
      ctx.restore()
      continue
    }
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    if (p.kind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath()
      ctx.arc(0, 0, p.size, 0, Math.PI * 2)
      ctx.fill()
    } else if (p.kind === 'leaf') {
      ctx.fillStyle = fxColor(['#E0792B', '#C9621E', '#D89A3A'], p)
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(110,60,16,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-p.size, 0)
      ctx.lineTo(p.size, 0)
      ctx.stroke()
    } else if (p.kind === 'petal') {
      ctx.fillStyle = fxColor(['#FFC1D6', '#FFD6E6', '#FFB3CC'], p)
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/* =========================================================
 * 2.65 玩具实体:蝴蝶 & 毛线球(全局,同一时间各最多一个)
 * =======================================================*/
let butterfly = null // { owner, t, state: 'fly'|'flee'|'land', x, y, baseY, vx, vy }
let ball = null // { owner, x, vx, rot, r, alive, fade, idleT }
let disc = null // 衔回飞盘 { owner, x, y, vx, vy, rot, state: 'fly'|'ground'|'carried'|'drop', settleT, returnX }

function spawnButterfly(owner) {
  const baseY = groundY - rand(70, 120)
  butterfly = {
    owner,
    t: 0,
    state: 'fly',
    x: clamp(owner.x + owner.facing * rand(150, 230), 60, W - 60),
    y: baseY,
    baseY,
    vx: 0,
    vy: 0,
  }
}

function updateButterfly(dt) {
  if (!butterfly) return
  const b = butterfly
  b.t += dt
  if (b.state === 'fly') {
    // 不规则飘飞:左右慢漂 + 上下扑闪
    b.x = clamp(b.x + (Math.sin(b.t * 1.1) * 34 + Math.sin(b.t * 0.43) * 22) * dt, 50, W - 50)
    b.y = b.baseY + Math.sin(b.t * 2.2) * 16 + Math.sin(b.t * 5.1) * 4
    if (b.t > 12) {
      // 飞了太久没人扑 → 自己飞走
      b.state = 'flee'
      b.vx = rand(-50, 50)
      b.vy = -110
    }
  } else if (b.state === 'flee') {
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.vy -= 70 * dt
    if (b.y < -40 || b.x < -40 || b.x > W + 40) butterfly = null
  } else if (b.state === 'land') {
    // 停在宠物鼻尖上
    const o = b.owner
    b.x = o.x + o.facing * 4 * o.size
    b.y = o.y - 92 * o.size
    if (b.t > 2.6) {
      b.state = 'flee'
      b.vx = rand(-60, 60)
      b.vy = -130
      b.t = 0
    }
  }
}

function spawnBall(owner) {
  ball = {
    owner,
    x: clamp(owner.x + owner.facing * 130, 60, W - 60),
    vx: 0,
    rot: 0,
    r: 14,
    alive: true,
    fade: 1,
    idleT: 0,
  }
}

function updateBall(dt) {
  if (!ball) return
  if (!ball.alive) {
    ball.fade -= dt * 1.6
    if (ball.fade <= 0) ball = null
    return
  }
  ball.x += ball.vx * dt
  ball.vx *= Math.pow(0.4, dt) // 滚动摩擦
  if (ball.x < 40) { ball.x = 40; ball.vx = Math.abs(ball.vx) * 0.7 }
  if (ball.x > W - 40) { ball.x = W - 40; ball.vx = -Math.abs(ball.vx) * 0.7 }
  ball.rot += (ball.vx / ball.r) * dt
  // 主人不玩了(被拖走 / 干别的去了)→ 球待一会儿自己消失
  if (ball.owner && ball.owner.state === 'playball') ball.idleT = 0
  else ball.idleT += dt
  if (ball.idleT > 6) ball.alive = false
}

// 衔回飞盘:抛出 → 落地 → 被叼起 → 送回你身边放下
function updateDisc(dt) {
  if (!disc) return
  const d = disc
  d.rot += dt * (d.state === 'carried' ? 2.5 : 11)
  if (d.state === 'fly') {
    d.x += d.vx * dt
    d.y += d.vy * dt
    d.vy += 1400 * dt
    if (d.x < 40) { d.x = 40; d.vx = Math.abs(d.vx) * 0.5 }
    if (d.x > W - 40) { d.x = W - 40; d.vx = -Math.abs(d.vx) * 0.5 }
    const gy = groundY - 6
    if (d.y >= gy) { d.y = gy; d.vx = 0; d.vy = 0; d.state = 'ground'; d.settleT = 0 }
  } else if (d.state === 'ground') {
    d.settleT += dt
    if (d.settleT > 12) disc = null // 一直没人来捡 → 自己消失
  } else if (d.state === 'carried') {
    const o = d.owner
    if (!o) { disc = null; return }
    d.x = o.x + o.facing * 24 * o.size
    d.y = o.y - 60 * o.size
  } else if (d.state === 'drop') {
    d.settleT += dt
    if (d.settleT > 3.5) disc = null
  }
}

/* =========================================================
 * 2.7 记忆(localStorage 存档,重启后恢复)
 * =======================================================*/
const SAVE_KEY = 'desktopLionState'
let saveTimer = 5

function saveState() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        pets: pets.map((p) => ({ x: p.x, mood: p.mood, hunger: p.hunger, bond: p.bond, accessory: p.accessory, species: p.species })),
        sound: pets[0] ? pets[0].sound : false,
        fx: fxType,
        stats: showStats,
        t: Date.now(),
      })
    )
  } catch (e) {}
}

function loadState() {
  let s = null
  try {
    s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch (e) {
    s = null
  }
  if (!s) return
  if (s.fx) fxType = s.fx
  if (typeof s.stats === 'boolean') showStats = s.stats
  const offlineMin = s.t ? (Date.now() - s.t) / 60000 : 0
  // 恢复所有宠物(兼容旧版单只存档:s.x/s.species)
  const list = Array.isArray(s.pets) ? s.pets : s.x != null ? [{ x: s.x, mood: s.mood, hunger: s.hunger, accessory: s.accessory, hat: s.hat, species: s.species }] : null
  if (list && list.length) {
    pets.length = 0
    for (const sp of list) {
      const p = makePet(sp.species, typeof sp.x === 'number' ? clamp(sp.x, 80, W - 80) : null)
      if (typeof sp.mood === 'number') p.mood = clamp(sp.mood - offlineMin * 0.8, 0, 100)
      if (typeof sp.hunger === 'number') p.hunger = clamp(sp.hunger - offlineMin * 1.5, 0, 100)
      p.bond = typeof sp.bond === 'number' ? clamp(sp.bond, 0, 100) : 0
      p.bondLevel = bondLevelOf(p.bond)
      p.accessory = sp.accessory || (sp.hat ? 'santa' : 'none') // 兼容旧版 hat 存档
      p.sound = !!s.sound
      pets.push(p)
    }
    lion = activePet = pets[0]
  }
  if (offlineMin > 10) {
    setTimeout(() => {
      lion = pets[0]
      say(pick(['你终于回来啦~', '想我了没?', '饿了好久…']), 3.2)
    }, 1000)
  }
}

/* =========================================================
 * 3. 行为切换
 * =======================================================*/
function setState(s) {
  if (lion.state === s) return
  lion.state = s
  lion.stateTime = 0
  playStateSfx(s)
}

function startWalk(tx) {
  lion.targetX = clamp(tx, 80, W - 80)
  lion.facing = lion.targetX >= lion.x ? 1 : -1
  setState('walk')
}

function hop(power = 360) {
  if (lion.onGround) {
    lion.vy = -power
    lion.onGround = false
  }
}

function doFeed() {
  if (lion.state === 'sleep') wake()
  lion.hunger = clamp(lion.hunger + 34, 0, 100)
  lion.foodT = 0
  addBond(lion, 3)
  setState('eat')
  say(pick(['好吃!', '谢谢款待~', '再来一块?', '嗯~满足']))
}

function doPet() {
  // 短时间内被连戳多次 → 戳烦了,生气
  clickTimes.push(now)
  clickTimes = clickTimes.filter((t) => now - t < 2.5)
  if (clickTimes.length >= 5) {
    clickTimes.length = 0
    if (lion.state === 'sleep') wake()
    doAngry()
    say(pick(['别戳啦!', '烦死啦~', '哼!不许戳!']), 2.2)
    return
  }
  if (lion.state === 'sleep') wake()
  lion.mood = clamp(lion.mood + 22, 0, 100)
  addBond(lion, 4)
  setState('happy')
  lion.hopCount = 2
  hop(330)
  spawnHearts(3)
  say(pick(['好开心~', '最喜欢你啦!', '嘿嘿嘿', '再摸摸~']))
}

// ---- 玩耍动作 ----
function doDance() {
  if (lion.state === 'sleep') wake()
  lion.mood = clamp(lion.mood + 8, 0, 100)
  setState('dance')
  say(pick(['看我跳舞~', '🎵 啦啦啦', '一起摇摆!', '动次打次~']), 3.6)
}

function doRoll() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('roll')
  lion.rollAngle = 0
  lion.facing = mouseX >= lion.x ? 1 : -1
  say(pick(['咕噜噜~', '看我打滚!', '滚啊滚~']), 1.6)
}

function doChase() {
  if (lion.state === 'sleep') wake()
  setState('chase')
  say(pick(['等等我~', '抓住你啦!', '追追追!', '别跑呀~']), 2)
}

function doLoveYou() {
  if (lion.state === 'sleep') wake()
  lion.mood = clamp(lion.mood + 15, 0, 100)
  addBond(lion, 3)
  setState('loveyou')
  spawnHearts(2)
  say(pick(['最喜欢你了~', '么么哒', '爱你哟!']), 1.8)
}

// ---- 情绪动作 ----
function doAngry() {
  if (lion.state === 'sleep') wake()
  lion.mood = clamp(lion.mood - 4, 0, 100)
  setState('angry')
  say(pick(['哼!', '生气了!', '不理你了!', '气鼓鼓~']), 2.4)
}

function doStomp() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('stomp')
  say(pick(['跺跺跺!', '哼哼!', '不依不饶~', '看我跺脚!']), 2.2)
}

function doThink() {
  if (lion.state === 'sleep') wake()
  setState('think')
  say(pick(['让我想想…', '嗯…', '这是什么呢?', '到底选哪个…']), 3)
}

function doYawn() {
  if (lion.state === 'sleep') wake()
  setState('yawn')
  say(pick(['啊~好困…', '哈~欠~', '困死了…']), 2.4)
}

// ---- 新增:好奇张望 / 打喷嚏 / 害羞 ----
function doPeek() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('peek')
  say(pick(['咦?什么声音?', '那是什么?', '有人吗~', '四处看看…']), 2.2)
}
function doSneeze() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('sneeze')
  lion._sneezed = false
  say(pick(['啊…啊…', '鼻子好痒…', '唔…要打喷嚏了…']), 1.1)
}
function doShy() {
  if (lion.state === 'sleep') wake()
  lion.mood = clamp(lion.mood + 6, 0, 100)
  addBond(lion, 2)
  setState('shy')
  say(pick(['讨厌啦~人家害羞嘛', '哎呀…别盯着我看啦', '嘿嘿…羞羞', '人家会不好意思的…']), 2.6)
}

/* ---- 拟真自主小动作(自己玩)---- */
function doStretch(next) {
  if (lion.state === 'sleep') wake()
  setState('stretch')
  lion.nextAuto = next != null ? next : Math.random() < 0.5 ? 'shake' : ''
  say(pick(['唔——伸个懒腰~', '嗯~~舒展!', '咿——呀~']), 2)
}

function doShake() {
  if (lion.state === 'sleep') wake()
  setState('shake')
  say(pick(['抖抖毛~', '噗噗噗!', '抖擞精神!']), 1.4)
}

function doGroom() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('groom')
  say(pick(['舔舔爪子~', '理理毛…', '要香香的~']), 2.2)
}

function doScratch() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('scratch')
  say(pick(['痒痒痒…', '挠一挠~', '啊~就是这儿']), 2)
}

function doTailChase() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('tailchase')
  lion.targetX = clamp(lion.x, 90, W - 90) // 原地转圈的锚点
  say(pick(['尾巴别跑!', '今天一定抓到你!', '转转转~']), 2.2)
}

function doZoomies() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('zoomies')
  lion.dashLeft = 3
  const dir = lion.x < W / 2 ? 1 : -1
  lion.targetX = clamp(lion.x + dir * rand(280, 460), 80, W - 80)
  say(pick(['冲鸭——!', '跑起来!!', '拦不住我~']), 1.8)
}

function doSniff() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  setState('sniff')
  say(pick(['闻闻…什么味儿?', '嗅嗅嗅…', '这里有味道!']), 2)
}

function doPounce() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  if (!butterfly) spawnButterfly(lion)
  butterfly.owner = lion
  setState('stalk')
  say(pick(['嘘…有蝴蝶!', '悄悄地…', '别动……']), 1.8)
}

function doPlayBall() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  if (!ball || !ball.alive) spawnBall(lion)
  ball.owner = lion
  lion.batCount = 0
  setState('playball')
  say(pick(['毛线球!', '玩球球~', '看我的!']), 1.6)
}

// 衔回:抛出飞盘,宠物跑去叼住,再送回你(鼠标)身边放下
function doFetch() {
  if (lion.state === 'sleep') wake()
  if (!lion.onGround) return
  const dir = lion.x < W / 2 ? 1 : -1 // 朝空旷的一侧抛
  disc = {
    owner: lion,
    x: lion.x + dir * 18 * lion.size,
    y: lion.y - 70 * lion.size,
    vx: dir * rand(380, 480),
    vy: -rand(520, 600),
    rot: 0,
    state: 'fly',
    settleT: 0,
    returnX: lion.x,
  }
  setState('fetch')
  say(pick(['飞盘!我去捡!', '看我的!', '交给我~']), 1.8)
  beep(680, 0.12, { to: 880 })
}

// 自主玩耍动作池:按物种加偏好(猫爱理毛扑蝶,狗爱疯跑嗅地,狮子爱伸懒腰扑猎)
const SELF_PLAY = {
  stretch: doStretch,
  shake: doShake,
  groom: doGroom,
  scratch: doScratch,
  sniff: doSniff,
  tailchase: doTailChase,
  zoomies: doZoomies,
  pounce: doPounce,
  playball: doPlayBall,
}
const SELF_PLAY_BIAS = {
  cat: ['groom', 'pounce', 'tailchase', 'stretch', 'playball'],
  dog: ['zoomies', 'sniff', 'tailchase', 'playball', 'shake'],
  lion: ['stretch', 'pounce', 'shake', 'playball', 'scratch'],
  rabbit: ['zoomies', 'sniff', 'stretch', 'tailchase', 'shake'],
  panda: ['groom', 'stretch', 'scratch', 'sniff', 'playball'],
}
function doSelfPlay() {
  const keys = Math.random() < 0.55 ? SELF_PLAY_BIAS[lion.species] || SELF_PLAY_BIAS.lion : Object.keys(SELF_PLAY)
  SELF_PLAY[pick(keys)]()
}

// 配饰换装:无 → 圣诞帽 → 墨镜 → 围巾 → 蝴蝶结 → 皇冠 → 无
const ACCESSORY_ORDER = ['none', 'santa', 'glasses', 'scarf', 'bow', 'crown']
const ACCESSORY_NAME = {
  none: '',
  santa: '圣诞帽 🎄',
  glasses: '墨镜 😎',
  scarf: '围巾 🧣',
  bow: '蝴蝶结 🎀',
  crown: '皇冠 👑',
}
function cycleAccessory() {
  const cur = lion.accessory || 'none'
  lion.accessory = ACCESSORY_ORDER[(ACCESSORY_ORDER.indexOf(cur) + 1) % ACCESSORY_ORDER.length]
  if (lion.state === 'sleep') wake()
  SFX.hat()
  say(lion.accessory === 'none' ? '配饰摘掉啦~' : '换上' + ACCESSORY_NAME[lion.accessory] + '!', 2)
  saveState()
}

function toggleSound() {
  const v = !lion.sound
  for (const p of pets) p.sound = v // 全局统一开关
  if (v) {
    ensureAudio()
    beep(880, 0.12, { to: 1150 }) // 开启时「叮」一声确认
  }
  say(v ? '🔊 音效开啦~' : '🔇 安静模式', 1.8)
}

// 显示/隐藏状态面板(心情 / 饱腹 / 亲密)
function toggleStats() {
  showStats = !showStats
  say(showStats ? '看看我的状态~ 📊' : '状态面板收起啦~', 1.8)
  saveState()
}

// 番茄钟专注:开启后宠物安静陪伴(不乱跑、不闹腾、不喊饿),头顶走倒计时;
// 到点欢呼提醒你休息。可在右键菜单选时长(默认 25 分钟),专注中再点可提前结束。
function startFocus(min) {
  focusDurMin = min > 0 ? min : 25
  focusActive = true
  focusEndT = now + focusDurMin * 60
  for (const p of pets) {
    p.state = 'focus'
    p.stateTime = 0
    p.facing = mouseX > p.x ? 1 : -1
  }
  lion = activePet
  say(`一起专注 ${focusDurMin} 分钟,加油!⏳`, 3)
  beep(740, 0.12, { to: 980 })
  if (hasNative && window.petAPI.setFocusing) window.petAPI.setFocusing(true)
}

function toggleFocus(min) {
  if (focusActive) endFocus(false)
  else startFocus(min)
}

function endFocus(done) {
  if (!focusActive) return
  focusActive = false
  for (const p of pets) { p.state = 'idle'; p.stateTime = 0; p.idleTimer = rand(1, 3) }
  lion = activePet
  if (hasNative && window.petAPI.setFocusing) window.petAPI.setFocusing(false)
  if (done) {
    doDance()
    say('🎉 专注完成!起来活动一下、喝口水吧~', 3.6)
    chime([{ f: 660, d: 0.12 }, { f: 880, d: 0.12 }, { f: 1047, d: 0.14 }, { f: 1319, d: 0.18 }])
  } else {
    say('好,先不专注啦~', 1.6)
  }
}

// 关怀提醒:非专注时,每隔一段时间轮换提醒喝水 / 起身 / 护眼 / 伸展
const CARE_LINES = [
  '坐久啦~站起来动动吧 🧘',
  '喝口水,补充点水分 💧',
  '看看远处,让眼睛歇一歇 👀',
  '伸个懒腰,转转肩膀~',
]
function maybeCare(dt) {
  careTimer -= dt
  if (careTimer > 0) return
  careTimer = rand(35, 45) * 60
  if (focusActive) return
  const p = pets[0]
  if (!p || p.state === 'sleep') return
  lion = p
  say(CARE_LINES[careIdx % CARE_LINES.length], 3.4)
  careIdx++
  lion = activePet
}

// 切换种类:狮子 → 猫 → 狗 → 兔 → 熊猫 → 狮子
function cycleSpecies() {
  const order = ['lion', 'cat', 'dog', 'rabbit', 'panda']
  lion.species = order[(order.indexOf(lion.species) + 1) % order.length]
  const lines = { lion: '我是小狮子~ 🦁', cat: '喵~我是小猫 🐱', dog: '汪!我是小狗 🐶', rabbit: '蹦蹦~我是小兔 🐰', panda: '滚滚~我是熊猫 🐼' }
  if (lion.state === 'sleep') wake()
  say(lines[lion.species], 2.2)
  spawnHearts(2)
  saveState()
}

function wake() {
  if (lion.state === 'sleep') {
    setState('idle')
    lion.idleTimer = rand(2, 4)
    say(pick(['呼啊~睡醒啦', '唔…起来了']))
    // 像真动物一样:睡醒大概率先伸个懒腰,再抖抖毛
    if (Math.random() < 0.65) doStretch(Math.random() < 0.6 ? 'shake' : '')
  }
}

function spawnHearts(n) {
  for (let i = 0; i < n; i++) {
    lion.hearts.push({
      x: lion.x + rand(-20, 20),
      y: lion.y - 120 * lion.size + rand(-10, 10),
      vx: rand(-18, 18),
      vy: rand(-50, -32),
      life: 0,
      ttl: rand(0.9, 1.4),
    })
  }
}

// 亲密度:0-35 陌生 / 35-70 熟悉 / 70-100 亲密 / 100 形影不离
function bondLevelOf(b) {
  return b >= 100 ? 3 : b >= 70 ? 2 : b >= 35 ? 1 : 0
}
// 给某只宠物增加亲密度;跨越等级阈值时庆祝一次
function addBond(p, amt) {
  if (!p) return
  p.bond = clamp((p.bond || 0) + amt, 0, 100)
  const lv = bondLevelOf(p.bond)
  if (lv > (p.bondLevel || 0)) {
    p.bondLevel = lv
    const cur = lion
    lion = p
    say(['', '我们越来越熟啦~ 🤝', '最喜欢和你在一起!💛', '永远在一起哦~ ❤️'][lv] || '亲密度提升!', 2.8)
    spawnHearts(3)
    lion = cur
  }
}

// 受惊一跳(鼠标猛地划过身上时)
function getStartled() {
  if (now < startleCdT) return
  startleCdT = now + 3
  if (lion.state === 'sleep') wake()
  hop(300)
  lion.sx = 1.4
  lion.sy = 0.68
  beep(950, 0.12, { to: 1500, type: 'triangle' })
  say(pick(['哇!', '吓我一跳~', '别突然戳我啦!']), 1.2)
}

// 待机时根据「场景」(时间 / 鼠标 / 心情 / 饥饿)自主决定下一个动作
function decideNextAction() {
  const hour = new Date().getHours()
  const mouseIdle = now - lastMouseMoveT
  const r = Math.random()

  // 深夜:更容易犯困
  if (hour >= 23 || hour < 6) {
    if (r < 0.5) { setState('sleep'); say(pick(['夜深了…zzz', '好困,睡啦~']), 1.6); return }
    if (r < 0.66) { doYawn(); return }
  }
  // 鼠标很久没动(像是离开了):自己玩爽 / 发呆 / 睡
  if (mouseIdle > 30) {
    if (r < 0.22) { setState('sleep'); say(pick(['没人陪…睡会儿', '好安静呀…']), 1.6); return }
    if (r < 0.34) { doYawn(); return }
    if (r < 0.85) { doSelfPlay(); return } // 没人看着,玩自己的去咯
    startWalk(rand(80, W - 80)); return
  }
  // 很饿:跺脚 / 可怜地要吃的
  if (lion.hunger < 25) {
    if (r < 0.5) { doStomp(); say(pick(['我要吃的!', '快喂我~', '饿饿饿!']), 2.2); return }
    doThink(); say(pick(['有吃的吗…', '好想吃东西…']), 2.4); return
  }
  // 心情很好:尽情玩
  if (lion.mood > 70) {
    if (r < 0.22) { doDance(); return }
    if (r < 0.38) { doRoll(); return }
    if (r < 0.5) { doLoveYou(); return }
    doSelfPlay(); return
  }
  // 心情低落:没精神
  if (lion.mood < 30) {
    if (r < 0.4) { doYawn(); return }
    if (r < 0.7) { doThink(); return }
    setState('sleep'); say(pick(['没精神…', '睡一会儿吧…']), 1.6); return
  }
  // 普通心情:溜达 + 各种拟真小动作
  if (r < 0.3) { startWalk(rand(80, W - 80)); return }
  if (r < 0.38) { doDance(); return }
  if (r < 0.46) { doRoll(); return }
  if (r < 0.54) { doThink(); return }
  if (r < 0.92) { doSelfPlay(); return }
  lion.idleTimer = rand(2.5, 5)
}

// 按时段问候(切换到新时段时打个招呼)
function timeSlot(h) {
  if (h < 6) return 0
  if (h < 11) return 1
  if (h < 14) return 2
  if (h < 18) return 3
  if (h < 22) return 4
  return 5
}
function maybeGreetByTime() {
  const slot = timeSlot(new Date().getHours())
  if (slot === lastTimeSlot) return
  lastTimeSlot = slot
  const msg = [
    pick(['夜深了,还不睡呀~', '这么晚还在忙呀…']),
    pick(['早上好~新的一天!', '早安!元气满满~']),
    pick(['中午啦,该吃饭咯~', '午饭时间到!']),
    pick(['下午好~继续加油!', '喝口水休息下吧~']),
    pick(['晚上好呀~', '忙了一天辛苦啦~']),
    pick(['不早咯,早点休息~', '别熬太晚哦~']),
  ][slot]
  say(msg, 3.5)
  if (slot === 1) doYawn() // 早晨先伸个懒腰打哈欠
}

/* =========================================================
 * 4. 鼠标 / 交互 / 鼠标穿透
 * =======================================================*/
const hasNative = typeof window.petAPI !== 'undefined'

let mouseX = -9999
let mouseY = -9999
let overPet = false
let dragging = false
let dragDX = 0
let dragDY = 0
let pressX = 0
let pressY = 0
let pressTime = 0
let movedWhilePressed = false
let dragPet = null // 当前被拖拽的宠物

// 场景化自动行为:鼠标速度 / 空闲、连击、时段
let lastMouseMoveT = -999
let mouseSpeed = 0 // 估算的鼠标速度(px/s,平滑)
let clickTimes = [] // 最近的点击时刻(连戳检测)
let startleCdT = 0 // 受惊冷却
let chaseCdT = 0 // 自发追逐冷却
let slotCheckT = 15 // 时段问候检查计时
let lastTimeSlot = -1

// 专注模式(番茄钟)& 关怀提醒
let focusActive = false // 是否处于专注陪伴中
let focusEndT = 0 // 专注结束时刻(秒,performance.now 基准)
let focusDurMin = 25 // 一个番茄钟时长(分钟)
let careTimer = 40 * 60 // 久坐 / 喝水 / 护眼提醒倒计时(秒)
let careIdx = 0 // 关怀提醒轮换索引
let showStats = false // 是否显示状态面板(心情 / 饱腹 / 亲密)

// 命中检测:鼠标是否落在小狮子身上(用一个椭圆包围盒)
function hitTest(mx, my) {
  const cx = lion.x
  const cy = lion.y - 62 * lion.size
  const rx = 64 * lion.size
  const ry = 76 * lion.size
  const dx = (mx - cx) / rx
  const dy = (my - cy) / ry
  return dx * dx + dy * dy <= 1
}

// 多宠物命中:返回鼠标命中的那只(优先选更靠前/y 更大的)
function hitPetAt(mx, my) {
  let hit = null
  for (const p of pets) {
    const cx = p.x
    const cy = p.y - 62 * p.size
    const rx = 64 * p.size
    const ry = 76 * p.size
    const dx = (mx - cx) / rx
    const dy = (my - cy) / ry
    if (dx * dx + dy * dy <= 1 && (!hit || p.y > hit.y)) hit = p
  }
  return hit
}

function refreshIgnoreMouse() {
  const want = dragging || overPet
  if (hasNative) window.petAPI.setIgnoreMouse(!want)
  document.body.style.cursor = dragging ? 'grabbing' : want ? 'grab' : 'default'
}

window.addEventListener('mousemove', (e) => {
  const nx = e.clientX
  const ny = e.clientY
  const mdt = now - lastMouseMoveT
  if (mdt > 0 && mdt < 0.2 && mouseX > -9000) {
    const inst = Math.hypot(nx - mouseX, ny - mouseY) / mdt
    mouseSpeed = mouseSpeed * 0.5 + inst * 0.5
  }
  lastMouseMoveT = now
  mouseX = nx
  mouseY = ny

  if (dragging && dragPet) {
    dragPet.x = clamp(mouseX + dragDX, 40, W - 40)
    dragPet.y = clamp(mouseY + dragDY, 120, H - 4)
    if (Math.abs(mouseX - pressX) + Math.abs(mouseY - pressY) > 5) movedWhilePressed = true
    return
  }

  const o = hitPetAt(mouseX, mouseY) != null
  if (o !== overPet) {
    overPet = o
    refreshIgnoreMouse()
  }
})

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  const p = hitPetAt(e.clientX, e.clientY)
  if (!p) return
  dragPet = p
  activePet = p
  lion = p
  dragging = true
  movedWhilePressed = false
  pressX = e.clientX
  pressY = e.clientY
  pressTime = now
  dragDX = p.x - e.clientX
  dragDY = p.y - e.clientY
  if (p.state === 'sleep') wake()
  setState('drag')
  p.vy = 0
  refreshIgnoreMouse()
})

window.addEventListener('mouseup', (e) => {
  if (!dragging) return
  dragging = false
  if (dragPet) lion = dragPet
  const quickTap = now - pressTime < 0.28 && !movedWhilePressed
  if (quickTap) {
    doPet() // 点一下 → 摸头
  } else {
    say(pick(['哎哟~', '稳稳落地', '嘿!']), 1.4)
    setState('idle')
    lion.idleTimer = rand(1.5, 3)
  }
  dragPet = null
  overPet = hitPetAt(e.clientX, e.clientY) != null
  refreshIgnoreMouse()
})

// 右键弹出原生菜单(仅在 Electron 里)
window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  const p = hitPetAt(e.clientX, e.clientY)
  if (p) {
    activePet = p
    lion = p
    if (hasNative) window.petAPI.showMenu()
  }
})

// 双击 → 喂食
window.addEventListener('dblclick', (e) => {
  const p = hitPetAt(e.clientX, e.clientY)
  if (p) {
    activePet = p
    lion = p
    doFeed()
  }
})

if (hasNative) {
  window.petAPI.onMenuAction((action) => {
    lion = activePet // 菜单动作作用于右键选中的那只
    if (action === 'feed') doFeed()
    else if (action === 'pet') doPet()
    else if (action === 'sleep') {
      setState('sleep')
      say('那我睡啦…', 1.6)
    } else if (action === 'come') {
      const tx = mouseX > 0 ? mouseX : W / 2
      startWalk(tx)
      say(pick(['来啦来啦~', '等等我!']))
    } else if (action === 'dance') doDance()
    else if (action === 'roll') doRoll()
    else if (action === 'chase') doChase()
    else if (action === 'fetch') doFetch()
    else if (action === 'loveyou') doLoveYou()
    else if (action === 'angry') doAngry()
    else if (action === 'stomp') doStomp()
    else if (action === 'think') doThink()
    else if (action === 'yawn') doYawn()
    else if (action === 'hat') cycleAccessory()
    else if (action === 'pounce') doPounce()
    else if (action === 'playball') doPlayBall()
    else if (action === 'tailchase') doTailChase()
    else if (action === 'zoomies') doZoomies()
    else if (action === 'stretch') doStretch()
    else if (action === 'shake') doShake()
    else if (action === 'groom') doGroom()
    else if (action === 'scratch') doScratch()
    else if (action === 'sniff') doSniff()
    else if (action === 'sound') toggleSound()
    else if (action === 'fx') cycleFx()
    else if (action.slice(0, 3) === 'fx:') setFxType(action.slice(3))
    else if (action === 'stats') toggleStats()
    else if (action === 'species') cycleSpecies()
    else if (action === 'focus') toggleFocus()
    else if (action.slice(0, 6) === 'focus:') startFocus(parseInt(action.slice(6), 10))
    else if (action === 'addpet') addPet()
    else if (action === 'removepet') removePet()
  })
}

/* =========================================================
 * 5. 每帧更新
 * =======================================================*/
function update(dt) {
  updateButterfly(dt)
  updateBall(dt)
  updateDisc(dt)
  if (focusActive && now >= focusEndT) endFocus(true) // 番茄钟到点
  maybeCare(dt)
  updateInteractions(dt)
  for (let _i = 0; _i < pets.length; _i++) {
    lion = pets[_i]
    updatePet(dt, _i === 0)
  }
  lion = activePet
}

function updatePet(dt, isFirst) {
  lion.stateTime += dt
  lion.breathe += dt * 2.2
  lion.manePhase += dt * 1.3
  lion.tailPhase += dt * 2.6

  // ---- 状态值随时间衰减 ----
  lion.hunger = clamp(lion.hunger - dt * 0.55, 0, 100)
  if (lion.state === 'sleep') {
    lion.mood = clamp(lion.mood + dt * 1.2, 0, 100) // 睡觉回复心情
  } else {
    lion.mood = clamp(lion.mood - dt * 0.4, 0, 100)
  }
  addBond(lion, dt * 0.05) // 陪伴本身也会一点点加深亲密

  // ---- 垂直物理(重力 / 跳跃 / 落地)----
  if (lion.state !== 'drag') {
    if (!lion.onGround || lion.vy !== 0 || lion.y < groundY) {
      lion.vy += 1500 * dt
      lion.y += lion.vy * dt
      if (lion.y >= groundY) {
        lion.y = groundY
        if (!lion.onGround && lion.vy > 120) {
          // 落地挤压
          lion.sx = 1.28
          lion.sy = 0.72
          if (lion.hopCount > 0) {
            lion.hopCount--
            hop(300)
          }
        }
        lion.vy = 0
        lion.onGround = true
      }
    }
  }

  // squash & stretch 朝 1 回弹
  lion.sx += (1 - lion.sx) * Math.min(1, dt * 12)
  lion.sy += (1 - lion.sy) * Math.min(1, dt * 12)

  // ---- 眨眼 ----
  if (lion.blinking) {
    lion.blinkT += dt
    const d = 0.13
    lion.eyeOpen = Math.abs(lion.blinkT / d - 0.5) * 2 // 1→0→1
    if (lion.blinkT >= d) {
      lion.blinking = false
      lion.eyeOpen = 1
    }
  } else {
    lion.blinkTimer -= dt
    if (lion.blinkTimer <= 0 && lion.state !== 'sleep') {
      lion.blinking = true
      lion.blinkT = 0
      lion.blinkTimer = rand(2.2, 5.5)
    }
  }

  // ---- 视线:瞳孔朝鼠标(潜行/扑时死死盯住蝴蝶,玩球时盯球)----
  const headSx = lion.x
  const headSy = lion.y - 80 * lion.size
  let lookX = mouseX > -9000 ? mouseX : null
  let lookY = mouseY
  if ((lion.state === 'stalk' || lion.state === 'pounce') && butterfly) {
    lookX = butterfly.x
    lookY = butterfly.y
  } else if (lion.state === 'playball' && ball) {
    lookX = ball.x
    lookY = groundY - 10
  } else if (lion.state === 'fetch' && disc) {
    lookX = disc.x
    lookY = disc.y
  }
  let tgx = 0
  let tgy = 0
  if (lookX != null && lion.state !== 'sleep') {
    const dx = lookX - headSx
    const dy = lookY - headSy
    const len = Math.hypot(dx, dy) || 1
    tgx = clamp(dx / len, -1, 1)
    tgy = clamp(dy / len, -1, 1)
  }
  lion.gazeX += (tgx - lion.gazeX) * Math.min(1, dt * 8)
  lion.gazeY += (tgy - lion.gazeY) * Math.min(1, dt * 8)

  // ---- 全局逻辑只在第一只时跑一次:鼠标速度衰减 + 时段问候 ----
  if (isFirst) {
    if (now - lastMouseMoveT > 0.15) mouseSpeed = 0
    slotCheckT -= dt
    if (slotCheckT <= 0) {
      slotCheckT = 15
      maybeGreetByTime()
    }
  }

  // ---- 鼠标场景反应:受惊 / 好奇追 / 打招呼 / 把睡着的它唤醒 ----
  const distToMouse = Math.hypot(mouseX - lion.x, mouseY - (lion.y - 60 * lion.size))
  const overBody = mouseX > -9000 && distToMouse < 60 * lion.size
  if (lion.state === 'sleep' && overBody && mouseSpeed > 250) {
    wake() // 睡觉时鼠标在身边晃 → 醒来
  } else if (!dragging && !focusActive && lion.onGround && mouseX > -9000) {
    if (overBody && mouseSpeed > 1100 && now > startleCdT) {
      getStartled() // 鼠标猛地划过身上 → 受惊一跳
    } else if (lion.state === 'idle' && mouseSpeed > 900 && distToMouse < 320 && now > chaseCdT) {
      chaseCdT = now + 8
      doChase() // 鼠标在附近快速移动 → 好奇追上去
    } else if (lion.state === 'idle' && distToMouse < 150) {
      setState('greet') // 鼠标慢慢靠近 → 打招呼
      say(pick(['你好呀~', '嗨!', '在忙吗?', '看这里~']))
    }
  }

  // ---- 各状态行为 ----
  switch (lion.state) {
    case 'idle':
      lion.idleTimer -= dt
      if (lion.idleTimer <= 0 && lion.onGround) {
        decideNextAction()
      }
      break

    case 'walk': {
      const speed = 70
      const dir = lion.targetX > lion.x ? 1 : -1
      lion.facing = dir
      lion.x += dir * speed * dt
      lion.walkPhase += dt * 9
      if (Math.abs(lion.x - lion.targetX) < 4) {
        lion.x = lion.targetX
        setState('idle')
        lion.idleTimer = rand(2.5, 5)
      }
      break
    }

    case 'greet':
      lion.armWave += dt * 10
      if (lion.stateTime > 1.8 || distToMouse > 240) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'happy':
      lion.armWave += dt * 9
      if (lion.stateTime > 1.6 && lion.onGround) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'eat':
      lion.foodT += dt
      if (lion.foodT > 1.8) {
        if (Math.random() < 0.45) { doGroom(); break } // 吃完舔舔爪子,真·猫科习惯
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'drag':
      lion.armWave += dt * 6
      break

    case 'sleep':
      // 睡觉时只是趴着,点击/喂食/拖拽会把它叫醒
      break

    // ---- 玩耍动作 ----
    case 'dance':
      if (lion.stateTime > 3.8) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'roll':
      lion.rollAngle += dt * 7.6 // 约 0.8s 翻一整圈
      lion.x = clamp(lion.x + lion.facing * 70 * dt, 80, W - 80)
      if (lion.rollAngle >= Math.PI * 2) {
        lion.rollAngle = 0
        lion.sx = 1.2
        lion.sy = 0.8
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'chase': {
      const speed = 138
      const tx = mouseX > -9000 ? mouseX : W / 2
      const dir = tx > lion.x ? 1 : -1
      lion.facing = dir
      if (Math.abs(tx - lion.x) > 6) lion.x = clamp(lion.x + dir * speed * dt, 80, W - 80)
      lion.walkPhase += dt * 13
      if (lion.stateTime > 5) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break
    }

    case 'loveyou':
      if (Math.random() < dt * 6) spawnHearts(1)
      if (lion.stateTime > 2.8) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    // ---- 情绪动作 ----
    case 'angry':
      if (lion.stateTime > 2.4) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'stomp': {
      // 每次脚跺到地面播一声「咚」
      const tick = Math.floor((lion.stateTime * 8) / Math.PI)
      if (tick !== lion._stompTick) {
        lion._stompTick = tick
        SFX.stomp()
      }
      if (lion.stateTime > 2) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break
    }

    case 'think':
      if (lion.stateTime > 3) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'yawn':
      if (lion.stateTime > 2.6) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'peek':
      // 原地好奇张望:头与视线左右扫(在视线 / 姿态段处理),这里只计时
      if (lion.stateTime > 3.0) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'sneeze': {
      // 蓄力(仰头吸气)→ 约 0.65s 爆发(喷嚏 + 音效 + 飞沫 + 一缩)→ 恢复
      if (!lion._sneezed && lion.stateTime >= 0.65) {
        lion._sneezed = true
        SFX.sneeze()
        lion.sx = 1.3
        lion.sy = 0.74
        say('阿——嚏!', 1.2)
      }
      if (lion.stateTime > 1.7) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break
    }

    case 'shy':
      // 害羞:双爪半捂脸 + 身体扭捏(在 drawPet),偶尔冒小爱心
      if (Math.random() < dt * 1.1) spawnHearts(1)
      if (lion.stateTime > 2.6) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    // ---- 拟真自主小动作 ----
    case 'stretch':
      if (lion.stateTime > 2.1) {
        const nx = lion.nextAuto
        lion.nextAuto = ''
        if (nx === 'shake') { doShake(); break }
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'shake':
      if (lion.stateTime > 1.15) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'groom':
      if (lion.stateTime > 3.4) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'scratch':
      if (lion.stateTime > 2.2) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break

    case 'tailchase': {
      // 0~2s 原地小圈追尾(朝向跟着跑动方向翻转),之后 1s 晕乎乎站不稳
      if (lion.stateTime < 2) {
        const ramp = Math.min(1, lion.stateTime / 0.4) // 起步加速
        const ph = lion.stateTime * 8.5
        lion.x = clamp(lion.targetX + Math.sin(ph) * 26 * ramp, 60, W - 60)
        lion.facing = Math.cos(ph) >= 0 ? 1 : -1
        lion.walkPhase += dt * 16
        lion.tailPhase += dt * 5
      } else if (lion.stateTime > 3.1) {
        say(pick(['呼…又没抓到', '头好晕~', '它怎么总在后面!']), 2)
        setState('idle')
        lion.idleTimer = rand(2.5, 5)
      }
      break
    }

    case 'zoomies': {
      // 上头时刻:全速来回狂奔,每趟尽头急刹(挤压),跑完吐舌喘气
      const speed = 330
      const dir = lion.targetX > lion.x ? 1 : -1
      lion.facing = dir
      lion.x += dir * speed * dt
      lion.walkPhase += dt * 22
      if ((dir > 0 && lion.x >= lion.targetX) || (dir < 0 && lion.x <= lion.targetX)) {
        lion.x = lion.targetX
        lion.sx = 1.32
        lion.sy = 0.72
        lion.dashLeft--
        if (lion.dashLeft <= 0) {
          setState('pant')
          say(pick(['哈…哈…爽!', '呼——过瘾!', '哈嘶…哈嘶…']), 2)
        } else {
          const back = -dir
          lion.targetX = clamp(lion.x + back * rand(260, 460), 80, W - 80)
        }
      }
      break
    }

    case 'pant':
      // 喘气:呼吸加快(吐舌画在 drawNoseMouth)
      lion.breathe += dt * 5
      if (lion.stateTime > 2.4) {
        setState('idle')
        lion.idleTimer = rand(3, 6)
      }
      break

    case 'sniff': {
      // 低头贴地嗅探,慢慢往前蹭,闻到「重点」就停一停
      const pause = Math.sin(lion.stateTime * 1.6) > 0.55
      if (!pause) {
        lion.x = clamp(lion.x + lion.facing * 26 * dt, 60, W - 60)
        lion.walkPhase += dt * 4
      }
      if (lion.stateTime > 3.4) {
        if (Math.random() < 0.3) say(pick(['唔,是零食的味道?', '什么都没有嘛', '可疑…非常可疑']), 2)
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break
    }

    case 'stalk': {
      // 压低身子悄悄接近蝴蝶,屁股扭一扭蓄力,然后猛扑
      if (!butterfly || butterfly.owner !== lion || butterfly.state !== 'fly') {
        setState('idle')
        lion.idleTimer = rand(2, 4)
        break
      }
      const d = butterfly.x - lion.x
      lion.facing = d >= 0 ? 1 : -1
      if (Math.abs(d) > 120) lion.x = clamp(lion.x + lion.facing * 36 * dt, 60, W - 60)
      lion.walkPhase += dt * 3 // 蹑手蹑脚
      if (lion.stateTime > 1.7 && Math.abs(d) < 210) {
        setState('pounce')
        SFX.pounce()
        lion.vy = -420
        lion.onGround = false
        lion.sx = 0.86
        lion.sy = 1.18
      } else if (lion.stateTime > 5) {
        butterfly.state = 'flee'
        butterfly.vx = rand(-50, 50)
        butterfly.vy = -120
        say('被它发现了…', 1.8)
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break
    }

    case 'pounce': {
      // 空中朝蝴蝶扑过去;够到时:小概率它停在鼻尖,否则振翅逃走
      if (butterfly && butterfly.state === 'fly') {
        lion.x = clamp(lion.x + lion.facing * 210 * dt, 60, W - 60)
        const dx = Math.abs(butterfly.x - lion.x)
        const dy = Math.abs(butterfly.y - (lion.y - 88 * lion.size))
        if (dx < 48 && dy < 64) {
          if (Math.random() < 0.35) {
            butterfly.state = 'land'
            butterfly.t = 0
            butterfly.owner = lion
            lion.mood = clamp(lion.mood + 12, 0, 100)
            addBond(lion, 2)
            spawnHearts(2)
            say('它停在我鼻子上啦!', 2.6)
          } else {
            butterfly.state = 'flee'
            butterfly.vx = lion.facing * rand(40, 90)
            butterfly.vy = -150
          }
        }
      }
      if (lion.onGround && lion.stateTime > 0.25) {
        if (butterfly && butterfly.state === 'land') {
          setState('happy')
        } else {
          if (butterfly && butterfly.state === 'flee') say(pick(['哎呀,飞走了…', '差一点点!', '下次一定抓到!']), 2.2)
          setState('idle')
          lion.idleTimer = rand(2.5, 5)
        }
      }
      break
    }

    case 'playball': {
      if (!ball || !ball.alive) {
        setState('idle')
        lion.idleTimer = rand(2, 4)
        break
      }
      const d = ball.x - lion.x
      if (Math.abs(d) > 56) {
        // 追球(球越快追得越起劲)
        lion.facing = d > 0 ? 1 : -1
        lion.x = clamp(lion.x + lion.facing * Math.min(230, 90 + Math.abs(ball.vx)) * dt, 60, W - 60)
        lion.walkPhase += dt * 14
        lion.armWave += dt * 8
      } else if (Math.abs(ball.vx) < 70) {
        // 追到了且球滚慢了 → 一爪子拍出去
        lion.facing = d >= 0 ? 1 : -1
        ball.vx = lion.facing * rand(280, 430)
        SFX.bat()
        lion.sx = 1.18
        lion.sy = 0.86
        lion.batCount++
        if (lion.batCount >= 4) {
          ball.alive = false
          lion.mood = clamp(lion.mood + 8, 0, 100)
          addBond(lion, 2)
          setState('happy')
          lion.hopCount = 1
          hop(280)
          say(pick(['好好玩!', '球球真乖~', '呼…玩累了']), 2.2)
        }
      }
      if (lion.stateTime > 14) {
        // 玩太久了(球被弹来弹去追不上)→ 收工
        ball.alive = false
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break
    }

    case 'fetch': {
      if (!disc) { setState('idle'); lion.idleTimer = rand(2, 4); break }
      if (disc.state === 'fly' || disc.state === 'ground') {
        // 跑向飞盘落点
        const d = disc.x - lion.x
        lion.facing = d >= 0 ? 1 : -1
        if (Math.abs(d) > 30) {
          lion.x = clamp(lion.x + lion.facing * 230 * dt, 60, W - 60)
          lion.walkPhase += dt * 16
        } else if (disc.state === 'ground') {
          // 叼起来,记下你此刻的位置,准备送回去
          disc.state = 'carried'
          disc.owner = lion
          disc.returnX = clamp(mouseX > 0 ? mouseX : W / 2, 80, W - 80)
          SFX.bat()
        }
      } else if (disc.state === 'carried') {
        const d = disc.returnX - lion.x
        lion.facing = d >= 0 ? 1 : -1
        if (Math.abs(d) > 26) {
          lion.x = clamp(lion.x + lion.facing * 150 * dt, 60, W - 60)
          lion.walkPhase += dt * 12
          lion.armWave += dt * 6
        } else {
          // 放下飞盘,开心地期待你再扔
          disc.state = 'drop'
          disc.settleT = 0
          disc.x = lion.x + lion.facing * 20 * lion.size
          disc.y = groundY - 6
          lion.mood = clamp(lion.mood + 10, 0, 100)
          addBond(lion, 2)
          setState('happy')
          lion.hopCount = 1
          hop(280)
          say(pick(['给你~ 再扔一个?', '叼回来啦!', '好玩!再来~']), 2.4)
        }
      } else {
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      if (lion.stateTime > 16) {
        // 追太久(被弹到犄角旮旯)→ 放弃收工
        if (disc) disc.state = 'drop'
        setState('idle')
        lion.idleTimer = rand(2, 4)
      }
      break
    }

    case 'playchase': {
      // 和同伴你追我跑:chase 一直追,run 一直逃(撞墙换向);追够时间一起收工
      const m = lion.mate
      if (!validMate(m, 'playchase')) { endPlay(lion); break }
      if (lion.playRole === 'chase') {
        const d = m.x - lion.x
        lion.facing = d >= 0 ? 1 : -1
        if (Math.abs(d) > 46) lion.x = clamp(lion.x + lion.facing * 125 * dt, 60, W - 60)
        lion.walkPhase += dt * 12
        if (lion.stateTime > 7) endPlay(lion) // 由追的一方计时收工
      } else {
        let dir = lion.x - m.x >= 0 ? 1 : -1 // 远离同伴的方向
        if (lion.x < 120) dir = 1
        else if (lion.x > W - 120) dir = -1
        lion.facing = dir
        lion.x = clamp(lion.x + dir * 150 * dt, 60, W - 60)
        lion.walkPhase += dt * 14
        if (lion.stateTime > 10) endPlay(lion) // 双保险:逃的一方超时也收工
      }
      break
    }

    case 'playnuzzle': {
      // 和同伴蹭蹭头:走到一起,挨着冒爱心
      const m = lion.mate
      if (!validMate(m, 'playnuzzle')) { endPlay(lion); break }
      const d = m.x - lion.x
      lion.facing = d >= 0 ? 1 : -1
      if (Math.abs(d) > 52) {
        lion.x = clamp(lion.x + lion.facing * 60 * dt, 60, W - 60)
        lion.walkPhase += dt * 8
      } else if (lion.x <= m.x && Math.random() < dt * 1.4) {
        spawnHeartsAt((lion.x + m.x) / 2, Math.min(lion.y, m.y) - 120 * lion.size)
      }
      if (lion.stateTime > 3) endPlay(lion)
      break
    }

    case 'playtussle': {
      // 和同伴打闹:凑到中点扭打成一团(烟雾云在 drawTussles 里画)
      const m = lion.mate
      if (!validMate(m, 'playtussle')) { endPlay(lion); break }
      const target = (lion.x + m.x) / 2 + (lion.playRole === 'tussle1' ? -9 : 9)
      const d = target - lion.x
      if (Math.abs(d) > 3) lion.x = clamp(lion.x + (d > 0 ? 1 : -1) * 95 * dt, 60, W - 60)
      lion.facing = m.x >= lion.x ? 1 : -1
      if (lion.playRole === 'tussle1' && lion.stateTime > 3.4) endPlay(lion)
      else if (lion.stateTime > 5) endPlay(lion) // 双保险
      break
    }
  }

  // ---- 专注模式下,任何短暂动作结束(回到 idle)后,自动回到安静守候 ----
  if (focusActive && lion.state === 'idle') { lion.state = 'focus'; lion.stateTime = 0 }

  // ---- 没气泡时,根据状态值主动说话(专注时保持安静,不打扰)----
  if (now > lion.bubbleUntil && lion.state !== 'sleep' && !focusActive && lion.onGround) {
    if (lion.hunger < 22 && Math.random() < dt * 0.25) {
      say(pick(['肚子好饿…', '想吃东西…', '有吃的吗?']))
    } else if (lion.mood < 22 && Math.random() < dt * 0.22) {
      say(pick(['陪我玩会儿嘛~', '有点无聊…', '理理我嘛']))
    }
  }

  // ---- 目标表情 ----
  let mouthTarget = lerp(-0.3, 0.55, lion.mood / 100)
  let eyeHappyTarget = 0
  let armRaiseTarget = 0
  if (lion.state === 'greet') {
    armRaiseTarget = 1
    eyeHappyTarget = 0.4
    mouthTarget = 0.7
  } else if (lion.state === 'happy') {
    eyeHappyTarget = 1
    mouthTarget = 1
  } else if (lion.state === 'eat') {
    mouthTarget = 0.2
  } else if (lion.state === 'drag') {
    mouthTarget = 0.0
    eyeHappyTarget = 0
  } else if (lion.state === 'dance') {
    eyeHappyTarget = 1
    mouthTarget = 1
  } else if (lion.state === 'loveyou') {
    eyeHappyTarget = 1
    mouthTarget = 1
  } else if (lion.state === 'chase') {
    eyeHappyTarget = 0.5
    mouthTarget = 0.9
  } else if (lion.state === 'roll') {
    eyeHappyTarget = 1
  } else if (lion.state === 'angry') {
    eyeHappyTarget = 0
    mouthTarget = -0.6
  } else if (lion.state === 'stomp') {
    eyeHappyTarget = 0
    mouthTarget = -0.35
  } else if (lion.state === 'think') {
    eyeHappyTarget = 0
    mouthTarget = 0.1
  } else if (lion.state === 'yawn') {
    mouthTarget = 0.2
  } else if (lion.state === 'stretch') {
    eyeHappyTarget = 1
    mouthTarget = 0.4
  } else if (lion.state === 'groom' || lion.state === 'scratch') {
    eyeHappyTarget = 1 // 舒服得眯起眼
    mouthTarget = 0.5
  } else if (lion.state === 'zoomies' || lion.state === 'pant' || lion.state === 'playball' || lion.state === 'fetch' || lion.state === 'playchase' || lion.state === 'playtussle') {
    eyeHappyTarget = 0.7
    mouthTarget = 1
  } else if (lion.state === 'playnuzzle') {
    eyeHappyTarget = 1
    mouthTarget = 0.8
  } else if (lion.state === 'stalk' || lion.state === 'pounce') {
    eyeHappyTarget = 0 // 锁定猎物,严肃脸
    mouthTarget = 0.05
  } else if (lion.state === 'tailchase') {
    eyeHappyTarget = 0.4
    mouthTarget = 0.8
  } else if (lion.state === 'sniff') {
    mouthTarget = 0.15
  } else if (lion.state === 'focus') {
    mouthTarget = 0.35 // 专注陪伴:温和微笑
    eyeHappyTarget = 0.15
  }
  lion.mouthCurve += (mouthTarget - lion.mouthCurve) * Math.min(1, dt * 9)
  lion.eyeHappy += (eyeHappyTarget - lion.eyeHappy) * Math.min(1, dt * 9)
  lion.armRaise += (armRaiseTarget - lion.armRaise) * Math.min(1, dt * 10)

  // ---- 姿态目标(平滑过渡,消除状态切换时的生硬跳变)----
  let bodyTiltTarget = 0
  let headTiltTarget = 0
  if (lion.state === 'sleep') headTiltTarget = 0.12
  else if (lion.state === 'yawn') {
    headTiltTarget = -0.12 * yawnOpen(lion.stateTime) // 吸气时渐渐仰头
    if (lion.stateTime > 2.0) headTiltTarget += Math.sin((lion.stateTime - 2.0) * 24) * 0.05 * clamp(1 - (lion.stateTime - 2.0) / 0.6, 0, 1) // 结尾摇摇头清醒
  } else if (lion.state === 'think') headTiltTarget = 0.2 + Math.sin(lion.stateTime * 1.7) * 0.08 // 歪头思考:头缓缓摆动像在斟酌
  if (lion.state === 'scratch') bodyTiltTarget = 0.08 * lion.facing
  else if (lion.state === 'sniff') bodyTiltTarget = 0.1 * lion.facing // 前倾凑近地面
  lion.bodyTilt += (bodyTiltTarget - lion.bodyTilt) * Math.min(1, dt * 9)
  lion.headTilt += (headTiltTarget - lion.headTilt) * Math.min(1, dt * 9)

  // ---- 爱心粒子 ----
  for (let i = lion.hearts.length - 1; i >= 0; i--) {
    const h = lion.hearts[i]
    h.life += dt
    h.x += h.vx * dt
    h.y += h.vy * dt
    h.vy += 30 * dt
    if (h.life >= h.ttl) lion.hearts.splice(i, 1)
  }

  // ---- 全局逻辑只在第一只时跑一次:特效 / 存档 / 拖拽穿透 ----
  if (isFirst) {
    updateFx(dt)
    saveTimer -= dt
    if (saveTimer <= 0) {
      saveTimer = 5
      saveState()
    }
    if (dragging && hasNative) window.petAPI.setIgnoreMouse(false)
  }
}

// 宠物间互动:靠近且都空闲时,偶尔互相打招呼 + 冒爱心
// 宠物间互动:靠近且都空闲时,偶尔一起玩(打招呼 / 你追我跑 / 蹭蹭头)
let interactCdT = 0
function updateInteractions(dt) {
  if (pets.length < 2 || focusActive || now < interactCdT) return
  for (let i = 0; i < pets.length; i++) {
    for (let j = i + 1; j < pets.length; j++) {
      const a = pets[i]
      const b = pets[j]
      if (Math.abs(a.x - b.x) > 220 || Math.abs(a.y - b.y) > 60) continue
      const aFree = a.state === 'idle' || a.state === 'walk'
      const bFree = b.state === 'idle' || b.state === 'walk'
      if (!aFree || !bFree || Math.random() >= dt * 0.7) continue
      const r = Math.random()
      if (r < 0.25) startGreet(a, b)
      else if (r < 0.5) startChase(a, b)
      else if (r < 0.7) startNuzzle(a, b)
      else startTussle(a, b)
      return
    }
  }
}

// —— 一起玩:小工具(在指定宠物身上切状态 / 说话)——
function setPetState(p, s) { const c = lion; lion = p; setState(s); lion = c }
function sayOn(p, text, dur) { const c = lion; lion = p; say(text, dur); lion = c }
// 玩伴关系是否仍然成立(对方还把「我」当玩伴,且仍在同一玩耍状态)
function validMate(m, s) { return m && m.mate === lion && m.state === s }

function startGreet(a, b) {
  interactCdT = now + 6
  a.facing = b.x >= a.x ? 1 : -1
  b.facing = a.x >= b.x ? 1 : -1
  const pair = pick([['你好呀~', '嗨!'], ['一起玩吗?', '好呀!'], ['嘿嘿~', '嘻嘻~'], ['今天也乖乖的~', '汪喵~']])
  setPetState(a, 'greet'); sayOn(a, pair[0], 2)
  setPetState(b, 'greet'); sayOn(b, pair[1], 2)
  spawnHeartsAt((a.x + b.x) / 2, Math.min(a.y, b.y) - 120 * a.size)
}

function startChase(a, b) {
  interactCdT = now + 11
  const chaser = Math.random() < 0.5 ? a : b
  const runner = chaser === a ? b : a
  chaser.mate = runner; chaser.playRole = 'chase'
  runner.mate = chaser; runner.playRole = 'run'
  setPetState(chaser, 'playchase')
  setPetState(runner, 'playchase')
  sayOn(chaser, pick(['抓到你咯~', '来追我呀!', '等等我!']), 2)
  sayOn(runner, pick(['来抓我呀~', '抓不到抓不到~', '嘻嘻!']), 2)
}

function startNuzzle(a, b) {
  interactCdT = now + 9
  a.mate = b; a.playRole = 'nuzzle'
  b.mate = a; b.playRole = 'nuzzle'
  setPetState(a, 'playnuzzle')
  setPetState(b, 'playnuzzle')
  sayOn(a, pick(['蹭蹭~', '抱抱!', '最好的朋友~']), 2)
}

// 打闹:两只滚成一团卡通烟雾云,玩得最凶也最开心
function startTussle(a, b) {
  interactCdT = now + 11
  a.mate = b; a.playRole = 'tussle1' // tussle1 负责画那团烟雾云
  b.mate = a; b.playRole = 'tussle2'
  setPetState(a, 'playtussle')
  setPetState(b, 'playtussle')
  a.facing = b.x >= a.x ? 1 : -1
  b.facing = a.x >= b.x ? 1 : -1
  sayOn(a, pick(['看招~', '嘿呀!', '我不会输的~']), 1.6)
}

// 结束一起玩:把自己和玩伴都收回开心待机,各加一点亲密度
function endPlay(p) {
  const m = p.mate
  finishPlayOne(p)
  if (m && m.mate === p) finishPlayOne(m)
}
function finishPlayOne(p) {
  const wasPlaying = p.state === 'playchase' || p.state === 'playnuzzle'
  p.mate = null
  p.playRole = ''
  if (!wasPlaying) return // 玩伴已被拖走 / 进入别的状态 → 只解除关系,不强行改它的状态
  const c = lion
  lion = p
  addBond(p, 2)
  setState('happy')
  p.hopCount = 1
  hop(240)
  say(pick(['玩得真开心~', '好好玩!', '再玩一会儿嘛~']), 2)
  p.idleTimer = rand(2, 4)
  lion = c
}

function spawnHeartsAt(x, y) {
  for (let k = 0; k < 3; k++) {
    pets[0].hearts.push({ x: x + rand(-15, 15), y: y + rand(-8, 8), vx: rand(-15, 15), vy: rand(-45, -28), life: 0, ttl: rand(0.9, 1.3) })
  }
}

/* =========================================================
 * 6. 绘制
 * =======================================================*/
function draw() {
  ctx.clearRect(0, 0, W, H)
  drawFx() // 背景氛围粒子(雪 / 落叶 / 星空 / 花瓣)
  // 按 y 排序:靠上(远)先画,靠下(近)后画,形成前后层次
  const order = pets.slice().sort((a, b) => a.y - b.y)
  for (const p of order) {
    lion = p
    drawPet()
  }
  lion = activePet
  drawButterfly() // 蝴蝶 / 毛线球 / 飞盘(画在宠物之上,确保可见)
  drawBall()
  drawDisc()
  drawTussles() // 打闹烟雾云(盖在宠物之上)
  drawFocusTimer() // 专注倒计时(屏幕坐标,画在最上层)
  drawStats() // 状态面板(可选)
}

function drawPet() {
  const s = lion.size

  // 走路 / 追逐 / 待机的整体上下浮动
  let bob = 0
  if (lion.state === 'walk' || lion.state === 'chase' || lion.state === 'zoomies' || lion.state === 'playball' || lion.state === 'tailchase' || lion.state === 'fetch' || lion.state === 'playchase') {
    bob = Math.abs(Math.sin(lion.walkPhase)) * (lion.state === 'zoomies' ? -7 : -5)
  }
  const breath = Math.sin(lion.breathe) * 1.5

  // 跳舞:整体左右摇摆 + 跟节拍蹦跳与挤压
  let danceTilt = lion.bodyTilt // 平滑的姿态基底,振荡分量在下方实时叠加
  let danceSX = 1
  let danceSY = 1
  if (lion.state === 'dance') {
    const beat = lion.stateTime * 7
    const env = clamp(Math.min(lion.stateTime / 0.3, (3.8 - lion.stateTime) / 0.5), 0, 1) // 起步 / 收尾淡入淡出,不再戛然而止
    danceTilt += Math.sin(beat) * 0.16 * env
    bob += -Math.abs(Math.sin(beat)) * 8 * env
    danceSX = 1 + Math.sin(beat * 2) * 0.06 * env
    danceSY = 1 - Math.sin(beat * 2) * 0.06 * env
  }

  // 生气:整体高频抖动;跺脚:身体随节拍颠
  let shakeX = 0
  if (lion.state === 'angry') shakeX = Math.sin(lion.stateTime * 38) * 2.5
  if (lion.state === 'stomp') bob += -Math.abs(Math.sin(lion.stateTime * 8)) * 6

  // ---- 拟真小动作的身体姿态 ----
  if (lion.state === 'stretch') {
    // 伸懒腰:身体拔高拉长再回落
    const f = Math.sin(Math.PI * clamp(lion.stateTime / 2.1, 0, 1))
    danceSX *= 1 - 0.09 * f
    danceSY *= 1 + 0.16 * f
  } else if (lion.state === 'shake') {
    // 抖毛:全身高频左右甩
    shakeX += Math.sin(lion.stateTime * 44) * 4
    danceTilt += Math.sin(lion.stateTime * 44 + 1.1) * 0.05
    danceSX *= 1.04
  } else if (lion.state === 'stalk') {
    // 潜行:压低身子;起扑前屁股越扭越快(蓄力)
    danceSX *= 1.07
    danceSY *= 0.8
    danceTilt += Math.sin(lion.stateTime * 13) * 0.028 * Math.min(1, lion.stateTime / 0.8)
  } else if (lion.state === 'pounce') {
    // 飞扑:身体前展拉长
    danceSX *= 1.14
    danceSY *= 0.94
  } else if (lion.state === 'tailchase') {
    if (lion.stateTime < 2) {
      danceTilt += Math.cos(lion.stateTime * 8.5) * -0.1 // 转圈时身体内倾
    } else {
      danceTilt += Math.sin(lion.stateTime * 9) * 0.07 // 晕得直打晃
    }
  } else if (lion.state === 'scratch') {
    danceTilt += Math.sin(lion.stateTime * 22) * 0.015 * lion.facing // 高频抖动(侧倾基底已由 bodyTilt 平滑接管)
  } else if (lion.state === 'focus') {
    danceSY *= 0.9 // 专注:安静蹲坐
  } else if (lion.state === 'playtussle') {
    shakeX += Math.sin(lion.stateTime * 40) * 3 // 扭打:高频抖动
    danceSY *= 0.92
  } else if (lion.state === 'yawn') {
    danceSY *= 1 + 0.07 * yawnOpen(lion.stateTime) // 吸气时身子随之拔高
  } else if (lion.state === 'eat') {
    bob += -Math.abs(Math.sin(lion.foodT * 10)) * 2 // 咀嚼时头身随节奏轻点
  }

  // ---- 地面影子(跟随脚底,随高度变小)----
  const airborne = clamp((groundY - lion.y) / 200, 0, 1)
  ctx.save()
  ctx.globalAlpha = 0.9 - airborne * 0.5
  ctx.fillStyle = COLOR.shadow
  ctx.beginPath()
  ctx.ellipse(lion.x, groundY + 4, (46 - airborne * 16) * s, (10 - airborne * 4) * s, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(lion.x + shakeX, lion.y + bob)
  if (danceTilt) ctx.rotate(danceTilt)
  ctx.scale(lion.facing * lion.sx * danceSX * s, lion.sy * danceSY * s)

  // 打滚:整体绕身体中心旋转一圈
  if (lion.state === 'roll') {
    const bcy = -55
    ctx.translate(0, bcy)
    ctx.rotate(lion.rollAngle * lion.facing)
    ctx.translate(0, -bcy)
  }

  // 跳舞 / 比心 / 伸懒腰 / 飞扑时双臂高举(画在头部之上);舔爪 / 拍球时前爪画在最上层
  const armsUp = lion.state === 'dance' || lion.state === 'loveyou' || lion.state === 'stretch' || lion.state === 'pounce'
  const frontArmTop = lion.armRaise >= 0.5 || lion.state === 'groom' || lion.state === 'playball' || lion.state === 'think'

  const legsFront = lion.state === 'stomp' || lion.state === 'scratch'
  drawTail(breath)
  if (!legsFront) drawLegs()
  if (!armsUp) {
    drawArm(-1) // 左臂(身体层)
    if (!frontArmTop) drawArm(1) // 右臂未抬起时也在身体层
  }
  drawBody(breath)
  if (legsFront) drawLegs() // 跺脚 / 挠痒:腿画在身体前,抬脚清晰可见
  drawHead(breath)
  if (lion.state === 'eat') drawFood() // 食物叼在嘴边(画在脸上层),边吃边变小
  if (armsUp) {
    drawArm(-1)
    drawArm(1)
  } else if (frontArmTop) {
    drawArm(1) // 抬爪时画在最上层,动作清晰可见
  }

  ctx.restore()

  // ---- 头顶符号 / 粒子 / 气泡(屏幕坐标,不翻转)----
  drawHearts()
  if (lion.state === 'sleep') drawZzz()
  if (lion.state === 'loveyou') drawBigHeart()
  if (lion.state === 'angry') { drawAngerMark(); drawAngerSteam() }
  if (lion.state === 'think') drawQuestion()
  if (lion.state === 'stomp') drawStompDust()
  if (lion.state === 'tailchase' && lion.stateTime > 2) drawDizzyStars()
  if (lion.state === 'zoomies') drawSpeedLines()
  if (lion.state === 'sniff') drawSniffPuffs()
  drawBubble()
}

// 身体
function drawBody(breath) {
  const w = S.bodyW
  const h = S.bodyH + breath
  const cy = -S.legH - h / 2
  const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2)
  g.addColorStop(0, skin().body1)
  g.addColorStop(1, skin().body2)
  ctx.fillStyle = g
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  roundedBlob(0, cy, w, h, 22)
  ctx.fill()
  ctx.stroke()
  // 浅色肚皮
  ctx.fillStyle = 'rgba(255,248,225,0.65)'
  ctx.beginPath()
  ctx.ellipse(0, cy + 6, w * 0.28, h * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()
}

// 腿 / 脚
function drawLegs() {
  const lh = S.legH
  let swing = 0
  if (lion.state === 'walk' || lion.state === 'chase') swing = Math.sin(lion.walkPhase) * 5
  // 跺脚:左右脚交替抬起
  let liftR = 0
  let liftL = 0
  if (lion.state === 'stomp') {
    const p = Math.sin(lion.stateTime * 8)
    liftR = Math.max(0, p) * 22
    liftL = Math.max(0, -p) * 22
  }
  ctx.fillStyle = skin().limb
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  if (lion.state === 'scratch') {
    // 挠痒:后侧腿站稳,前侧后腿高高抬起朝耳朵快速挠
    ctx.beginPath()
    ctx.ellipse(-15, -lh / 2, 11, lh, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    const wig = Math.sin(lion.stateTime * 22) * 6
    ctx.beginPath()
    ctx.ellipse(27, -lh / 2 - 46 - wig, 9, lh + 5, -0.55, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    return
  }
  for (const side of [-1, 1]) {
    const x = side * 15
    const off = side > 0 ? swing : -swing
    const lift = side > 0 ? liftR : liftL
    ctx.beginPath()
    ctx.ellipse(x + off, -lh / 2 - lift, 11, lh, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

// 手臂(side: -1 左 / 1 右)
function drawArm(side) {
  const shoulderX = side * 26
  const shoulderY = -S.legH - S.bodyH + 14
  ctx.save()
  ctx.translate(shoulderX, shoulderY)

  let angle
  if (lion.state === 'loveyou') {
    // 双手高高举起捧着爱心
    angle = side * -2.1
  } else if (lion.state === 'stretch') {
    // 伸懒腰:双臂使劲向上伸直,微微颤
    angle = side * -2.55 + Math.sin(lion.stateTime * 7) * 0.04 * side
  } else if (lion.state === 'pounce') {
    // 飞扑:双爪朝前方猎物伸出
    angle = -1.5 + side * 0.14
  } else if (lion.state === 'groom' && side === 1) {
    // 舔爪理毛:先把爪子凑到嘴边舔,然后抬高蹭脸
    const t = lion.stateTime
    if (t < 2) {
      angle = -2.35 + Math.sin(t * 9) * 0.13 // 舔的小幅度晃
    } else {
      angle = -2.35 - (Math.sin((t - 2) * 6 - Math.PI / 2) * 0.5 + 0.5) * 0.55 // 往上蹭脸
    }
  } else if (lion.state === 'think' && side === 1) {
    // 歪头思考:一只前爪托着下巴,偶尔轻点像在掂量
    angle = -2.52 + Math.sin(lion.stateTime * 2.2) * 0.05
  } else if (lion.state === 'playball' && side === 1) {
    // 玩球:前爪抬着随时准备拍
    angle = -1.25 + Math.sin(lion.armWave) * 0.35
  } else if (lion.state === 'dance') {
    // 双手举起随节拍交替挥舞
    const beat = lion.stateTime * 7
    angle = side * -1.9 + Math.sin(beat + (side < 0 ? Math.PI : 0)) * 0.55
  } else if (lion.armRaise > 0.5 && side === 1) {
    // 举手挥动(打招呼)
    const wave = Math.sin(lion.armWave) * 0.35
    angle = -2.2 + wave
  } else if (lion.state === 'drag') {
    // 被拎起,手往下垂并晃动
    angle = (side > 0 ? 1 : -1) * 1.9 + Math.sin(lion.armWave) * 0.2
  } else if (lion.state === 'happy') {
    angle = side * -1.0 + Math.sin(lion.armWave) * 0.3
  } else {
    angle = side * 0.55 // 自然下垂略外张
  }
  ctx.rotate(angle)

  ctx.fillStyle = skin().limb
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  // 胳膊(胶囊)
  roundedBlob(0, 16, 12, 30, 6)
  ctx.fill()
  ctx.stroke()
  // 爪子
  ctx.beginPath()
  ctx.arc(0, 30, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

// 尾巴
function drawTail(breath) {
  ctx.save()
  const baseX = -S.bodyW * 0.42
  const baseY = -S.legH - 10
  const excited =
    lion.state === 'stalk' || lion.state === 'tailchase' || lion.state === 'playball' || lion.state === 'zoomies' || lion.state === 'pant' || lion.state === 'pounce' || lion.state === 'fetch' || lion.state === 'playchase' || lion.state === 'playtussle'
  ctx.strokeStyle = skin().limb
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  if (excited) {
    // 兴奋:尾巴高高竖起、快速甩动(真猫狗的兴奋信号)
    const sway = Math.sin(lion.tailPhase * 2.6) * 10
    ctx.beginPath()
    ctx.moveTo(baseX, baseY)
    ctx.quadraticCurveTo(baseX - 18, baseY - 30, baseX - 4 + sway, baseY - 54)
    ctx.stroke()
    ctx.fillStyle = skin().maneOuter
    ctx.strokeStyle = COLOR.line
    ctx.lineWidth = 2.5
    drawFluffBall(baseX - 4 + sway, baseY - 58, 11, 7)
    ctx.restore()
    return
  }
  const sway = Math.sin(lion.tailPhase) * 8
  ctx.beginPath()
  ctx.moveTo(baseX, baseY)
  ctx.quadraticCurveTo(baseX - 22, baseY - 20, baseX - 14 + sway, baseY - 40)
  ctx.stroke()
  // 尾巴末端鬃球
  ctx.fillStyle = skin().maneOuter
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2.5
  drawFluffBall(baseX - 14 + sway, baseY - 44, 11, 7)
  ctx.restore()
}

// 头(鬃毛 + 脸 + 耳朵 + 五官 + 可选帽子)
function drawHead(breath) {
  const cy = -80 + breath * 0.4
  const tilt = lion.headTilt // 平滑过渡的头部倾斜(歪头思考 / 睡觉低头 / 打哈欠仰头)

  ctx.save()
  ctx.translate(0, cy)
  ctx.rotate(tilt)

  // --- 头顶特征(狮子鬃毛+圆耳 / 猫尖耳 / 狗垂耳)---
  if (lion.species === 'cat') {
    drawCatEars()
  } else if (lion.species === 'dog') {
    drawDogEars()
  } else if (lion.species === 'rabbit') {
    drawRabbitEars()
  } else if (lion.species === 'panda') {
    drawPandaEars()
  } else {
    drawMane()
    drawRoundEars()
  }

  // --- 脸 ---
  const fg = ctx.createRadialGradient(-8, -10, 6, 0, 0, S.faceR + 8)
  fg.addColorStop(0, skin().face1)
  fg.addColorStop(1, skin().face2)
  ctx.fillStyle = fg
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, S.faceR, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // --- 生气时鼓起的腮帮 ---
  if (lion.state === 'angry') {
    ctx.fillStyle = skin().face2
    ctx.strokeStyle = COLOR.line
    ctx.lineWidth = 3
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(side * 37, 7, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // --- 腮红 ---
  ctx.fillStyle = COLOR.blush
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(side * 24, 12, 8, 5.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- 猫胡须 ---
  if (lion.species === 'cat') drawWhiskers()

  // --- 熊猫黑眼圈(画在眼睛之下)---
  if (lion.species === 'panda') drawPandaPatches()

  drawEyes()
  drawNoseMouth()

  // --- 配饰(戴在头部最上层)---
  drawAccessory()

  ctx.restore()
}

// 狮子鬃毛(一圈长短交替的花瓣)
function drawMane() {
  const n = 14
  ctx.fillStyle = COLOR.maneOuter
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(lion.manePhase) * 0.04
    const r = S.maneR + (i % 2 === 0 ? 6 : -2)
    const mx = Math.cos(a) * r
    const my = Math.sin(a) * r
    ctx.moveTo(mx + 13, my)
    ctx.arc(mx, my, 13, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = COLOR.maneInner
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.22
    const r = S.maneR - 8
    const mx = Math.cos(a) * r
    const my = Math.sin(a) * r
    ctx.moveTo(mx + 10, my)
    ctx.arc(mx, my, 10, 0, Math.PI * 2)
  }
  ctx.fill()
}

// 狮子圆耳
function drawRoundEars() {
  for (const side of [-1, 1]) {
    const ex = side * 27
    const ey = -40
    ctx.fillStyle = COLOR.ear
    ctx.strokeStyle = COLOR.line
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(ex, ey, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = COLOR.earInner
    ctx.beginPath()
    ctx.arc(ex, ey + 1, 7, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 猫:头顶两只尖三角耳
function drawCatEars() {
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  for (const side of [-1, 1]) {
    const bx = side * 24
    ctx.fillStyle = COLOR.ear
    ctx.beginPath()
    ctx.moveTo(bx - side * 16, -26)
    ctx.lineTo(bx + side * 8, -58) // 尖端朝外上
    ctx.lineTo(bx + side * 16, -24)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // 内耳(粉)
    ctx.fillStyle = '#F7A98C'
    ctx.beginPath()
    ctx.moveTo(bx - side * 8, -28)
    ctx.lineTo(bx + side * 6, -50)
    ctx.lineTo(bx + side * 9, -27)
    ctx.closePath()
    ctx.fill()
  }
}

// 狗:头两侧的垂耳
function drawDogEars() {
  ctx.fillStyle = COLOR.ear
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * 33, -28)
    ctx.rotate(side * 0.25)
    ctx.beginPath()
    ctx.ellipse(0, 16, 13, 27, 0, 0, Math.PI * 2) // 长椭圆垂耳
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = COLOR.earInner
    ctx.beginPath()
    ctx.ellipse(0, 22, 6, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = COLOR.ear
    ctx.restore()
  }
}

// 兔:头顶两只立着的长耳
function drawRabbitEars() {
  const C = skin()
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * 15, -32)
    ctx.rotate(side * 0.16)
    ctx.fillStyle = C.ear
    ctx.beginPath()
    ctx.ellipse(0, -22, 9, 30, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // 内耳(粉)
    ctx.fillStyle = C.earInner
    ctx.beginPath()
    ctx.ellipse(0, -22, 4.5, 22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// 熊猫:头顶两只黑色圆耳
function drawPandaEars() {
  const C = skin()
  ctx.fillStyle = C.ear
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2.5
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(side * 30, -34, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

// 熊猫:眼睛周围的黑眼圈(斜椭圆,画在眼睛之下)
function drawPandaPatches() {
  ctx.fillStyle = '#2B2B2B'
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * 15, -3)
    ctx.rotate(side * -0.55) // 外下倾,经典水滴状眼圈
    ctx.beginPath()
    ctx.ellipse(0, 0, 10.5, 14.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// 猫:脸颊胡须
function drawWhiskers() {
  ctx.strokeStyle = 'rgba(90,60,30,0.5)'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  for (const side of [-1, 1]) {
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath()
      ctx.moveTo(side * 17, 6 + k * 4)
      ctx.lineTo(side * 41, 3 + k * 9)
      ctx.stroke()
    }
  }
}

function drawEyes() {
  const ex = S.eyeGap / 2
  const ey = -6
  const sleeping = lion.state === 'sleep'
  const yawning = lion.state === 'yawn' && yawnOpen(lion.stateTime) > 0.3 // 张大时眯眼,结尾睁开
  const angry = lion.state === 'angry'
  for (const side of [-1, 1]) {
    const x = side * ex

    if (angry) {
      // 怒眉(内低外高的 ＼／)+ 瞪起的小眼
      ctx.strokeStyle = COLOR.eye
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x + side * 4, ey - 9) // 外侧高
      ctx.lineTo(x - side * 8, ey + 1) // 内侧低
      ctx.stroke()
      ctx.fillStyle = COLOR.eye
      ctx.beginPath()
      ctx.arc(x, ey + 3, 5, 0, Math.PI * 2)
      ctx.fill()
      continue
    }

    if (sleeping || yawning || lion.eyeHappy > 0.55) {
      // 闭眼 / 眯眼 / 弯眼笑:一条向下的弧
      ctx.strokeStyle = COLOR.eye
      ctx.lineWidth = 3.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(x, ey + 2, 8, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      continue
    }

    // 普通眼
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = 'rgba(120,66,16,0.25)'
    ctx.lineWidth = 1.5
    const openY = Math.max(0.08, lion.eyeOpen)
    ctx.save()
    ctx.translate(x, ey)
    ctx.scale(1, openY)
    ctx.beginPath()
    ctx.arc(0, 0, S.eyeR, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // 瞳孔
    ctx.fillStyle = COLOR.eye
    let px = lion.gazeX * 3.4 * lion.facing
    let py = lion.gazeY * 3.0
    if (lion.state === 'think') {
      // 思考时眼睛望向斜上方
      px = 2.2
      py = -3.4
    }
    ctx.beginPath()
    ctx.arc(px, py, S.pupilR, 0, Math.PI * 2)
    ctx.fill()
    // 高光
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(px - 1.8, py - 2, 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawNoseMouth() {
  // 鼻子
  ctx.fillStyle = COLOR.nose
  ctx.beginPath()
  ctx.moveTo(-4.5, 8)
  ctx.lineTo(4.5, 8)
  ctx.lineTo(0, 13)
  ctx.closePath()
  ctx.fill()

  // 鼻梁下的小竖线
  ctx.strokeStyle = COLOR.mouth
  ctx.lineWidth = 2.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 13)
  ctx.lineTo(0, 17)
  ctx.stroke()

  if (lion.state === 'yawn') {
    // 打哈欠:嘴随吸气张大→保持→闭合(过程化),张到一定程度才露舌头
    const o = yawnOpen(lion.stateTime)
    if (o > 0.06) {
      ctx.fillStyle = '#7A3B2A'
      ctx.beginPath()
      ctx.ellipse(0, 19 + o * 4, 6 + o * 3, 4 + o * 8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = COLOR.tongue
      ctx.beginPath()
      ctx.ellipse(0, 22 + o * 7, 2 + o * 3.5, 1.5 + o * 3, 0, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    // o≈0(结尾):落到普通嘴,自然收口
  }

  const c = lion.mouthCurve
  const open = lion.state === 'happy' || lion.state === 'eat' || lion.state === 'dance'
  if (open) {
    // 张嘴笑;吃东西时嘴随咀嚼一开一合
    const mh = lion.state === 'eat' ? 3 + Math.abs(Math.sin(lion.foodT * 10)) * 5 : 6 + c * 3
    ctx.fillStyle = COLOR.mouth
    ctx.beginPath()
    ctx.ellipse(0, 21, 8, mh, 0, 0, Math.PI)
    ctx.fill()
    ctx.fillStyle = COLOR.tongue
    ctx.beginPath()
    ctx.ellipse(0, 23, 5, 3.5, 0, 0, Math.PI)
    ctx.fill()
  } else {
    // 一条弧:c 为正→微笑,为负→撇嘴(生气/不开心)
    ctx.strokeStyle = COLOR.mouth
    ctx.lineWidth = 2.8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-9, 18)
    ctx.quadraticCurveTo(-4.5, 18 + c * 7, 0, 18)
    ctx.quadraticCurveTo(4.5, 18 + c * 7, 9, 18)
    ctx.stroke()
  }

  // 兔子的两颗小门牙(张嘴 / 打哈欠时不画)
  if (lion.species === 'rabbit' && !open) {
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = COLOR.line
    ctx.lineWidth = 1
    for (const tx of [-3.6, 0.2]) {
      roundedRect(tx, 19, 3.4, 5, 1.2)
      ctx.fill()
      ctx.stroke()
    }
  }
}

// 节日帽子(圣诞帽,画在已平移到头中心的坐标系里)
function drawHat() {
  ctx.save()
  ctx.translate(2, -45)
  ctx.rotate(0.12)
  // 白色帽边(绒条)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2.5
  roundedBlob(0, 7, 52, 13, 6.5)
  ctx.fill()
  ctx.stroke()
  // 红色帽身(弯尖三角)
  ctx.fillStyle = COLOR.hatRed
  ctx.beginPath()
  ctx.moveTo(-22, 5)
  ctx.quadraticCurveTo(-4, -34, 30, -40)
  ctx.quadraticCurveTo(8, -8, 22, 5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.moveTo(-15, 3)
  ctx.quadraticCurveTo(-2, -24, 16, -30)
  ctx.quadraticCurveTo(0, -8, 7, 3)
  ctx.closePath()
  ctx.fill()
  // 白绒球
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(31, -41, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

// 按当前 accessory 画配饰(在已平移到头中心、随头部 tilt 旋转的坐标系里)
function drawAccessory() {
  switch (lion.accessory) {
    case 'santa': drawHat(); break
    case 'glasses': drawGlasses(); break
    case 'scarf': drawScarf(); break
    case 'bow': drawBow(); break
    case 'crown': drawCrown(); break
  }
}

// 墨镜(盖在眼睛上)
function drawGlasses() {
  const ex = S.eyeGap / 2 + 1.5
  const ey = -6
  ctx.save()
  ctx.strokeStyle = '#2A2A2E'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.fillStyle = 'rgba(28,28,32,0.92)'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(side * ex, ey, 11, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  // 鼻梁
  ctx.beginPath()
  ctx.moveTo(-ex + 8, ey - 2)
  ctx.lineTo(ex - 8, ey - 2)
  ctx.stroke()
  // 镜腿伸向耳朵
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * (ex + 10), ey - 2)
    ctx.lineTo(side * 36, ey - 7)
    ctx.stroke()
  }
  // 镜片高光
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(side * ex - 3, ey - 3, 3, 2, -0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// 围巾(绕脖子一圈 + 垂下一截)
function drawScarf() {
  ctx.save()
  ctx.fillStyle = '#3FA796'
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  roundedBlob(0, 36, 58, 15, 8) // 围一圈
  ctx.fill()
  ctx.stroke()
  roundedRect(6, 40, 15, 26, 6) // 垂下的一截
  ctx.fill()
  ctx.stroke()
  // 浅色条纹
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 15, 30)
    ctx.lineTo(i * 15, 42)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(8, 48)
  ctx.lineTo(19, 48)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(8, 58)
  ctx.lineTo(19, 58)
  ctx.stroke()
  ctx.restore()
}

// 蝴蝶结(系在脖子前)
function drawBow() {
  ctx.save()
  ctx.translate(0, 37)
  ctx.fillStyle = '#E23B6D'
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(side * 18, -11)
    ctx.lineTo(side * 18, 11)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = '#C42A57'
  ctx.beginPath()
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

// 小皇冠(戴在头顶)
function drawCrown() {
  ctx.save()
  ctx.translate(0, -44)
  ctx.fillStyle = '#FFD24A'
  ctx.strokeStyle = '#C9911E'
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(-22, 6)
  ctx.lineTo(-22, -8)
  ctx.lineTo(-11, 2)
  ctx.lineTo(0, -12)
  ctx.lineTo(11, 2)
  ctx.lineTo(22, -8)
  ctx.lineTo(22, 6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  const gems = ['#E2553B', '#3B86E2', '#3FA796']
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = gems[i + 1]
    ctx.beginPath()
    ctx.arc(i * 11, 1, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// 喂食时嘴前的小肉块
function drawFood() {
  const t = lion.foodT
  const bite = t < 1.3 ? Math.sin(t * 12) * 0.06 : 0
  const shrink = clamp(1 - t / 1.9, 0.12, 1) // 一口口吃掉,越来越小
  const x = 8
  const y = -56
  ctx.save()
  ctx.translate(x, y)
  ctx.scale((1 + bite) * shrink, (1 - bite) * shrink)
  ctx.fillStyle = '#C8743C'
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2
  roundedBlob(0, 0, 18, 13, 6)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#F2E7D2'
  ctx.beginPath()
  ctx.arc(9, -5, 4, 0, Math.PI * 2)
  ctx.arc(9, 5, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHearts() {
  for (const h of lion.hearts) {
    const a = clamp(1 - h.life / h.ttl, 0, 1)
    const sz = 7 + h.life * 6
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = '#FF6B81'
    ctx.translate(h.x, h.y)
    ctx.beginPath()
    ctx.moveTo(0, sz * 0.3)
    ctx.bezierCurveTo(sz * 0.5, -sz * 0.4, sz, sz * 0.2, 0, sz)
    ctx.bezierCurveTo(-sz, sz * 0.2, -sz * 0.5, -sz * 0.4, 0, sz * 0.3)
    ctx.fill()
    ctx.restore()
  }
}

// 比心时头顶脉动的大爱心
function drawBigHeart() {
  const cx = lion.x
  const cy = lion.y - 134 * lion.size
  const pulse = 1 + Math.sin(lion.stateTime * 7) * 0.13
  const sz = 24 * lion.size * pulse
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = '#FF5C77'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, sz * 0.32)
  ctx.bezierCurveTo(sz * 0.55, -sz * 0.5, sz * 1.05, sz * 0.25, 0, sz)
  ctx.bezierCurveTo(-sz * 1.05, sz * 0.25, -sz * 0.55, -sz * 0.5, 0, sz * 0.32)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.beginPath()
  ctx.ellipse(-sz * 0.32, -sz * 0.02, sz * 0.16, sz * 0.1, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// 生气时头顶的「💢」青筋符号
function drawAngerMark() {
  const cx = lion.x + 34 * lion.size
  const cy = lion.y - 130 * lion.size
  const pop = clamp(lion.stateTime * 4, 0, 1)
  const r = 11 * lion.size * (0.6 + 0.4 * pop)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = COLOR.anger
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  // 放射状的爆发线
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI
    ctx.beginPath()
    ctx.moveTo(-Math.cos(a) * r, -Math.sin(a) * r)
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    ctx.stroke()
  }
  ctx.restore()
}

// 生气时鼻孔喷出的两股气(像气鼓鼓的牛)
function drawAngerSteam() {
  const s = lion.size
  const cx = lion.x
  const cy = lion.y - 86 * s
  ctx.save()
  ctx.strokeStyle = 'rgba(210,210,220,0.78)'
  ctx.lineWidth = 2.4 * s
  ctx.lineCap = 'round'
  for (const dir of [-1, 1]) {
    const puff = (lion.stateTime * 3 + (dir > 0 ? 0 : 0.5)) % 1
    const x0 = cx + dir * 9 * s
    ctx.globalAlpha = clamp(1 - puff, 0, 1) * 0.8
    ctx.beginPath()
    ctx.moveTo(x0, cy)
    ctx.quadraticCurveTo(x0 + dir * (4 + puff * 8) * s, cy + (6 + puff * 8) * s, x0 + dir * puff * 14 * s, cy + (16 + puff * 16) * s)
    ctx.stroke()
  }
  ctx.restore()
}

// 思考时头顶脉动的问号
function drawQuestion() {
  const cx = lion.x + 36 * lion.size
  const cy = lion.y - 146 * lion.size
  const pulse = 1 + Math.sin(lion.stateTime * 5) * 0.14
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(pulse * lion.size, pulse * lion.size)
  ctx.fillStyle = COLOR.think
  ctx.font = 'bold 36px PingFang SC, "Heiti SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', 0, 0)
  ctx.restore()
}

// 跺脚时脚边扬起的尘土冲击线
function drawStompDust() {
  const spread = 0.55 + 0.45 * Math.abs(Math.sin(lion.stateTime * 8))
  ctx.save()
  ctx.strokeStyle = 'rgba(150,110,60,0.55)'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  const baseY = groundY + 1
  for (const dir of [-1, 1]) {
    const bx = lion.x + dir * 28 * lion.size
    ctx.beginPath()
    ctx.moveTo(bx, baseY)
    ctx.lineTo(bx + dir * 16 * spread, baseY - 12 * spread)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx + dir * 5, baseY)
    ctx.lineTo(bx + dir * 20 * spread, baseY - 4 * spread)
    ctx.stroke()
    ctx.fillStyle = 'rgba(150,110,60,0.4)'
    ctx.beginPath()
    ctx.arc(bx + dir * 18 * spread, baseY - 13 * spread, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawZzz() {
  const baseX = lion.x + 40 * lion.size
  const baseY = lion.y - 120 * lion.size
  ctx.save()
  ctx.fillStyle = 'rgba(90,120,200,0.85)'
  for (let i = 0; i < 3; i++) {
    const t = (now * 0.6 + i * 0.33) % 1
    ctx.globalAlpha = clamp(1 - t, 0, 1)
    ctx.font = `bold ${14 + i * 4}px PingFang SC, sans-serif`
    ctx.fillText('Z', baseX + i * 12 + Math.sin(t * 6) * 3, baseY - t * 36)
  }
  ctx.restore()
}

// 蝴蝶(扑蝶玩具,翅膀扇动)
function drawButterfly() {
  if (!butterfly) return
  const b = butterfly
  const flap = Math.sin(b.t * 12) * 0.5 + 0.5 // 0..1 扇翅
  ctx.save()
  ctx.translate(b.x, b.y)
  // 身体
  ctx.fillStyle = '#5A3A2A'
  ctx.beginPath()
  ctx.ellipse(0, 0, 2.2, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  // 翅膀(左右,用水平缩放模拟扇动)
  const wing = 0.35 + flap * 0.65
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.scale(side * wing, 1)
    ctx.fillStyle = '#FF9CC6'
    ctx.beginPath()
    ctx.ellipse(7, -3, 7, 5, 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFC1DC'
    ctx.beginPath()
    ctx.ellipse(6, 5, 5, 4, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // 触角
  ctx.strokeStyle = '#5A3A2A'
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -6)
  ctx.lineTo(-3, -11)
  ctx.moveTo(0, -6)
  ctx.lineTo(3, -11)
  ctx.stroke()
  ctx.restore()
}

// 毛线球(自玩玩具,滚动旋转 + 消失淡出)
function drawBall() {
  if (!ball) return
  const a = ball.alive ? 1 : clamp(ball.fade, 0, 1)
  if (a <= 0) return
  const by = groundY - ball.r
  // 影子
  ctx.save()
  ctx.globalAlpha = a * 0.5
  ctx.fillStyle = COLOR.shadow
  ctx.beginPath()
  ctx.ellipse(ball.x, groundY + 3, ball.r * 1.1, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(ball.x, by)
  ctx.rotate(ball.rot)
  ctx.fillStyle = '#F47C9A'
  ctx.strokeStyle = 'rgba(150,40,70,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(0, 0, ball.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // 毛线缠绕纹
  ctx.beginPath()
  ctx.ellipse(0, 0, ball.r, ball.r * 0.45, 0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, 0, ball.r, ball.r * 0.45, -0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, 0, ball.r * 0.5, ball.r, 0.2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// 衔回飞盘
function drawDisc() {
  if (!disc) return
  const d = disc
  let a = 1
  if (d.state === 'drop') a = clamp(1 - (d.settleT - 2.5) / 1, 0, 1)
  if (a <= 0) return
  // 影子(在地面上时)
  if (d.state === 'ground' || d.state === 'drop') {
    ctx.save()
    ctx.globalAlpha = a * 0.5
    ctx.fillStyle = COLOR.shadow
    ctx.beginPath()
    ctx.ellipse(d.x, groundY + 3, 17, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(d.x, d.y)
  ctx.rotate(0.18 * Math.sin(d.rot * 0.7))
  ctx.fillStyle = '#36B7E0'
  ctx.strokeStyle = 'rgba(20,80,110,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.beginPath()
  ctx.ellipse(0, -1.5, 11, 4.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // 随旋转移动的小标记
  ctx.fillStyle = '#E8801F'
  ctx.beginPath()
  ctx.ellipse(Math.cos(d.rot) * 9, -1, 2.4, 1.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// 追尾转晕:头顶绕圈的小星星
function drawDizzyStars() {
  const cx = lion.x
  const cy = lion.y - 150 * lion.size
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = '#FFD24A'
  for (let i = 0; i < 3; i++) {
    const a = lion.stateTime * 6 + (i / 3) * Math.PI * 2
    ctx.save()
    ctx.translate(Math.cos(a) * 20, Math.sin(a) * 7)
    drawSparkle(4.5)
    ctx.restore()
  }
  ctx.restore()
}

// 疯跑:身后的速度线
function drawSpeedLines() {
  const dir = lion.facing
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  const baseX = lion.x - dir * 40 * lion.size
  for (let i = 0; i < 3; i++) {
    const y = lion.y - (30 + i * 26) * lion.size
    const len = 16 + (i % 2) * 10
    const jitter = Math.sin(lion.walkPhase + i) * 4
    ctx.beginPath()
    ctx.moveTo(baseX + jitter, y)
    ctx.lineTo(baseX - dir * len + jitter, y)
    ctx.stroke()
  }
  ctx.restore()
}

// 嗅探:鼻尖前方升起的小尘团
function drawSniffPuffs() {
  const dir = lion.facing
  const bx = lion.x + dir * 34 * lion.size
  const by = groundY - 4
  ctx.save()
  ctx.fillStyle = 'rgba(170,150,120,0.5)'
  for (let i = 0; i < 3; i++) {
    const ph = (lion.stateTime * 1.5 + i * 0.4) % 1
    const r = 2 + ph * 5
    ctx.globalAlpha = clamp(0.45 - ph * 0.45, 0, 0.45)
    ctx.beginPath()
    ctx.arc(bx + dir * ph * 16, by - ph * 14, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// 打闹烟雾云:覆盖在正在 playtussle 的一对宠物中间(只由 tussle1 触发,避免画两遍)
function drawTussleCloud(p) {
  const m = p.mate
  if (!m) return
  const cx = (p.x + m.x) / 2
  const cy = Math.min(p.y, m.y) - 46 * p.size
  const t = p.stateTime
  ctx.save()
  ctx.translate(cx + Math.sin(t * 30) * 3, cy + Math.cos(t * 26) * 2)
  ctx.scale(p.size, p.size)
  // 烟雾团:一圈交叠的白灰圆
  ctx.strokeStyle = 'rgba(150,140,130,0.5)'
  ctx.lineWidth = 2
  ctx.fillStyle = 'rgba(245,243,238,0.96)'
  const puffs = [[-34, 6, 20], [-18, -12, 18], [2, -18, 20], [22, -12, 18], [36, 4, 18], [20, 16, 18], [-2, 18, 20], [-22, 16, 18]]
  for (const pf of puffs) {
    const wob = 1 + Math.sin(t * 18 + pf[0]) * 0.08
    ctx.beginPath()
    ctx.arc(pf[0], pf[1], pf[2] * wob, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 30, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // 偶尔从云里探出的小爪子
  ctx.fillStyle = COLOR.limb
  ctx.strokeStyle = COLOR.line
  ctx.lineWidth = 2
  const pawA = Math.sin(t * 9)
  if (pawA > 0.3) { ctx.beginPath(); ctx.arc(-30, -10 - pawA * 6, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  const pawB = Math.sin(t * 9 + 2.2)
  if (pawB > 0.3) { ctx.beginPath(); ctx.arc(30, -10 - pawB * 6, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  // 打闹符号:星星 / 火花绕圈蹦
  for (let i = 0; i < 4; i++) {
    const a = t * 7 + (i / 4) * Math.PI * 2
    ctx.save()
    ctx.translate(Math.cos(a) * 32, Math.sin(a) * 20)
    ctx.fillStyle = i % 2 ? '#FFD24A' : '#FF7A6E'
    drawSparkle(5 + Math.sin(t * 12 + i) * 1.5)
    ctx.restore()
  }
  ctx.restore()
}

function drawTussles() {
  for (const p of pets) {
    if (p.state === 'playtussle' && p.playRole === 'tussle1') drawTussleCloud(p)
  }
}

// 状态面板:每只宠物头顶的紧凑卡片(❤心情 / 🍖饱腹 / 🤝亲密 三条迷你进度条)
function drawStats() {
  if (!showStats || focusActive) return // 专注时隐藏,保持简洁
  const rows = [
    { icon: '❤', key: 'mood', col: '#FF6B81' },
    { icon: '🍖', key: 'hunger', col: '#F4AE33' },
    { icon: '🤝', key: 'bond', col: '#7FB3FF' },
  ]
  for (const p of pets) {
    const w = 78
    const h = 34
    const cx = clamp(p.x, w / 2 + 6, W - w / 2 - 6)
    const cy = p.y - 190 * p.size
    const x = cx - w / 2
    const y = cy - h / 2
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = 'rgba(180,140,80,0.5)'
    ctx.lineWidth = 1.5
    roundedRect(x, y, w, h, 8)
    ctx.fill()
    ctx.stroke()
    ctx.font = '9px PingFang SC, "Heiti SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < rows.length; i++) {
      const ry = y + 8 + i * 9
      ctx.fillStyle = '#6B3A1E'
      ctx.fillText(rows[i].icon, x + 5, ry)
      const bx = x + 21
      const bw = w - 28
      ctx.fillStyle = 'rgba(0,0,0,0.10)'
      roundedRect(bx, ry - 2.5, bw, 5, 2.5)
      ctx.fill()
      ctx.fillStyle = rows[i].col
      roundedRect(bx, ry - 2.5, bw * clamp((p[rows[i].key] || 0) / 100, 0, 1), 5, 2.5)
      ctx.fill()
    }
    ctx.restore()
  }
}

// 专注模式:领头宠物头顶的番茄钟倒计时(药丸 + 进度条)
function drawFocusTimer() {
  if (!focusActive) return
  const p = activePet || pets[0]
  if (!p) return
  const remain = Math.max(0, focusEndT - now)
  const mm = Math.floor(remain / 60)
  const ss = Math.floor(remain % 60)
  const label = `🍅 专注 ${mm}:${ss < 10 ? '0' + ss : ss}`
  ctx.font = 'bold 14px PingFang SC, "Heiti SC", sans-serif'
  const tw = ctx.measureText(label).width
  const w = tw + 26
  const h = 26
  const cx = clamp(p.x, w / 2 + 8, W - w / 2 - 8)
  const cy = p.y - 182 * p.size
  const x = cx - w / 2
  const y = cy - h / 2
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.strokeStyle = '#E8801F'
  ctx.lineWidth = 2
  roundedRect(x, y, w, h, 13)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#C9621E'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, y + h / 2 - 3)
  // 进度条(已专注的比例)
  const prog = clamp(1 - remain / (focusDurMin * 60), 0, 1)
  const bw = w - 16
  const bx = cx - bw / 2
  const by = y + h - 6
  ctx.fillStyle = 'rgba(232,128,31,0.18)'
  roundedRect(bx, by, bw, 3.5, 1.75)
  ctx.fill()
  ctx.fillStyle = '#F4AE33'
  roundedRect(bx, by, bw * prog, 3.5, 1.75)
  ctx.fill()
  ctx.restore()
}

// 对话气泡
function drawBubble() {
  if (now > lion.bubbleUntil || !lion.bubbleText) return
  const text = lion.bubbleText
  ctx.font = 'bold 15px PingFang SC, "Heiti SC", sans-serif'
  const tw = ctx.measureText(text).width
  const padX = 14
  const w = tw + padX * 2
  const h = 30
  const cx = clamp(lion.x, w / 2 + 8, W - w / 2 - 8)
  const cy = lion.y - 150 * lion.size - 6
  const x = cx - w / 2
  const y = cy - h / 2

  const appear = clamp((lion.bubbleUntil - now) > 2.2 ? (2.6 - (lion.bubbleUntil - now)) / 0.4 : 1, 0, 1)
  const sc = 0.7 + 0.3 * easeOutBack(appear)
  ctx.save()
  ctx.translate(cx, cy + 6)
  ctx.scale(sc, sc)
  ctx.translate(-cx, -(cy + 6))

  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.strokeStyle = '#FFC53D'
  ctx.lineWidth = 2.5
  roundedRect(x, y, w, h, 13)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 7, y + h - 1)
  ctx.lineTo(cx, y + h + 10)
  ctx.lineTo(cx + 7, y + h - 1)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.fill()
  ctx.strokeStyle = '#FFC53D'
  ctx.stroke()

  ctx.fillStyle = '#6B3A1E'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, y + h / 2 + 1)
  ctx.restore()
}

/* ---- 形状辅助 ---- */
function roundedRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function roundedBlob(cx, cy, w, h, r) {
  roundedRect(cx - w / 2, cy - h / 2, w, h, r)
}

function drawFluffBall(cx, cy, R, r) {
  ctx.beginPath()
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    ctx.moveTo(cx + Math.cos(a) * R + r, cy + Math.sin(a) * R)
    ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
}

/* =========================================================
 * 7. 主循环
 * =======================================================*/
function frame(t) {
  now = t / 1000
  const dt = Math.min(0.05, now - (frame.last || now))
  frame.last = now
  update(dt)
  draw()
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)

// 初始化
resize()
lion.x = W * 0.5
lion.y = groundY
lion.size = Math.max(0.85, Math.min(1.25, W / 1440)) // 大屏稍大
lastTimeSlot = timeSlot(new Date().getHours()) // 记录启动时段,之后跨时段才问候
if (new Date().getMonth() === 11) lion.accessory = 'santa' // 12 月自动戴上圣诞帽
fxType = autoFx() // 按季节 / 时间自动选氛围特效
loadState() // 恢复上次的位置 / 心情 / 饥饿 / 帽子 / 音效 / 特效
if (hasNative && window.petAPI.setFx) window.petAPI.setFx(fxType) // 同步初始特效给右键菜单
say('嗨~我是小狮子,陪你一起办公啦!', 4)
requestAnimationFrame(frame)

// 供预览页 / 调试触发指定动作(对正式运行无副作用)
window.__pet = {
  dance: doDance,
  roll: doRoll,
  chase: doChase,
  fetch: doFetch,
  loveyou: doLoveYou,
  angry: doAngry,
  stomp: doStomp,
  think: doThink,
  yawn: doYawn,
  hat: cycleAccessory,
  accessory: cycleAccessory,
  sound: toggleSound,
  fx: cycleFx,
  stats: toggleStats,
  species: cycleSpecies,
  focus: toggleFocus,
  addpet: addPet,
  removepet: removePet,
  feed: doFeed,
  eat: doFeed,
  pet: doPet,
  stretch: doStretch,
  shake: doShake,
  groom: doGroom,
  scratch: doScratch,
  sniff: doSniff,
  tailchase: doTailChase,
  zoomies: doZoomies,
  pounce: doPounce,
  playball: doPlayBall,
  pets,
  get lion() {
    return lion
  },
}
